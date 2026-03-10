import { supabase } from '@/lib/supabase'

/**
 * Save edits to a pending sequence email without sending it.
 *
 * POST /api/sequences/save-draft
 * Body: { enrollment_id, subject, body_html, body_text }
 */
export async function POST(request: Request) {
  try {
    const { enrollment_id, subject, body_html, body_text } = await request.json()

    if (!enrollment_id) {
      return Response.json({ error: 'enrollment_id requis' }, { status: 400 })
    }

    // Load existing enrollment to preserve other pending_email fields
    const { data: enrollment, error: enrErr } = await supabase
      .from('sequence_enrollments')
      .select('pending_email')
      .eq('id', enrollment_id)
      .eq('status', 'active')
      .single()

    if (enrErr || !enrollment?.pending_email) {
      return Response.json({ error: 'Enrollment sans email en attente' }, { status: 404 })
    }

    const existing = enrollment.pending_email as Record<string, unknown>
    const updated = {
      ...existing,
      subject: subject ?? existing.subject,
      body_html: body_html ?? existing.body_html,
      body_text: body_text ?? existing.body_text,
    }

    const { error: updateErr } = await supabase
      .from('sequence_enrollments')
      .update({ pending_email: updated })
      .eq('id', enrollment_id)

    if (updateErr) {
      return Response.json({ error: updateErr.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
