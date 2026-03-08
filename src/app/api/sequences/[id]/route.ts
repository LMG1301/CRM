import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const { name, description, steps, is_active } = body

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (description !== undefined) updates.description = description
    if (steps !== undefined) updates.steps = steps
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase
      .from('sequences')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Delete enrollments first
    await supabase.from('sequence_enrollments').delete().eq('sequence_id', id)
    const { error } = await supabase.from('sequences').delete().eq('id', id)
    if (error) throw error
    return Response.json({ deleted: true })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
