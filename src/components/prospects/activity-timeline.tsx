'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Activity } from '@/lib/types'
import { ACTIVITY_LABELS, ACTIVITY_ICONS } from '@/lib/types'

interface ActivityTimelineProps {
  activities: Activity[]
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffSeconds < 60) return "A l'instant"
  if (diffMinutes < 60)
    return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`
  if (diffHours < 24)
    return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`
  if (diffDays < 7)
    return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`
  if (diffWeeks < 5)
    return `Il y a ${diffWeeks} semaine${diffWeeks > 1 ? 's' : ''}`
  if (diffMonths < 12)
    return `Il y a ${diffMonths} mois`
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const CONTENT_PREVIEW_LENGTH = 200

function ActivityEntry({ activity }: { activity: Activity }) {
  const [expanded, setExpanded] = useState(false)
  const icon = ACTIVITY_ICONS[activity.type] || '📌'
  const label = ACTIVITY_LABELS[activity.type] || activity.type
  const isLong = activity.content.length > CONTENT_PREVIEW_LENGTH
  const isTranscription = activity.type === 'transcription'
  const hasTranscriptionMeta =
    activity.type === 'call' &&
    activity.metadata?.transcription &&
    typeof activity.metadata.transcription === 'string'

  const displayContent =
    !expanded && isLong
      ? activity.content.slice(0, CONTENT_PREVIEW_LENGTH) + '...'
      : activity.content

  return (
    <div className="relative flex gap-4 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[18px] top-10 bottom-0 w-px bg-white/10 last:hidden" />

      {/* Icon */}
      <div className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-lg">
        {icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeDate(activity.created_at)}
          </span>
        </div>

        {activity.content && (
          <div className="mt-1">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {displayContent}
            </p>
            {isLong && (
              <Button
                variant="ghost"
                size="xs"
                className="mt-1 text-xs text-brand-accent hover:text-brand-accent/80"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="size-3" />
                    Voir moins
                  </>
                ) : (
                  <>
                    <ChevronDown className="size-3" />
                    Voir plus
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {hasTranscriptionMeta ? (
          <TranscriptionBlock
            text={String(activity.metadata.transcription)}
          />
        ) : null}

        {(activity.type === 'email_sent' || activity.type === 'email_received') &&
          activity.metadata?.subject ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Objet : {String(activity.metadata.subject)}
            </p>
          ) : null}
      </div>
    </div>
  )
}

function TranscriptionBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="mt-2 rounded-md border border-white/10 bg-white/5">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-foreground/80 hover:bg-white/10 transition-colors"
      >
        <span>Transcription</span>
        {open ? (
          <ChevronUp className="size-3.5" />
        ) : (
          <ChevronDown className="size-3.5" />
        )}
      </button>
      {open && (
        <div className="border-t border-white/10 px-3 py-2">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {text}
          </p>
        </div>
      )}
    </div>
  )
}

export function ActivityTimeline({ activities }: ActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Aucune activite pour ce prospect.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {activities.map((activity) => (
        <ActivityEntry key={activity.id} activity={activity} />
      ))}
    </div>
  )
}
