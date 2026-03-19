import Link from 'next/link'
import { getDashboardStats, getActionsDuJour, getPendingReviewEmails, getStages } from '@/lib/actions'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { ActionsToday } from '@/components/dashboard/actions-today'
import { PendingSequenceEmails } from '@/components/dashboard/pending-sequence-emails'
import { WeeklyChecklist } from '@/components/dashboard/weekly-checklist'
import { CalendarWidget } from '@/components/dashboard/calendar-widget'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [stats, actionsDuJour, pendingSequenceEmails, stages] = await Promise.all([
    getDashboardStats(),
    getActionsDuJour(),
    getPendingReviewEmails().catch(() => []),
    getStages(),
  ])

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

        {/* Mobile quick-reply button */}
        <Link
          href="/quick-reply"
          className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3.5 text-base font-semibold text-white hover:bg-blue-700 md:hidden"
        >
          <span>&#9889;</span> Reponse rapide
        </Link>

        {/* KPI Cards */}
        <section className="mb-8">
          <KpiCards
            total={stats.total}
            clients={stats.clients}
            discussions={stats.discussions}
            enClosing={stats.enClosing}
          />
        </section>

        {/* Main content: 3-column layout */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left column: Aujourd'hui */}
          <div className="space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Aujourd&apos;hui
            </p>
            <section>
              <ActionsToday prospects={actionsDuJour} stages={stages} />
            </section>
            {pendingSequenceEmails && pendingSequenceEmails.length > 0 && (
              <section>
                <PendingSequenceEmails initialPending={pendingSequenceEmails} />
              </section>
            )}
          </div>

          {/* Middle column: Cette semaine */}
          <div className="space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Cette semaine
            </p>
            <section>
              <WeeklyChecklist />
            </section>
          </div>

          {/* Right column: Calendrier */}
          <div className="space-y-4">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
              Calendrier
            </p>
            <section>
              <CalendarWidget />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
