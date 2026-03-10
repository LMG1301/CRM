import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toLocalDateString } from '@/lib/utils'

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

const RELANCE_RULES: Record<string, number> = {
  // Jours sans contact avant relance, par stage
  touch_1: 3,
  repondu: 5,
  devis: 5,
  onboarding: 7,
  a_recontacter: 30,
  // Stages terminaux — pas de relance
  ciblage: 14,
  client: 0,
  refuse: 0,
}

// DISABLED — Pipeline auto-progression removed. pipeline_stage is now ONLY changed by user action.
// const PIPELINE_RULES was here — deleted.

// Terminal stages — used to filter relance queries
const TERMINAL_STAGES = ['client', 'refuse']

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
      tasks: { overdue: 0 },
      sequences: { checked: 0, generated: 0, auto_sent: 0, stopped_reply: 0, errors: [] as string[] },
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
      const todayStr = toLocalDateString(today)

      for (const prospect of activeProspects) {
        results.relances.checked++

        const stage = prospect.pipeline_stage as keyof typeof RELANCE_RULES
        const maxDays = RELANCE_RULES[stage] || 7

        if (maxDays === 0) continue // Terminal stage

        // Skip prospects never contacted — no relance for cold prospects
        if (!prospect.date_dernier_contact) continue

        const lastContact = new Date(prospect.date_dernier_contact)
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
    // 2. PIPELINE AUTOMATIQUE — DISABLED
    // pipeline_stage is now ONLY changed by user action (drag & drop or stage selector)
    // ═══════════════════════════════════════════

    // ═══════════════════════════════════════════
    // 3. TACHES EN RETARD
    // ═══════════════════════════════════════════

    const todayCron = toLocalDateString(new Date())
    const { count } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('due_date', `${todayCron}T00:00:00`)

    results.tasks.overdue = count || 0

    // ═══════════════════════════════════════════
    // 4. SEQUENCES — Auto-stop + execute due steps
    // ═══════════════════════════════════════════

    // 4a. AUTO-STOP: Check for replies from enrolled prospects
    const { data: activeEnrollments } = await supabase
      .from('sequence_enrollments')
      .select('id, prospect_id, enrolled_at')
      .eq('status', 'active')

    if (activeEnrollments) {
      for (const enrollment of activeEnrollments) {
        const { data: replies } = await supabase
          .from('activities')
          .select('id')
          .eq('prospect_id', enrollment.prospect_id)
          .eq('type', 'email_received')
          .gte('created_at', enrollment.enrolled_at)
          .limit(1)

        if (replies && replies.length > 0) {
          await supabase
            .from('sequence_enrollments')
            .update({
              status: 'stopped_reply',
              stopped_at: new Date().toISOString(),
              stopped_reason: 'Prospect a repondu par email',
              pending_email: null,
            })
            .eq('id', enrollment.id)

          results.sequences.stopped_reply++
        }
      }
    }

    // 4b. PROCESS DUE STEPS: Generate emails for due enrollments
    const todaySeq = toLocalDateString(new Date())
    const { data: dueEnrollments } = await supabase
      .from('sequence_enrollments')
      .select('id')
      .eq('status', 'active')
      .is('pending_email', null)
      .lte('next_step_date', todaySeq)

    if (dueEnrollments) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL
        || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
        || 'http://localhost:3000'
      for (const enrollment of dueEnrollments) {
        results.sequences.checked++
        try {
          const res = await fetch(`${appUrl}/api/sequences/process-step`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-webhook-secret': process.env.WEBHOOK_SECRET || '',
            },
            body: JSON.stringify({ enrollment_id: enrollment.id }),
          })
          if (res.ok) {
            const result = await res.json()
            if (result.sent) results.sequences.auto_sent++
            else if (result.generated) results.sequences.generated++
            else if (result.stopped) results.sequences.stopped_reply++
          } else {
            const err = await res.json().catch(() => ({ error: 'Unknown' }))
            results.sequences.errors.push(`${enrollment.id}: ${err.error}`)
          }
        } catch (e) {
          results.sequences.errors.push(`${enrollment.id}: ${(e as Error).message}`)
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
    case 'touch_1':
      return 'Relance email'
    case 'repondu':
      return 'Proposer un call'
    case 'devis':
      return 'Relance devis'
    case 'onboarding':
      return 'Suivi onboarding'
    case 'a_recontacter':
      return 'Reprendre contact'
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
