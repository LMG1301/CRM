import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('client_machines')
    .select('id, prospect_id, entreprise, machine_type, quantity, unit_price, installed_at, notes, created_at')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ machines: data || [] })
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const { id, machine_type, quantity, unit_price, installed_at, notes } = body

  if (!id) return Response.json({ error: 'id requis' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (machine_type !== undefined) updates.machine_type = machine_type
  if (quantity !== undefined) updates.quantity = Number(quantity)
  if (unit_price !== undefined) updates.unit_price = Number(unit_price)
  if (installed_at !== undefined) updates.installed_at = installed_at || null
  if (notes !== undefined) updates.notes = notes || null

  const { data, error } = await supabase
    .from('client_machines')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ machine: data })
}
