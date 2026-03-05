import { getDashboardStats, getActionsDuJour, getRecentActivities, getProspects } from '@/lib/actions'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { ActionsToday } from '@/components/dashboard/actions-today'
import { HotProspects } from '@/components/dashboard/hot-prospects'
import { RecentActivity } from '@/components/dashboard/recent-activity'

export default async function DashboardPage() {
  const [stats, actionsDuJour, recentActivities, allProspects] = await Promise.all([
    getDashboardStats(),
    getActionsDuJour(),
    getRecentActivities(10),
    getProspects(),
  ])

  // Hot prospects: those in active discussion stages, limited to 8
  const hotProspects = allProspects
    .filter((p) =>
      ['repondu', 'call_decouverte', 'devis'].includes(p.pipeline_stage)
    )
    .slice(0, 8)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vue d&apos;ensemble de votre activite commerciale
          </p>
        </div>

        {/* KPI Cards */}
        <section className="mb-8">
          <KpiCards
            total={stats.total}
            clients={stats.clients}
            discussions={stats.discussions}
            tauxReponse={stats.tauxReponse}
          />
        </section>

        {/* Main content: 2-column layout */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-5">
          {/* Left column - Actions & Hot prospects */}
          <div className="space-y-8 lg:col-span-3">
            <section>
              <ActionsToday prospects={actionsDuJour} />
            </section>

            <section>
              <HotProspects prospects={hotProspects} />
            </section>
          </div>

          {/* Right column - Recent activity */}
          <div className="lg:col-span-2">
            <section>
              <RecentActivity activities={recentActivities} />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
