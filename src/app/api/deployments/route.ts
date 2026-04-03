import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .order('deployment_date', { ascending: true })

  if (error) {
    if (error.code === 'PGRST205') {
      return Response.json({ deployments: [], needsMigration: true })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ deployments: data || [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { client_name, prospect_id, quantity, product, unit_price, deployment_date, source, status, forecast_id, notes } = body

  if (!client_name || !quantity || !product || !deployment_date || unit_price == null) {
    return Response.json({ error: 'Champs requis: client_name, quantity, product, unit_price, deployment_date' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('deployments')
    .insert({
      client_name,
      prospect_id: prospect_id || null,
      quantity: Number(quantity),
      product,
      unit_price: Number(unit_price),
      deployment_date,
      source: source || 'manual',
      status: status || 'deployed',
      forecast_id: forecast_id || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ deployment: data })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, client_name, quantity, product, unit_price, deployment_date, status, notes } = body

  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (client_name !== undefined) updates.client_name = client_name
  if (quantity !== undefined) updates.quantity = Number(quantity)
  if (product !== undefined) updates.product = product
  if (unit_price !== undefined) updates.unit_price = Number(unit_price)
  if (deployment_date !== undefined) updates.deployment_date = deployment_date
  if (status !== undefined) updates.status = status
  if (notes !== undefined) updates.notes = notes || null

  const { data, error } = await supabase
    .from('deployments')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ deployment: data })
}
