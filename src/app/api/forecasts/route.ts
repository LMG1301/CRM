import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const prospectId = request.nextUrl.searchParams.get('prospect_id')

  let query = supabase
    .from('prospect_forecasts')
    .select('*, prospect:prospects(prenom, nom, entreprise)')
    .order('expected_month')

  if (prospectId) {
    query = query.eq('prospect_id', prospectId)
  }

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ forecasts: data || [] })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { prospect_id, product_type, unit_price, quantity, probability, expected_month, notes } = body

  if (!prospect_id || !product_type || unit_price == null || !quantity || probability == null || !expected_month) {
    return Response.json({ error: 'Champs requis manquants' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('prospect_forecasts')
    .insert({
      prospect_id,
      product_type,
      unit_price: Number(unit_price),
      quantity: Number(quantity),
      probability: Number(probability),
      expected_month,
      notes: notes || null,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ forecast: data })
}
