import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const body = await request.json()
    const { name, subject, body_html, category, variables, is_active } = body

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (name !== undefined) updates.name = name
    if (subject !== undefined) updates.subject = subject
    if (body_html !== undefined) updates.body_html = body_html
    if (category !== undefined) updates.category = category
    if (variables !== undefined) updates.variables = variables
    if (is_active !== undefined) updates.is_active = is_active

    const { data, error } = await supabase
      .from('email_templates')
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
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id)

    if (error) throw error
    return Response.json({ deleted: true })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
