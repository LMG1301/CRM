'use client'

import { useState } from 'react'
import { FileBarChart, ClipboardCopy, Check, Loader2, Calendar, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toLocalDateString } from '@/lib/utils'
import type { Prospect, Activity } from '@/lib/types'

interface ReportData {
  prospects: Prospect[]
  recentActivities: (Activity & { prospect?: Prospect })[]
  stats: {
    total: number
    clients: number
    discussions: number
    tauxReponse: number
    byStage: Record<string, number>
    byCategorie: Record<string, number>
  }
  emailStats: {
    total: number
    sent: number
    received: number
    thisWeek: number
  }
}

interface ReportGeneratorProps {
  data: ReportData
}

type ReportType = 'weekly' | 'bimonthly'

function generateWeeklyReport(data: ReportData): string {
  const today = new Date()
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  // Recent activities (last 7 days)
  const recentActs = data.recentActivities.filter(
    a => new Date(a.created_at) >= weekAgo
  )

  // Prospects with upcoming actions
  const actionsDues = data.prospects.filter(p => {
    if (!p.date_prochaine_action) return false
    return p.date_prochaine_action <= toLocalDateString(today)
  })

  const upcoming = data.prospects.filter(p => {
    if (!p.date_prochaine_action) return false
    const d = p.date_prochaine_action
    const nextWeek = new Date()
    nextWeek.setDate(nextWeek.getDate() + 7)
    return d > toLocalDateString(today) && d <= toLocalDateString(nextWeek)
  })

  let report = `# Weekly Check-in — ${today.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`

  report += `## Metriques cles\n`
  report += `- Total prospects : ${data.stats.total}\n`
  report += `- Clients : ${data.stats.clients}\n`
  report += `- Discussions actives : ${data.stats.discussions}\n`
  report += `- Taux de reponse : ${data.stats.tauxReponse}%\n`
  report += `- Emails cette semaine : ${data.emailStats.thisWeek} (${data.emailStats.sent} envoyes, ${data.emailStats.received} recus)\n\n`

  report += `## Pipeline\n`
  for (const [stage, count] of Object.entries(data.stats.byStage)) {
    report += `- ${stage} : ${count}\n`
  }
  report += '\n'

  if (actionsDues.length > 0) {
    report += `## Actions en retard (${actionsDues.length})\n`
    for (const p of actionsDues.slice(0, 10)) {
      report += `- ${p.prenom} ${p.nom} (${p.entreprise || '—'}) — ${p.type_prochaine_action || 'Action'} prevue le ${p.date_prochaine_action}\n`
    }
    if (actionsDues.length > 10) report += `- ... et ${actionsDues.length - 10} autres\n`
    report += '\n'
  }

  if (upcoming.length > 0) {
    report += `## Actions cette semaine (${upcoming.length})\n`
    for (const p of upcoming.slice(0, 10)) {
      report += `- ${p.prenom} ${p.nom} (${p.entreprise || '—'}) — ${p.type_prochaine_action || 'Action'} le ${p.date_prochaine_action}\n`
    }
    report += '\n'
  }

  if (recentActs.length > 0) {
    report += `## Activites recentes (${recentActs.length} cette semaine)\n`
    for (const a of recentActs.slice(0, 15)) {
      const name = a.prospect ? `${a.prospect.prenom} ${a.prospect.nom}` : '—'
      report += `- [${a.type}] ${name} : ${a.content || '—'}\n`
    }
    report += '\n'
  }

  report += `---\n`
  report += `Genere automatiquement par Boost CRM le ${today.toLocaleString('fr-FR')}\n`

  return report
}

function generateBimonthlyReport(data: ReportData): string {
  const today = new Date()

  let report = `# Sales Review Bi-mensuel — ${today.toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}\n\n`

  report += `## Vue d'ensemble\n`
  report += `- **Total prospects** : ${data.stats.total}\n`
  report += `- **Clients convertis** : ${data.stats.clients}\n`
  report += `- **Taux de conversion** : ${data.stats.total > 0 ? Math.round(data.stats.clients / data.stats.total * 100) : 0}%\n`
  report += `- **Discussions actives** : ${data.stats.discussions}\n`
  report += `- **Taux de reponse** : ${data.stats.tauxReponse}%\n\n`

  report += `## Repartition par etape\n`
  for (const [stage, count] of Object.entries(data.stats.byStage)) {
    const pct = data.stats.total > 0 ? Math.round(count / data.stats.total * 100) : 0
    report += `- **${stage}** : ${count} (${pct}%)\n`
  }
  report += '\n'

  report += `## Repartition par categorie\n`
  for (const [cat, count] of Object.entries(data.stats.byCategorie)) {
    report += `- ${cat} : ${count}\n`
  }
  report += '\n'

  report += `## Activite email\n`
  report += `- Total : ${data.emailStats.total}\n`
  report += `- Envoyes : ${data.emailStats.sent}\n`
  report += `- Recus : ${data.emailStats.received}\n\n`

  // Top prospects in discussion
  const inDiscussion = data.prospects.filter(p =>
    ['devis', 'repondu', 'onboarding'].includes(p.pipeline_stage)
  )
  if (inDiscussion.length > 0) {
    report += `## Deals en cours (${inDiscussion.length})\n`
    for (const p of inDiscussion.slice(0, 15)) {
      report += `- **${p.prenom} ${p.nom}** — ${p.entreprise || '—'} — Stage: ${p.pipeline_stage}\n`
    }
    report += '\n'
  }

  // Prospects contacted recently
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
  const recentContacts = data.prospects.filter(p =>
    p.date_dernier_contact && new Date(p.date_dernier_contact) >= twoWeeksAgo
  )
  report += `## Contacts recents (14 derniers jours) : ${recentContacts.length} prospects\n\n`

  report += `---\n`
  report += `Genere automatiquement par Boost CRM le ${today.toLocaleString('fr-FR')}\n`

  return report
}

export function ReportGenerator({ data }: ReportGeneratorProps) {
  const [generating, setGenerating] = useState<ReportType | null>(null)
  const [copied, setCopied] = useState<ReportType | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const handleGenerate = async (type: ReportType) => {
    setGenerating(type)
    setCopied(null)
    setPreview(null)

    let report: string

    if (type === 'weekly') {
      // Call AI API for weekly reports
      try {
        const res = await fetch('/api/ai/generate-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'weekly' }),
        })
        if (!res.ok) throw new Error('API error')
        const json = await res.json()
        report = json.report || ''
        if (!report) throw new Error('Empty report')
      } catch {
        // Fallback to local generation
        report = generateWeeklyReport(data)
      }
    } else {
      report = generateBimonthlyReport(data)
    }

    setPreview(report)

    // Copy to clipboard
    try {
      await navigator.clipboard.writeText(report)
      setCopied(type)
      setTimeout(() => setCopied(null), 3000)
    } catch {
      // Clipboard API may fail silently
    }

    setGenerating(null)
  }

  const reports = [
    {
      type: 'weekly' as ReportType,
      title: 'Weekly Check-in',
      description: 'Rapport IA : recap semaine, priorites, points d\'attention.',
      icon: Calendar,
      color: 'text-brand-accent',
      bgColor: 'bg-brand-accent/10',
    },
    {
      type: 'bimonthly' as ReportType,
      title: 'Sales Review (bi-mensuel)',
      description: 'Rapport complet : pipeline, conversion, deals en cours, analyse par categorie.',
      icon: TrendingUp,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reports.map((r) => {
          const Icon = r.icon
          const isGenerating = generating === r.type
          const isCopied = copied === r.type

          return (
            <Card key={r.type}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${r.bgColor}`}>
                    <Icon className={`h-5 w-5 ${r.color}`} />
                  </div>
                  {r.title}
                </CardTitle>
                <CardDescription className="text-xs">
                  {r.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => handleGenerate(r.type)}
                  disabled={isGenerating}
                  variant="outline"
                  className="w-full"
                >
                  {isGenerating ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : isCopied ? (
                    <Check className="size-4" />
                  ) : (
                    <ClipboardCopy className="size-4" />
                  )}
                  {isGenerating ? (r.type === 'weekly' ? 'Generation IA...' : 'Generation...') : isCopied ? 'Copie dans le presse-papier !' : 'Generer et copier'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileBarChart className="size-5" />
              Apercu du rapport
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[500px] overflow-auto whitespace-pre-wrap rounded-lg bg-white/5 p-4 text-xs leading-relaxed text-foreground/80">
              {preview}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
