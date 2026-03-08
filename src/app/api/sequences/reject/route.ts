import { supabase } from '@/lib/supabase'
import { toLocalDateString } from '@/lib/utils'
import type { SequenceStep } from '@/lib/types'

/**
 * Reject a pending sequence email
 *
 * POST /api/sequences/reject
 * Body: { enrollment_id, action: 'regenerate' | 'skip' | 'stop' }
 */
export async function POST(request: Request) {
  try {
    const { enrollment_id, action } = await request.json()

    if (!enrollment_id || !action) {
      return Response.json({ error: 'enrollment_id et action requis' }, { status: 400 })
    }

    if (!['regenerate', 'skip', 'stop'].includes(action)) {
      return Response.json({ error: 'action doit etre: regenerate, skip, ou stop' }, { status: 400 })
    }

    // Load enrollment
    const { data: enrollment, error: enrErr } = await supabase
      .from('sequence_enrollments')
      .select('*, sequence:sequences(*)')
      .eq('id', enrollment_id)
      .eq('status', 'active')
      .single()

    if (enrErr || !enrollment) {
      return Response.json({ error: 'Enrollment non trouve ou inactif' }, { status: 404 })
    }

    if (action === 'stop') {
      await supabase
        .from('sequence_enrollments')
        .update({
          status: 'stopped_manual',
          stopped_at: new Date().toISOString(),
          stopped_reason: 'Arret manuel lors de la review',
          pending_email: null,
        })
        .eq('id', enrollment_id)

      return Response.json({ stopped: true })
    }

    if (action === 'regenerate') {
      // Clear pending email — cron will re-generate on next run
      await supabase
        .from('sequence_enrollments')
        .update({ pending_email: null })
        .eq('id', enrollment_id)

      return Response.json({ regenerate: true })
    }

    if (action === 'skip') {
      // Skip this step, advance to next
      const steps = (enrollment.sequence?.steps || []) as SequenceStep[]
      const nextIndex = enrollment.current_step + 1

      if (nextIndex >= steps.length) {
        await supabase
          .from('sequence_enrollments')
          .update({
            current_step: nextIndex,
            status: 'completed',
            completed_at: new Date().toISOString(),
            pending_email: null,
          })
          .eq('id', enrollment_id)
      } else {
        const nextDelay = steps[nextIndex]?.delay_days || 1
        const nextDate = new Date()
        nextDate.setDate(nextDate.getDate() + nextDelay)

        await supabase
          .from('sequence_enrollments')
          .update({
            current_step: nextIndex,
            next_step_date: toLocalDateString(nextDate),
            pending_email: null,
          })
          .eq('id', enrollment_id)
      }

      return Response.json({ skipped: true })
    }

    return Response.json({ error: 'Action non reconnue' }, { status: 400 })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
