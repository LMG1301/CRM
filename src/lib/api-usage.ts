import { supabase } from './supabase'
import { AI_MODELS, BUDGET_CONFIG, type AIModelId } from './ai-models'

/**
 * Log an API call to the api_usage table.
 * Fire-and-forget — failures are silently ignored.
 */
export function logApiUsage(params: {
  endpoint: string
  model: string
  input_tokens: number
  output_tokens: number
}) {
  void supabase.from('api_usage').insert(params)
}

/** Calculate cost for a single usage row based on its model */
function calculateRowCost(row: {
  model: string
  input_tokens: number
  output_tokens: number
}): number {
  const modelConfig = Object.values(AI_MODELS).find(
    (m) => m.apiModelId === row.model || m.id === row.model,
  )
  if (!modelConfig) {
    // Fallback for old Gemini rows: use cheap pricing
    const input = (row.input_tokens || 0) / 1_000_000
    const output = (row.output_tokens || 0) / 1_000_000
    return input * 0.15 + output * 0.6
  }
  return (
    ((row.input_tokens || 0) / 1_000_000) * modelConfig.inputPricePerMTok +
    ((row.output_tokens || 0) / 1_000_000) * modelConfig.outputPricePerMTok
  )
}

/** Get usage stats aggregated by period */
export async function getUsageStats() {
  const now = new Date()
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).toISOString()
  const weekStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 7,
  ).toISOString()
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString()

  const { data, error } = await supabase
    .from('api_usage')
    .select('*')
    .gte('created_at', monthStart)
    .order('created_at', { ascending: false })

  if (error || !data) {
    return { today: null, week: null, month: null, history: [], byModel: {}, byEndpoint: {}, budget: null, error: error?.message }
  }

  const aggregate = (items: typeof data) => {
    const totalInput = items.reduce((s, r) => s + (r.input_tokens || 0), 0)
    const totalOutput = items.reduce((s, r) => s + (r.output_tokens || 0), 0)
    const calls = items.length
    const costUsd = items.reduce((s, r) => s + calculateRowCost(r), 0)
    return {
      calls,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      total_tokens: totalInput + totalOutput,
      cost_usd: Math.round(costUsd * 10000) / 10000,
    }
  }

  const todayItems = data.filter((r) => r.created_at >= todayStart)
  const weekItems = data.filter((r) => r.created_at >= weekStart)

  // Per-model breakdown
  const byModel: Record<string, { calls: number; cost: number }> = {}
  for (const row of data) {
    const key = row.model || 'unknown'
    if (!byModel[key]) byModel[key] = { calls: 0, cost: 0 }
    byModel[key].calls++
    byModel[key].cost += calculateRowCost(row)
  }
  // Round costs
  for (const key of Object.keys(byModel)) {
    byModel[key].cost = Math.round(byModel[key].cost * 10000) / 10000
  }

  // Per-endpoint breakdown
  const byEndpoint: Record<string, { calls: number; cost: number }> = {}
  for (const row of data) {
    const key = row.endpoint || 'unknown'
    if (!byEndpoint[key]) byEndpoint[key] = { calls: 0, cost: 0 }
    byEndpoint[key].calls++
    byEndpoint[key].cost += calculateRowCost(row)
  }
  for (const key of Object.keys(byEndpoint)) {
    byEndpoint[key].cost = Math.round(byEndpoint[key].cost * 10000) / 10000
  }

  const monthStats = aggregate(data)

  return {
    today: aggregate(todayItems),
    week: aggregate(weekItems),
    month: monthStats,
    history: data.slice(0, 50),
    byModel,
    byEndpoint,
    budget: {
      limit: BUDGET_CONFIG.monthlyBudgetUsd,
      warning: BUDGET_CONFIG.warningThresholdUsd,
      current: monthStats.cost_usd,
    },
    error: null,
  }
}

/** Check if the monthly budget is still available */
export async function checkBudget(): Promise<{
  allowed: boolean
  currentSpend: number
  warningTriggered: boolean
  remaining: number
}> {
  const now = new Date()
  const monthStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
  ).toISOString()

  const { data } = await supabase
    .from('api_usage')
    .select('model, input_tokens, output_tokens')
    .gte('created_at', monthStart)

  const currentSpend = (data || []).reduce(
    (sum, row) => sum + calculateRowCost(row),
    0,
  )

  return {
    allowed: currentSpend < BUDGET_CONFIG.hardStopThresholdUsd,
    currentSpend: Math.round(currentSpend * 10000) / 10000,
    warningTriggered: currentSpend >= BUDGET_CONFIG.warningThresholdUsd,
    remaining:
      Math.round(
        (BUDGET_CONFIG.monthlyBudgetUsd - currentSpend) * 10000,
      ) / 10000,
  }
}

/** Budget enforcement for API routes. Returns a 429 Response if blocked, null if OK. */
export async function enforceBudget(): Promise<Response | null> {
  const budget = await checkBudget()
  if (!budget.allowed) {
    return Response.json(
      {
        error:
          'Budget mensuel IA atteint ($10). Les fonctions IA sont desactivees jusqu\'au 1er du mois prochain.',
      },
      { status: 429 },
    )
  }
  return null
}
