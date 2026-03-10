import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.product_type !== undefined) updates.product_type = body.product_type
  if (body.unit_price !== undefined) updates.unit_price = Number(body.unit_price)
  if (body.quantity !== undefined) updates.quantity = Number(body.quantity)
  if (body.probability !== undefined) updates.probability = Number(body.probability)
  if (body.expected_month !== undefined) updates.expected_month = body.expected_month
  if (body.notes !== undefined) updates.notes = body.notes || null

  const { data, error } = await supabase
    .from('prospect_forecasts')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ forecast: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabase
    .from('prospect_forecasts')
    .delete()
    .eq('id', id)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
