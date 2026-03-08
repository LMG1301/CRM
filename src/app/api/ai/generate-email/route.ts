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

    // Load recent emails + activities + business context in parallel
    const [emailsResult, activitiesResult, bizResult] = await Promise.all([
      supabase
        .from('emails')
        .select('subject, body_preview, direction, gmail_date')
        .eq('prospect_id', prospect_id)
        .order('gmail_date', { ascending: false })
        .limit(3),
      supabase
        .from('activities')
        .select('type, content, created_at')
        .eq('prospect_id', prospect_id)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('business_context')
        .select('company_name, tone_and_style, email_templates')
        .limit(1)
        .single(),
    ])

    const recentEmails = emailsResult.data
    const recentActivities = activitiesResult.data
    const bizContext = bizResult.data

    const prospectInfo = [
      `Destinataire: ${prospect.prenom} ${prospect.nom}`,
      prospect.entreprise && `Entreprise: ${prospect.entreprise}`,
      prospect.fonction && `Fonction: ${prospect.fonction}`,
      `Stage: ${prospect.pipeline_stage}`,
    ].filter(Boolean).join('\n')

    const contentInfo = [
      `Contenu a partager: "${content.title}"`,
      `Type: ${content.content_type}`,
      content.url && `URL du contenu: ${content.url}`,
      content.body && `Resume du contenu: ${content.body.slice(0, 500)}`,
    ].filter(Boolean).join('\n')

    const emailHistory = (recentEmails || []).map(e => {
      const dir = e.direction === 'sent' ? 'Nous avons envoye' : 'Il/elle a repondu'
      return `- ${dir}: "${e.subject || '(sans objet)'}" — ${(e.body_preview || '').slice(0, 100)}`
    }).join('\n')

    const activityHistory = (recentActivities || []).map(a => {
      return `- ${a.type}: ${(a.content || '').slice(0, 120)}`
    }).join('\n')

    const toneInstruction = tone
      ? `Ton souhaite: ${tone}`
      : bizContext?.tone_and_style
        ? `Style prefere: ${bizContext.tone_and_style}`
        : 'Ton: professionnel mais chaleureux, tutoiement si relation existante'

    // Build content URL rule
    const contentUrlRule = content.url
      ? `- Tu DOIS inclure ce lien dans le corps de l'email : ${content.url}. Integre-le naturellement (ex: "J'ai publie un article sur ce sujet : [lien]" ou "Voici une ressource qui pourrait vous interesser : [lien]").`
      : ''

    const model = resolveModel('generate-email')
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 600,
      system: `Tu es Louis Matar, Business Development chez ${bizContext?.company_name || 'Boost Inc.'}, specialise dans la distribution automatique et le retail connecte. Tu rediges des emails de nurturing en francais.

Regles strictes:
- Email court et percutant (max 150 mots, 3 paragraphes max)
- Personnalise en fonction du profil ET de l'historique des echanges
${contentUrlRule}
- CTA clair : propose un echange, un appel, ou renvoie vers le contenu
- ${toneInstruction}

Anti-patterns (INTERDIT) :
- Ne commence JAMAIS par "J'espere que vous allez bien", "Suite a notre dernier echange", "Je me permets de", "Je reviens vers vous"
- Ouvre DIRECTEMENT par la valeur : un fait sectoriel, une question pertinente, un insight lie au contenu

Signature obligatoire (a inclure dans body_html et body_text) :
Louis Matar
Business Development
Boost Inc.

Reponds UNIQUEMENT en JSON valide:
{"subject": "Objet de l'email", "body_html": "<p>Corps HTML avec signature</p>", "body_text": "Version texte brut avec signature"}`,
      messages: [
        {
          role: 'user',
          content: [
            prospectInfo,
            '',
            contentInfo,
            '',
            emailHistory ? `Historique emails recents:\n${emailHistory}` : 'Pas d\'echanges email precedents.',
            activityHistory ? `\nDernieres activites/notes:\n${activityHistory}` : '',
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
