import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  try {
    // Budget check
    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { template_body, template_subject, prospect_id } = await request.json()

    if (!template_body || !prospect_id) {
      return Response.json({ error: 'template_body et prospect_id requis' }, { status: 400 })
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

    // Load recent activities
    const { data: activities } = await supabase
      .from('activities')
      .select('type, content, created_at')
      .eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false })
      .limit(5)

    // Load business context
    const { data: bizCtx } = await supabase
      .from('business_context')
      .select('company_name, company_description, products, tone_and_style')
      .limit(1)
      .single()

    const model = resolveModel('personalize-template')
    const client = getAnthropicClient()

    const activitiesSummary = activities?.length
      ? activities.map(a => `- [${a.type}] ${a.content?.substring(0, 100)}`).join('\n')
      : 'Aucune activite recente'

    const prompt = `Tu es un assistant commercial expert. Personnalise ce template email pour le prospect ci-dessous.

PROSPECT:
- Nom: ${prospect.prenom} ${prospect.nom}
- Entreprise: ${prospect.entreprise || 'N/A'}
- Fonction: ${prospect.fonction || 'N/A'}
- Stage: ${prospect.pipeline_stage}
- Source: ${prospect.source || 'N/A'}
- Notes: ${prospect.notes || 'Aucune'}

ACTIVITES RECENTES:
${activitiesSummary}

CONTEXTE ENTREPRISE:
${bizCtx?.company_name ? `- Entreprise: ${bizCtx.company_name}` : ''}
${bizCtx?.products ? `- Produits: ${bizCtx.products.substring(0, 200)}` : ''}
${bizCtx?.tone_and_style ? `- Style: ${bizCtx.tone_and_style.substring(0, 200)}` : ''}

TEMPLATE A PERSONNALISER:
${template_subject ? `Objet: ${template_subject}\n` : ''}Corps:
${template_body}

INSTRUCTIONS:
- Garde la structure et le format HTML du template
- Adapte les references, exemples et accroches au prospect
- Remplace les variables {prenom}, {nom}, {entreprise}, {fonction} si elles sont encore presentes
- Ne change pas la signature ni les elements structurels
- Reste naturel et professionnel
- Retourne UNIQUEMENT le HTML personnalise, sans explication`

    const response = await client.messages.create({
      model: model.apiModelId,
      max_tokens: model.maxOutputTokens,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const personalizedHtml = textBlock?.text || template_body

    // Log usage
    logApiUsage({
      endpoint: 'personalize-template',
      model: model.id,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    return Response.json({
      body_html: personalizedHtml,
      subject: template_subject,
      model: model.displayName,
    })
  } catch (error) {
    const message = parseAnthropicError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
