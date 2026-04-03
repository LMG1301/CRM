import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .order('deployment_date', { ascending: true })

  if (error) {
    // Table might not exist yet
    if (error.code === 'PGRST205') {
      return Response.json({ deployments: [], needsMigration: true })
    }
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ deployments: data || [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { client_name, prospect_id, quantity, product, hardware_revenue, deployment_date, source, forecast_id, notes } = body

  if (!client_name || !quantity || !product || !deployment_date) {
    return Response.json({ error: 'Champs requis: client_name, quantity, product, deployment_date' }, { status: 400 })
  }

  // Check for duplicate if pipeline-sourced (prevent double entry)
  if (source === 'pipeline' && forecast_id) {
    const { data: existing } = await supabase
      .from('deployments')
      .select('id')
      .eq('forecast_id', forecast_id)
      .limit(1)

    if (existing && existing.length > 0) {
      return Response.json({ deployment: existing[0], duplicate: true })
    }
  }

  const { data, error } = await supabase
    .from('deployments')
    .insert({
      client_name,
      prospect_id: prospect_id || null,
      quantity: Number(quantity),
      product,
      hardware_revenue: Number(hardware_revenue) || 0,
      deployment_date,
      source: source || 'manual',
      forecast_id: forecast_id || null,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ deployment: data })
}
