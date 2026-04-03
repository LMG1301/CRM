import { supabase } from '@/lib/supabase'

// Auto-sync: creates deployment records for all signed forecasts (probability=100)
// that don't already have a deployment record
export async function POST() {
  // Get all signed forecasts
  const { data: signedForecasts, error: fError } = await supabase
    .from('prospect_forecasts')
    .select('*, prospect:prospects(prenom, nom, entreprise)')
    .eq('probability', 100)

  if (fError) return Response.json({ error: fError.message }, { status: 500 })
  if (!signedForecasts || signedForecasts.length === 0) {
    return Response.json({ synced: 0, skipped: 0 })
  }

  // Get existing pipeline deployments to avoid duplicates
  const { data: existingDeployments } = await supabase
    .from('deployments')
    .select('forecast_id')
    .eq('source', 'pipeline')

  const existingForecastIds = new Set((existingDeployments || []).map(d => d.forecast_id))

  // Insert missing ones
  const toInsert = signedForecasts
    .filter(f => !existingForecastIds.has(f.id))
    .map(f => ({
      client_name: f.prospect?.entreprise || `${f.prospect?.prenom || ''} ${f.prospect?.nom || ''}`.trim() || 'Unknown',
      prospect_id: f.prospect_id,
      quantity: f.quantity,
      product: f.product_type,
      hardware_revenue: f.total_amount,
      deployment_date: f.expected_month.length === 7 ? `${f.expected_month}-01` : f.expected_month,
      source: 'pipeline' as const,
      forecast_id: f.id,
      notes: f.notes,
    }))

  if (toInsert.length === 0) {
    return Response.json({ synced: 0, skipped: signedForecasts.length })
  }

  const { error: iError } = await supabase.from('deployments').insert(toInsert)
  if (iError) return Response.json({ error: iError.message }, { status: 500 })

  return Response.json({ synced: toInsert.length, skipped: signedForecasts.length - toInsert.length })
}
