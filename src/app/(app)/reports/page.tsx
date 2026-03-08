import { getProspects, getRecentActivities, getDashboardStats, getEmailStats } from '@/lib/actions'
import { ReportGenerator } from '@/components/reports/report-generator'
import { FileBarChart } from 'lucide-react'

export default async function ReportsPage() {
  const [prospects, recentActivities, stats, emailStats] = await Promise.all([
    getProspects(),
    getRecentActivities(50),
    getDashboardStats(),
    getEmailStats(),
  ])

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <FileBarChart className="size-6" />
            Rapports
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generez des rapports structures a partir de vos donnees CRM. Le rapport est copie avec un prompt pour Claude.
          </p>
        </div>

        <ReportGenerator
          data={{
            prospects,
            recentActivities,
            stats,
            emailStats,
          }}
        />
      </div>
    </div>
  )
}
