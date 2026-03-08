import { supabase } from '@/lib/supabase'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'

/**
 * AI Email Generation — generates a personalized email to share content with a prospect.
 *
 * POST /api/ai/generate-email
 * Body: { prospect_id, content_id, tone?, context? }
 */
export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { prospect_id, content_id, tone, context: extraContext } = await request.json()

    if (!prospect_id || !content_id) {
      return Response.json({ error: 'prospect_id et content_id requis' }, { status: 400 })
    }

    // Load prospect
    const { data: prospect } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single()

    if (!prospect) {
      return Response.json({ error: 'Prospect non trouve' }, { status: 404 })
    }

    // Load content
    const { data: content } = await supabase
      .from('contents')
      .select('*')
      .eq('id', content_id)
      .single()

    if (!content) {
      return Response.json({ error: 'Contenu non trouve' }, { status: 404 })
    }

    // Load recent emails for context
    const { data: recentEmails } = await supabase
      .from('emails')
      .select('subject, body_preview, direction, gmail_date')
      .eq('prospect_id', prospect_id)
      .order('gmail_date', { ascending: false })
      .limit(3)

    // Load business context
    const { data: bizContext } = await supabase
      .from('business_context')
      .select('company_name, tone_and_style, email_templates')
      .limit(1)
      .single()

    const prospectInfo = [
      `Destinataire: ${prospect.prenom} ${prospect.nom}`,
      prospect.entreprise && `Entreprise: ${prospect.entreprise}`,
      prospect.fonction && `Fonction: ${prospect.fonction}`,
      `Stage: ${prospect.pipeline_stage}`,
    ].filter(Boolean).join('\n')

    const contentInfo = [
      `Contenu a partager: "${content.title}"`,
      `Type: ${content.content_type}`,
      content.url && `URL: ${content.url}`,
      content.body && `Resume du contenu: ${content.body.slice(0, 500)}`,
    ].filter(Boolean).join('\n')

    const emailHistory = (recentEmails || []).map(e => {
      const dir = e.direction === 'sent' ? 'Nous avons envoye' : 'Il/elle a repondu'
      return `- ${dir}: "${e.subject || '(sans objet)'}" — ${(e.body_preview || '').slice(0, 100)}`
    }).join('\n')

    const toneInstruction = tone
      ? `Ton souhaite: ${tone}`
      : bizContext?.tone_and_style
        ? `Style prefere: ${bizContext.tone_and_style}`
        : 'Ton: professionnel mais chaleureux, tutoiement si relation existante'

    const model = resolveModel('generate-email')
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 600,
      system: `Tu es un commercial B2B de ${bizContext?.company_name || 'Boost Inc.'}, specialise dans la distribution automatique et le retail connecte. Tu rediges des emails de prospection/nurturing en francais.

Regles:
- Email court et percutant (max 150 mots)
- Personnalise en fonction du profil du prospect
- Integre le contenu de maniere naturelle (pas un spam)
- Inclus un CTA clair mais pas agressif
- Signe "Louis" sauf si indique autrement
- ${toneInstruction}

Reponds UNIQUEMENT en JSON valide:
{"subject": "Objet de l'email", "body_html": "<p>Corps de l'email en HTML simple</p>", "body_text": "Version texte brut"}`,
      messages: [
        {
          role: 'user',
          content: [
            prospectInfo,
            '',
            contentInfo,
            '',
            emailHistory ? `Historique recent des echanges:\n${emailHistory}` : 'Pas d\'echanges precedents.',
            extraContext ? `\nContexte supplementaire: ${extraContext}` : '',
            '',
            'Genere un email de nurturing qui partage ce contenu avec ce prospect.',
          ].join('\n'),
        },
      ],
    })

    logApiUsage({
      endpoint: 'generate-email',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    let rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) rawText = fenceMatch[1].trim()

    const parsed = JSON.parse(rawText)

    return Response.json({
      subject: parsed.subject || '',
      body_html: parsed.body_html || '',
      body_text: parsed.body_text || '',
    })
  } catch (error) {
    const parsed = parseAnthropicError(error)
    return Response.json({ error: parsed }, { status: 500 })
  }
}
