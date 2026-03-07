import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Daily automation endpoint — called by Vercel Cron or Apps Script daily.
 *
 * 1. RELANCES AUTOMATIQUES: Flag prospects needing follow-up
 * 2. PIPELINE AUTOMATIQUE: Auto-advance pipeline stage based on activity
 *
 * Auth: WEBHOOK_SECRET or Vercel cron secret
 */

// ═══════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════

const RELANCE_RULES = {
  // Jours sans contact avant relance, par stage
  contact_initial: 3,
  repondu: 5,
  call_decouverte: 7,
  devis: 5,
  negociation: 3,
  // Stages terminaux — pas de relance
  ciblage: 14,
  client: 0,
  refuse: 0,
  bounced: 0,
}

// Pipeline progression rules based on activity types
const PIPELINE_RULES: Record<string, { minActivities: number; types: string[]; targetStage: string }[]> = {
  ciblage: [
    { minActivities: 1, types: ['email_sent'], targetStage: 'contact_initial' },
  ],
  contact_initial: [
    { minActivities: 1, types: ['email_received'], targetStage: 'repondu' },
  ],
  repondu: [
    { minActivities: 1, types: ['meeting', 'call'], targetStage: 'call_decouverte' },
  ],
  call_decouverte: [
    { minActivities: 2, types: ['meeting', 'call', 'presentation'], targetStage: 'devis' },
  ],
}

// Terminal stages — never auto-change
const TERMINAL_STAGES = ['client', 'refuse', 'bounced']

export async function POST(request: NextRequest) {
  try {
    // Verify auth
    const secret = request.headers.get('x-webhook-secret')
    const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '')

    if (secret !== process.env.WEBHOOK_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = {
      relances: { checked: 0, flagged: 0, details: [] as Array<{ prospect: string; stage: string; days_since_contact: number }> },
      pipeline: { checked: 0, updated: 0, details: [] as Array<{ prospect: string; from: string; to: string; reason: string }> },
    }

    // ═══════════════════════════════════════════
    // 1. RELANCES AUTOMATIQUES
    // ═══════════════════════════════════════════

    const { data: activeProspects } = await supabase
      .from('prospects')
      .select('id, prenom, nom, entreprise, pipeline_stage, date_dernier_contact, date_prochaine_action, type_prochaine_action')
      .not('pipeline_stage', 'in', `(${TERMINAL_STAGES.join(',')})`)

    if (activeProspects) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const todayStr = today.toISOString().split('T')[0]

      for (const prospect of activeProspects) {
        results.relances.checked++

        const stage = prospect.pipeline_stage as keyof typeof RELANCE_RULES
        const maxDays = RELANCE_RULES[stage] || 7

        if (maxDays === 0) continue // Terminal stage

        const lastContact = prospect.date_dernier_contact
          ? new Date(prospect.date_dernier_contact)
          : new Date(0) // Never contacted

        const daysSinceContact = Math.floor(
          (today.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
        )

        if (daysSinceContact >= maxDays) {
          // Check if we already have a pending action for this prospect
          const alreadyFlagged = prospect.date_prochaine_action &&
            prospect.date_prochaine_action <= todayStr &&
            prospect.type_prochaine_action

          if (!alreadyFlagged) {
            // Set relance action
            await supabase
              .from('prospects')
              .update({
                date_prochaine_action: todayStr,
                type_prochaine_action: getRelanceType(stage),
              })
              .eq('id', prospect.id)

            results.relances.flagged++
            results.relances.details.push({
              prospect: `${prospect.prenom} ${prospect.nom} (${prospect.entreprise || 'N/A'})`,
              stage: prospect.pipeline_stage,
              days_since_contact: daysSinceContact,
            })
          }
        }
      }
    }

    // ═══════════════════════════════════════════
    // 2. PIPELINE AUTOMATIQUE
    // ═══════════════════════════════════════════

    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, prenom, nom, entreprise, pipeline_stage')
      .not('pipeline_stage', 'in', `(${TERMINAL_STAGES.join(',')})`)

    if (prospects) {
      // Get all pipeline stages for ordering
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('slug, position')
        .order('position')

      const stageOrder: Record<string, number> = {}
      if (stages) {
        stages.forEach((s) => { stageOrder[s.slug] = s.position })
      }

      for (const prospect of prospects) {
        results.pipeline.checked++

        const currentStage = prospect.pipeline_stage
        const rules = PIPELINE_RULES[currentStage]
        if (!rules) continue

        // Get prospect activities
        const { data: activities } = await supabase
          .from('activities')
          .select('type')
          .eq('prospect_id', prospect.id)

        if (!activities) continue

        // Check each rule
        for (const rule of rules) {
          const matchingActivities = activities.filter((a) =>
            rule.types.includes(a.type)
          )

          if (matchingActivities.length >= rule.minActivities) {
            // Only advance, never go backward
            const currentPos = stageOrder[currentStage] || 0
            const targetPos = stageOrder[rule.targetStage] || 0

            if (targetPos > currentPos) {
              await supabase
                .from('prospects')
                .update({ pipeline_stage: rule.targetStage })
                .eq('id', prospect.id)

              // Log the stage change
              await supabase.from('activities').insert({
                prospect_id: prospect.id,
                type: 'status_change',
                content: `Pipeline auto: ${currentStage} → ${rule.targetStage}`,
                metadata: {
                  from_stage: currentStage,
                  to_stage: rule.targetStage,
                  reason: `${matchingActivities.length} activite(s) de type ${rule.types.join('/')}`,
                  source: 'pipeline_auto',
                },
              })

              results.pipeline.updated++
              results.pipeline.details.push({
                prospect: `${prospect.prenom} ${prospect.nom}`,
                from: currentStage,
                to: rule.targetStage,
                reason: `${matchingActivities.length} ${rule.types.join('/')}`,
              })

              break // Only apply first matching rule
            }
          }
        }
      }
    }

    return Response.json(results)
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

/**
 * Determine the relance type based on pipeline stage
 */
function getRelanceType(stage: string): string {
  switch (stage) {
    case 'ciblage':
      return 'Email de prospection'
    case 'contact_initial':
      return 'Relance email'
    case 'repondu':
      return 'Proposer un call'
    case 'call_decouverte':
      return 'Relance post-call'
    case 'devis':
      return 'Relance devis'
    case 'negociation':
      return 'Relance negociation'
    default:
      return 'Relance'
  }
}

// Also support GET for health check
export async function GET() {
  return Response.json({
    status: 'ok',
    description: 'Daily automation: relances + pipeline auto',
    usage: 'POST with x-webhook-secret header to trigger',
  })
}
