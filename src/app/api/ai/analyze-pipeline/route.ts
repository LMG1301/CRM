import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'

/**
 * AI Pipeline Analysis — Analyzes prospect interactions and
 * automatically determines the appropriate pipeline stage.
 *
 * POST /api/ai/analyze-pipeline
 * Body: { prospect_id?: string, model?: string }
 */

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    // Budget enforcement
    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    // Check auth
    const secret = request.headers.get('x-webhook-secret')
    const isInternal = request.headers.get('x-internal') === 'true'
    if (!isInternal && secret !== process.env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { prospect_id?: string; model?: string } = {}
    try {
      body = await request.json()
    } catch {
      // Empty body = analyze recent
    }

    let prospectIds: string[] = []

    if (body.prospect_id) {
      prospectIds = [body.prospect_id]
    } else {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)

      const { data } = await supabase
        .from('activities')
        .select('prospect_id')
        .gte('created_at', yesterday.toISOString())
        .not('prospect_id', 'is', null)

      if (data) {
        const uniqueIds = [...new Set(data.map((a) => a.prospect_id))]
        prospectIds = uniqueIds.filter(Boolean) as string[]
      }
    }

    if (prospectIds.length === 0) {
      return Response.json({ message: 'No prospects to analyze', analyzed: 0 })
    }

    const toAnalyze = prospectIds.slice(0, 10)
    const results: Array<{
      prospect_id: string
      name: string
      old_stage: string
      new_stage: string
      reason: string
      next_action: string
    }> = []

    for (const prospectId of toAnalyze) {
      try {
        const result = await analyzeProspect(prospectId, body.model)
        if (result) results.push(result)
      } catch (err) {
        console.error(`AI analysis failed for ${prospectId}:`, err)
      }
    }

    return Response.json({
      analyzed: results.length,
      changes: results.filter((r) => r.old_stage !== r.new_stage),
      results,
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

async function analyzeProspect(prospectId: string, requestedModel?: string) {
  const { data: prospect } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .single()

  if (!prospect) return null

  // Fetch pipeline stages from DB for dynamic descriptions and terminal check
  const { data: pipeStages } = await supabase
    .from('pipeline_stages')
    .select('slug, name, is_terminal')
    .order('position')

  const terminalSlugs = (pipeStages || []).filter(s => s.is_terminal).map(s => s.slug)

  // Skip terminal stages — no analysis needed
  if (terminalSlugs.includes(prospect.pipeline_stage)) {
    return null
  }

  // Build stage descriptions dynamically
  const stageDescriptions = (pipeStages || [])
    .map(s => `- "${s.slug}" : ${s.name}${s.is_terminal ? ' (terminal)' : ''}`)
    .join('\n')
  const STAGE_DESCRIPTIONS_DYNAMIC = `Les stages du pipeline commercial (du plus froid au plus chaud) :\n${stageDescriptions}`

  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(20)

  const { data: emails } = await supabase
    .from('emails')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('gmail_date', { ascending: false })
    .limit(20)

  const context = buildAnalysisContext(prospect, activities || [], emails || [])

  const model = resolveModel('analyze-pipeline', requestedModel)
  const anthropic = getAnthropicClient()

  const response = await anthropic.messages.create({
    model: model.apiModelId,
    max_tokens: 400,
    system: `Tu es un assistant commercial qui analyse les interactions avec un prospect pour determiner son stage dans le pipeline. Tu dois repondre UNIQUEMENT en JSON valide, sans markdown.

${STAGE_DESCRIPTIONS_DYNAMIC}

Reponds avec ce format JSON exact :
{"stage": "slug_du_stage", "reason": "Explication courte en 1 phrase", "next_action": "Action concrete suggeree (ex: Envoyer relance email, Planifier call decouverte, Envoyer devis)"}`,
    messages: [
      {
        role: 'user',
        content: `Analyse ce prospect et determine son stage optimal dans le pipeline :\n\n${context}\n\nQuel est le stage le plus adapte ? Reponds en JSON.`,
      },
    ],
  })

  logApiUsage({
    endpoint: 'analyze-pipeline',
    model: model.apiModelId,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
  })

  // Parse response
  let rawText = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    rawText = fenceMatch[1].trim()
  }

  let parsed: { stage: string; reason: string; next_action?: string }

  try {
    parsed = JSON.parse(rawText)
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/)
    if (match) {
      parsed = JSON.parse(match[0])
    } else {
      return null
    }
  }

  const oldStage = prospect.pipeline_stage
  const suggestedStage = parsed.stage

  // DISABLED — AI analysis now ONLY suggests a stage, never applies it automatically.
  // pipeline_stage is ONLY changed by user action (drag & drop or stage selector).
  // The suggestion is returned in the API response for the UI to present to the user.

  return {
    prospect_id: prospectId,
    name: `${prospect.prenom} ${prospect.nom}`,
    old_stage: oldStage,
    new_stage: suggestedStage,
    suggested: suggestedStage !== oldStage,
    reason: parsed.reason,
    next_action: parsed.next_action || '',
  }
}

function buildAnalysisContext(
  prospect: Record<string, unknown>,
  activities: Array<Record<string, unknown>>,
  emails: Array<Record<string, unknown>>,
): string {
  const lines: string[] = []

  lines.push(`Prospect : ${prospect.prenom} ${prospect.nom}`)
  if (prospect.entreprise) lines.push(`Entreprise : ${prospect.entreprise}`)
  if (prospect.fonction) lines.push(`Fonction : ${prospect.fonction}`)
  lines.push(`Stage actuel : ${prospect.pipeline_stage}`)
  if (prospect.date_premier_contact) lines.push(`Premier contact : ${prospect.date_premier_contact}`)
  if (prospect.date_dernier_contact) lines.push(`Dernier contact : ${prospect.date_dernier_contact}`)

  const sentEmails = emails.filter((e) => e.direction === 'sent').length
  const receivedEmails = emails.filter((e) => e.direction === 'received').length
  lines.push(`\nEmails : ${sentEmails} envoyes, ${receivedEmails} recus`)

  if (emails.length > 0) {
    lines.push('\nDerniers emails :')
    for (const email of emails.slice(0, 10)) {
      const date = new Date(email.gmail_date as string).toLocaleDateString('fr-FR')
      const dir = email.direction === 'sent' ? '→ Envoye' : '← Recu'
      const subject = email.subject || '(sans objet)'
      const preview = ((email.body_preview as string) || '').substring(0, 100)
      lines.push(`- ${date} ${dir} : "${subject}" — ${preview}`)
    }
  }

  if (activities.length > 0) {
    lines.push('\nDernieres activites :')
    for (const act of activities.slice(0, 10)) {
      const date = new Date(act.created_at as string).toLocaleDateString('fr-FR')
      const content = ((act.content as string) || '').substring(0, 100)
      lines.push(`- ${date} [${act.type}] : ${content}`)
    }
  }

  return lines.join('\n')
}
