import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

/**
 * DELETE /api/sequences/enrollment/[id]
 * Hard-delete a sequence enrollment.
 * Emails sent via the sequence remain in the `emails` table (correspondence history).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return Response.json({ error: 'id requis' }, { status: 400 })
    }

    const { error } = await supabase
      .from('sequence_enrollments')
      .delete()
      .eq('id', id)

    if (error) throw error

    return Response.json({ ok: true })
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
