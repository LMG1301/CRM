'use client'

import Link from 'next/link'
import {
  FileText,
  Phone,
  Mail,
  MailOpen,
  ArrowRightLeft,
  Mic,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Activity, ActivityType, Prospect } from '@/lib/types'

type ActivityWithProspect = Activity & { prospect?: Prospect }

interface RecentActivityProps {
  activities: ActivityWithProspect[]
}

const ACTIVITY_ICON_MAP: Record<ActivityType, typeof FileText> = {
  note: FileText,
  call: Phone,
  email_sent: Mail,
  email_received: MailOpen,
  status_change: ArrowRightLeft,
  transcription: Mic,
}

const ACTIVITY_COLOR_MAP: Record<ActivityType, string> = {
  note: 'text-slate-600 bg-slate-50',
  call: 'text-green-600 bg-green-50',
  email_sent: 'text-blue-600 bg-blue-50',
  email_received: 'text-indigo-600 bg-indigo-50',
  status_change: 'text-amber-600 bg-amber-50',
  transcription: 'text-purple-600 bg-purple-50',
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note: 'Note',
  call: 'Appel',
  email_sent: 'Email envoye',
  email_received: 'Email recu',
  status_change: 'Changement de statut',
  transcription: 'Transcription',
}

function timeAgo(dateStr: string): string {
  const now = Date.now()
  const date = new Date(dateStr).getTime()
  const diffMs = now - date

  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (minutes < 1) return "A l'instant"
  if (minutes < 60) return `Il y a ${minutes}min`
  if (hours < 24) return `Il y a ${hours}h`
  if (days === 1) return 'Hier'
  if (days < 7) return `Il y a ${days}j`
  if (days < 30) return `Il y a ${Math.floor(days / 7)} sem.`
  return `Il y a ${Math.floor(days / 30)} mois`
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength).trim() + '...'
}

export function RecentActivity({ activities }: RecentActivityProps) {
  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activite recente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aucune activite recente.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Activite recente</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {activities.map((activity) => {
            const Icon = ACTIVITY_ICON_MAP[activity.type] || FileText
            const colorClasses = ACTIVITY_COLOR_MAP[activity.type] || 'text-slate-600 bg-slate-50'
            const label = ACTIVITY_LABELS[activity.type] || activity.type
            const prospectName = activity.prospect
              ? `${activity.prospect.prenom} ${activity.prospect.nom}`.trim()
              : ''

            const wrapper = activity.prospect_id ? (
              <Link
                key={activity.id}
                href={`/prospects/${activity.prospect_id}`}
                className="group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-accent"
              >
                <ActivityRow
                  icon={<Icon className="h-4 w-4" />}
                  colorClasses={colorClasses}
                  label={label}
                  content={activity.content}
                  prospectName={prospectName}
                  time={timeAgo(activity.created_at)}
                />
              </Link>
            ) : (
              <div
                key={activity.id}
                className="flex items-start gap-3 rounded-lg p-3"
              >
                <ActivityRow
                  icon={<Icon className="h-4 w-4" />}
                  colorClasses={colorClasses}
                  label={label}
                  content={activity.content}
                  prospectName={prospectName}
                  time={timeAgo(activity.created_at)}
                />
              </div>
            )

            return wrapper
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function ActivityRow({
  icon,
  colorClasses,
  label,
  content,
  prospectName,
  time,
}: {
  icon: React.ReactNode
  colorClasses: string
  label: string
  content: string
  prospectName: string
  time: string
}) {
  return (
    <>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${colorClasses}`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{label}</span>
          {prospectName && (
            <>
              <span className="text-muted-foreground">-</span>
              <span className="text-sm text-muted-foreground truncate">
                {prospectName}
              </span>
            </>
          )}
        </div>
        {content && (
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            {truncate(content, 120)}
          </p>
        )}
      </div>
      <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap pt-0.5">
        {time}
      </span>
    </>
  )
}
