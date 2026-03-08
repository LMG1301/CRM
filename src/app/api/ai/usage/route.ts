import { getUsageStats } from '@/lib/api-usage'

export async function GET() {
  const stats = await getUsageStats()
  return Response.json(stats)
}
