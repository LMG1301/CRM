import { supabase } from './supabase'

/**
 * Log an API call to the api_usage table.
 * Fire-and-forget — failures are silently ignored.
 *
 * Table SQL (run once in Supabase SQL Editor):
 *
 * CREATE TABLE IF NOT EXISTS api_usage (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   endpoint text NOT NULL,
 *   model text NOT NULL,
 *   input_tokens integer DEFAULT 0,
 *   output_tokens integer DEFAULT 0,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * -- Optional: index for fast aggregation
 * CREATE INDEX idx_api_usage_created ON api_usage (created_at DESC);
 */
export function logApiUsage(params: {
  endpoint: string
  model: string
  input_tokens: number
  output_tokens: number
}) {
  void supabase.from('api_usage').insert(params)
}

/** Get usage stats aggregated by period */
export async function getUsageStats() {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Get all usage for this month
  const { data, error } = await supabase
    .from('api_usage')
    .select('*')
    .gte('created_at', monthStart)
    .order('created_at', { ascending: false })

  if (error || !data) {
    return { today: null, week: null, month: null, history: [], error: error?.message }
  }

  const aggregate = (items: typeof data) => {
    const totalInput = items.reduce((s, r) => s + (r.input_tokens || 0), 0)
    const totalOutput = items.reduce((s, r) => s + (r.output_tokens || 0), 0)
    const calls = items.length
    // Haiku pricing: $0.80/MTok input, $4/MTok output
    const costInput = (totalInput / 1_000_000) * 0.80
    const costOutput = (totalOutput / 1_000_000) * 4.00
    return {
      calls,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      total_tokens: totalInput + totalOutput,
      cost_usd: Math.round((costInput + costOutput) * 10000) / 10000,
    }
  }

  const todayItems = data.filter(r => r.created_at >= todayStart)
  const weekItems = data.filter(r => r.created_at >= weekStart)

  return {
    today: aggregate(todayItems),
    week: aggregate(weekItems),
    month: aggregate(data),
    history: data.slice(0, 50), // Last 50 calls for detail view
    error: null,
  }
}
