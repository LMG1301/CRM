import { getDashboardStats, getActionsDuJour, getRecentActivities, getProspects, getIntegrations, getEmailStats, getPendingReviewEmails } from '@/lib/actions'
import { supabase } from '@/lib/supabase'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { ActionsToday } from '@/components/dashboard/actions-today'
import { TasksToday } from '@/components/dashboard/tasks-today'
import { HotProspects } from '@/components/dashboard/hot-prospects'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { IntegrationStatus } from '@/components/dashboard/integration-status'
import { EmailStats } from '@/components/dashboard/email-stats'
import { PendingSequenceEmails } from '@/components/dashboard/pending-sequence-emails'
import { toLocalDateString } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const today = toLocalDateString(new Date())

  const [stats, actionsDuJour, recentActivities, allProspects, integrations, emailStats, tasksDuJour, pendingSequenceEmails] = await Promise.all([
    getDashboardStats(),
    getActionsDuJour(),
    getRecentActivities(10),
    getProspects(),
    getIntegrations().catch(() => []),
    getEmailStats().catch(() => ({ total: 0, sent: 0, received: 0, thisWeek: 0 })),
    Promise.resolve(
      supabase
        .from('tasks')
        .select('*, prospect:prospects(prenom, nom, entreprise)')
        .eq('status', 'pending')
        .lte('due_date', `${today}T23:59:59`)
        .order('due_date')
    ).then(({ data }) => data || []).catch(() => []),
    getPendingReviewEmails().catch(() => []),
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

            {pendingSequenceEmails.length > 0 && (
              <section>
                <PendingSequenceEmails initialPending={pendingSequenceEmails} />
              </section>
            )}

            {tasksDuJour.length > 0 && (
              <section>
                <TasksToday initialTasks={tasksDuJour} />
              </section>
            )}

            <section>
              <HotProspects prospects={hotProspects} />
            </section>
          </div>

          {/* Right column - Activity + Integrations */}
          <div className="space-y-8 lg:col-span-2">
            <section>
              <RecentActivity activities={recentActivities} />
            </section>

            {emailStats.total > 0 && (
              <section>
                <EmailStats
                  total={emailStats.total}
                  sent={emailStats.sent}
                  received={emailStats.received}
                  thisWeek={emailStats.thisWeek}
                />
              </section>
            )}

            {integrations.length > 0 && (
              <section>
                <IntegrationStatus integrations={integrations} />
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
