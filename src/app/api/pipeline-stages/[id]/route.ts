import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) updates.name = body.name.trim()
  if (body.color !== undefined) updates.color = body.color

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('pipeline_stages')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(request.url)
  const moveTo = url.searchParams.get('move_to')

  // Check stage
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('*')
    .eq('id', id)
    .single()

  if (!stage) return Response.json({ error: 'Stage not found' }, { status: 404 })
  if (!stage.is_deletable) return Response.json({ error: 'Cette étape ne peut pas être supprimée' }, { status: 403 })

  // Count prospects
  const { count } = await supabase
    .from('prospects')
    .select('id', { count: 'exact', head: true })
    .eq('pipeline_stage', stage.slug)

  if ((count || 0) > 0 && !moveTo) {
    return Response.json({
      error: 'Stage has prospects',
      prospect_count: count,
      message: `Cette étape contient ${count} prospect(s). Spécifiez move_to pour les déplacer.`,
    }, { status: 409 })
  }

  // Migrate prospects if needed
  if ((count || 0) > 0 && moveTo) {
    await supabase
      .from('prospects')
      .update({ pipeline_stage: moveTo })
      .eq('pipeline_stage', stage.slug)
  }

  // Delete stage
  const { error } = await supabase
    .from('pipeline_stages')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true, migrated: count || 0 })
}
