import { getDashboardStats, getStages } from '@/lib/actions'
import { StatsDashboard } from '@/components/stats/stats-dashboard'

export default async function StatsPage() {
  const [stats, stages] = await Promise.all([
    getDashboardStats(),
    getStages(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Statistiques</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analyse detaillee de votre pipeline commercial
          </p>
        </div>

        {/* Dashboard */}
        <StatsDashboard stats={stats} stages={stages} />
      </div>
    </div>
  )
}
