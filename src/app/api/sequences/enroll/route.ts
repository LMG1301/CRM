import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toLocalDateString } from '@/lib/utils'

/**
 * GET /api/sequences/enroll?prospect_id=xxx
 * Returns enrollments for a prospect (with joined sequence)
 */
export async function GET(request: NextRequest) {
  const prospectId = request.nextUrl.searchParams.get('prospect_id')
  if (!prospectId) {
    return Response.json({ error: 'prospect_id requis' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('*, sequence:sequences(*)')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data || [])
}

/**
 * Enroll prospect(s) in a sequence
 * POST /api/sequences/enroll
 * Body: { sequence_id, prospect_ids: string[], send_mode?: 'semi_auto' | 'auto' }
 */
export async function POST(request: Request) {
  try {
    const { sequence_id, prospect_ids, send_mode = 'semi_auto' } = await request.json()

    if (!sequence_id || !prospect_ids || !Array.isArray(prospect_ids) || prospect_ids.length === 0) {
      return Response.json({ error: 'sequence_id et prospect_ids requis' }, { status: 400 })
    }

    // Load sequence to get first step delay
    const { data: sequence, error: seqErr } = await supabase
      .from('sequences')
      .select('*')
      .eq('id', sequence_id)
      .eq('is_active', true)
      .single()

    if (seqErr || !sequence) {
      return Response.json({ error: 'Sequence non trouvee ou inactive' }, { status: 404 })
    }

    const steps = sequence.steps as Array<{ position: number; delay_days: number }>
    if (!steps || steps.length === 0) {
      return Response.json({ error: 'Sequence sans etapes' }, { status: 400 })
    }

    // Compute first step date
    const firstDelay = steps[0]?.delay_days || 0
    const nextDate = new Date()
    nextDate.setDate(nextDate.getDate() + firstDelay)
    const next_step_date = toLocalDateString(nextDate)

    let enrolled = 0
    let skipped = 0
    const errors: string[] = []

    for (const prospect_id of prospect_ids) {
      // Check no existing active enrollment for this pair
      const { data: existing } = await supabase
        .from('sequence_enrollments')
        .select('id')
        .eq('sequence_id', sequence_id)
        .eq('prospect_id', prospect_id)
        .eq('status', 'active')
        .limit(1)

      if (existing && existing.length > 0) {
        skipped++
        continue
      }

      const { error } = await supabase.from('sequence_enrollments').insert({
        sequence_id,
        prospect_id,
        status: 'active',
        current_step: 0,
        next_step_date,
        send_mode,
      })

      if (error) {
        errors.push(`${prospect_id}: ${error.message}`)
      } else {
        enrolled++

        // If first step is immediate (delay_days = 0), trigger email generation now
        if (firstDelay === 0) {
          try {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
            const { data: newEnrollment } = await supabase
              .from('sequence_enrollments')
              .select('id')
              .eq('sequence_id', sequence_id)
              .eq('prospect_id', prospect_id)
              .eq('status', 'active')
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            if (newEnrollment) {
              // Fire and forget — don't block enrollment
              fetch(`${appUrl}/api/sequences/process-step`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'x-webhook-secret': process.env.WEBHOOK_SECRET || '',
                },
                body: JSON.stringify({ enrollment_id: newEnrollment.id }),
              }).catch(() => {})
            }
          } catch {
            // Non-blocking — cron will catch it
          }
        }
      }
    }

    return Response.json({ enrolled, skipped, errors })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
