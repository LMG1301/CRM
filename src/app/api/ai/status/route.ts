import { getUsageStats } from '@/lib/api-usage'

/**
 * GET /api/ai/status
 * Returns AI API connection status and monthly usage stats.
 */
export async function GET() {
  try {
    const apiKeySet = !!process.env.ANTHROPIC_API_KEY

    if (!apiKeySet) {
      return Response.json({
        connected: false,
        apiKeySet: false,
        defaultModel: null,
        monthCalls: 0,
        monthTokens: 0,
        monthCost: 0,
      })
    }

    const stats = await getUsageStats()

    return Response.json({
      connected: true,
      apiKeySet: true,
      defaultModel: 'Haiku',
      monthCalls: stats.month?.calls || 0,
      monthTokens: stats.month?.total_tokens || 0,
      monthCost: stats.month?.cost_usd || 0,
      budget: stats.budget,
    })
  } catch {
    return Response.json({
      connected: !!process.env.ANTHROPIC_API_KEY,
      apiKeySet: !!process.env.ANTHROPIC_API_KEY,
      defaultModel: 'Haiku',
      monthCalls: 0,
      monthTokens: 0,
      monthCost: 0,
    })
  }
}
