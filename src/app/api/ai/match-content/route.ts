import { supabase } from '@/lib/supabase'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'

/**
 * AI Content Matching — suggests 1-3 relevant contents for a prospect.
 *
 * POST /api/ai/match-content
 * Body: { prospect_id }
 */
export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { prospect_id } = await request.json()

    if (!prospect_id) {
      return Response.json({ error: 'prospect_id requis' }, { status: 400 })
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

    // Load prospect activities (recent)
    const { data: activities } = await supabase
      .from('activities')
      .select('type, content, created_at')
      .eq('prospect_id', prospect_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Load prospect emails (recent)
    const { data: emails } = await supabase
      .from('emails')
      .select('subject, body_preview, direction, gmail_date')
      .eq('prospect_id', prospect_id)
      .order('gmail_date', { ascending: false })
      .limit(5)

    // Load all contents
    const { data: contents } = await supabase
      .from('contents')
      .select('*')
      .order('created_at', { ascending: false })

    if (!contents || contents.length === 0) {
      return Response.json({ suggestions: [], message: 'Aucun contenu disponible' })
    }

    // Build prospect context
    const prospectContext = [
      `Prospect: ${prospect.prenom} ${prospect.nom}`,
      prospect.entreprise && `Entreprise: ${prospect.entreprise}`,
      prospect.fonction && `Fonction: ${prospect.fonction}`,
      `Stage pipeline: ${prospect.pipeline_stage}`,
      prospect.categorie && `Categorie: ${prospect.categorie}`,
      prospect.source && `Source: ${prospect.source}`,
      prospect.notes && `Notes: ${prospect.notes.slice(0, 200)}`,
    ].filter(Boolean).join('\n')

    const activityContext = (activities || []).slice(0, 5).map(a => {
      const date = new Date(a.created_at).toLocaleDateString('fr-FR')
      return `- ${date} [${a.type}]: ${(a.content || '').slice(0, 100)}`
    }).join('\n')

    const emailContext = (emails || []).slice(0, 3).map(e => {
      const dir = e.direction === 'sent' ? 'Envoye' : 'Recu'
      return `- ${dir}: "${e.subject || '(sans objet)'}" — ${(e.body_preview || '').slice(0, 80)}`
    }).join('\n')

    // Build content list
    const contentList = contents.map((c, i) => {
      return `[${i}] "${c.title}" (${c.content_type}) — themes: ${(c.themes || []).join(', ')} | produits: ${(c.products || []).join(', ')} | stages: ${(c.pipeline_stages || []).join(', ')}`
    }).join('\n')

    const model = resolveModel('match-content')
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 400,
      system: `Tu es un assistant commercial B2B. Tu dois selectionner 1 a 3 contenus pertinents a partager avec un prospect, en fonction de son profil, son stage dans le pipeline, et ses interactions recentes.

Reponds UNIQUEMENT en JSON valide:
[{"index": 0, "relevance_score": 85, "reason": "Explication courte"}]

Score de 0 a 100. Ne suggere que des contenus vraiment pertinents (score > 50).`,
      messages: [
        {
          role: 'user',
          content: `Profil du prospect:\n${prospectContext}\n\nActivites recentes:\n${activityContext || 'Aucune'}\n\nEmails recents:\n${emailContext || 'Aucun'}\n\nContenus disponibles:\n${contentList}\n\nQuels contenus sont les plus pertinents pour ce prospect ?`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'match-content',
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

    const parsed = JSON.parse(rawText) as Array<{
      index: number
      relevance_score: number
      reason: string
    }>

    const suggestions = parsed
      .filter(s => s.index >= 0 && s.index < contents.length && s.relevance_score > 50)
      .slice(0, 3)
      .map(s => ({
        content: contents[s.index],
        relevance_score: s.relevance_score,
        reason: s.reason,
      }))

    return Response.json({ suggestions })
  } catch (error) {
    const parsed = parseAnthropicError(error)
    return Response.json({ error: parsed }, { status: 500 })
  }
}
