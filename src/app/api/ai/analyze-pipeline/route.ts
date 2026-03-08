import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { logApiUsage } from '@/lib/api-usage'

/**
 * AI Pipeline Analysis — Analyzes prospect interactions and
 * automatically determines the appropriate pipeline stage.
 *
 * POST /api/ai/analyze-pipeline
 * Body: { prospect_id?: string } — if omitted, analyzes all prospects with recent activity
 *
 * Can also be called with x-webhook-secret header for automated triggers.
 */

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

const STAGE_DESCRIPTIONS = `
Les stages du pipeline commercial (du plus froid au plus chaud) :
- "ciblage" : Prospect identifie, pas encore contacte
- "touch_1" : Premier message envoye (email ou LinkedIn)
- "touch_2" : Relance envoyee, pas encore de reponse
- "touch_3" : Derniere relance envoyee
- "nurturing" : Pas de reponse apres 3 touches, on reste visible
- "repondu" : Le prospect a repondu (positivement ou neutre)
- "call_decouverte" : Un appel decouverte est planifie ou effectue
- "devis" : Une proposition commerciale a ete envoyee
- "client" : Deal signe, c'est un client
- "refuse" : Le prospect a refuse explicitement
- "bounced" : Email invalide ou prospect injoignable
`

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    // Check auth (either webhook secret or accept from internal calls)
    const secret = request.headers.get('x-webhook-secret')
    const isInternal = request.headers.get('x-internal') === 'true'
    if (!isInternal && secret !== process.env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { prospect_id?: string } = {}
    try {
      body = await request.json()
    } catch {
      // Empty body = analyze recent
    }

    let prospectIds: string[] = []

    if (body.prospect_id) {
      prospectIds = [body.prospect_id]
    } else {
      // Find prospects with activity in the last 24h that are not in terminal stages
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

    // Limit to 10 per call to avoid timeout
    const toAnalyze = prospectIds.slice(0, 10)
    const results: Array<{
      prospect_id: string
      name: string
      old_stage: string
      new_stage: string
      reason: string
    }> = []

    for (const prospectId of toAnalyze) {
      try {
        const result = await analyzeProspect(prospectId)
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

async function analyzeProspect(prospectId: string) {
  // Load prospect
  const { data: prospect } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', prospectId)
    .single()

  if (!prospect) return null

  // Skip terminal stages
  if (['client', 'refuse', 'bounced'].includes(prospect.pipeline_stage)) {
    return null
  }

  // Load recent activities
  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
    .limit(20)

  // Load emails
  const { data: emails } = await supabase
    .from('emails')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('gmail_date', { ascending: false })
    .limit(20)

  // Build context for Claude
  const context = buildAnalysisContext(prospect, activities || [], emails || [])

  // Ask Claude
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: `Tu es un assistant commercial qui analyse les interactions avec un prospect pour determiner son stage dans le pipeline. Tu dois repondre UNIQUEMENT en JSON valide, sans markdown.

${STAGE_DESCRIPTIONS}

Reponds avec ce format JSON exact :
{"stage": "slug_du_stage", "reason": "Explication courte en 1 phrase"}`,
    messages: [
      {
        role: 'user',
        content: `Analyse ce prospect et determine son stage optimal dans le pipeline :

${context}

Quel est le stage le plus adapte ? Reponds en JSON.`,
      },
    ],
  })

  // Log API usage
  logApiUsage({
    endpoint: 'analyze-pipeline',
    model: 'claude-haiku-4-5-20251001',
    input_tokens: response.usage?.input_tokens || 0,
    output_tokens: response.usage?.output_tokens || 0,
  })

  // Parse response
  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  let parsed: { stage: string; reason: string }

  try {
    parsed = JSON.parse(text.trim())
  } catch {
    // Try to extract JSON from response
    const match = text.match(/\{[^}]+\}/)
    if (match) {
      parsed = JSON.parse(match[0])
    } else {
      return null
    }
  }

  const oldStage = prospect.pipeline_stage
  const newStage = parsed.stage

  // Only update if stage changed
  if (newStage && newStage !== oldStage) {
    await supabase
      .from('prospects')
      .update({ pipeline_stage: newStage })
      .eq('id', prospectId)

    // Log the AI stage change as activity
    await supabase.from('activities').insert({
      prospect_id: prospectId,
      type: 'status_change',
      content: `[IA] Pipeline : ${oldStage} → ${newStage} — ${parsed.reason}`,
      metadata: {
        from: oldStage,
        to: newStage,
        source: 'ai_analysis',
        reason: parsed.reason,
      },
    })
  }

  return {
    prospect_id: prospectId,
    name: `${prospect.prenom} ${prospect.nom}`,
    old_stage: oldStage,
    new_stage: newStage,
    reason: parsed.reason,
  }
}

function buildAnalysisContext(
  prospect: Record<string, unknown>,
  activities: Array<Record<string, unknown>>,
  emails: Array<Record<string, unknown>>
): string {
  const lines: string[] = []

  lines.push(`Prospect : ${prospect.prenom} ${prospect.nom}`)
  if (prospect.entreprise) lines.push(`Entreprise : ${prospect.entreprise}`)
  if (prospect.fonction) lines.push(`Fonction : ${prospect.fonction}`)
  lines.push(`Stage actuel : ${prospect.pipeline_stage}`)
  if (prospect.date_premier_contact) lines.push(`Premier contact : ${prospect.date_premier_contact}`)
  if (prospect.date_dernier_contact) lines.push(`Dernier contact : ${prospect.date_dernier_contact}`)

  // Count emails
  const sentEmails = emails.filter((e) => e.direction === 'sent').length
  const receivedEmails = emails.filter((e) => e.direction === 'received').length
  lines.push(`\nEmails : ${sentEmails} envoyes, ${receivedEmails} recus`)

  // Recent emails
  if (emails.length > 0) {
    lines.push('\nDerniers emails :')
    for (const email of emails.slice(0, 10)) {
      const date = new Date(email.gmail_date as string).toLocaleDateString('fr-FR')
      const dir = email.direction === 'sent' ? '→ Envoye' : '← Recu'
      const subject = email.subject || '(sans objet)'
      const preview = (email.body_preview as string || '').substring(0, 100)
      lines.push(`- ${date} ${dir} : "${subject}" — ${preview}`)
    }
  }

  // Recent activities
  if (activities.length > 0) {
    lines.push('\nDernieres activites :')
    for (const act of activities.slice(0, 10)) {
      const date = new Date(act.created_at as string).toLocaleDateString('fr-FR')
      const content = (act.content as string || '').substring(0, 100)
      lines.push(`- ${date} [${act.type}] : ${content}`)
    }
  }

  return lines.join('\n')
}
