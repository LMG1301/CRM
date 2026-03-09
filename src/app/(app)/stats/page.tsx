import { getDashboardStats, getStages, getContents, getMachineStats } from '@/lib/actions'
import { StatsDashboard } from '@/components/stats/stats-dashboard'

export const dynamic = 'force-dynamic'

export default async function StatsPage() {
  const [stats, stages, machineStats, contents] = await Promise.all([
    getDashboardStats(),
    getStages(),
    getMachineStats(),
    getContents(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <StatsDashboard
          stats={stats}
          stages={stages}
          machineStats={machineStats}
          contents={contents}
        />
      </div>
    </div>
  )
}
