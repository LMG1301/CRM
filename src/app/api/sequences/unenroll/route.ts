import { supabase } from '@/lib/supabase'

/**
 * Unenroll a prospect from a sequence
 * POST /api/sequences/unenroll
 * Body: { enrollment_id }
 */
export async function POST(request: Request) {
  try {
    const { enrollment_id } = await request.json()

    if (!enrollment_id) {
      return Response.json({ error: 'enrollment_id requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('sequence_enrollments')
      .update({
        status: 'stopped_manual',
        stopped_at: new Date().toISOString(),
        stopped_reason: 'Arret manuel',
        pending_email: null,
      })
      .eq('id', enrollment_id)
      .select()
      .single()

    if (error) throw error
    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
