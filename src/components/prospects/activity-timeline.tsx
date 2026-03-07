'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Activity } from '@/lib/types'
import { ACTIVITY_LABELS, ACTIVITY_ICONS } from '@/lib/types'
import { deleteActivity } from '@/lib/actions'
import { useRouter } from 'next/navigation'

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

const CONTENT_PREVIEW_LENGTH = 150
const COLLAPSE_THRESHOLD = 200  // Collapse notes longer than this

function ActivityEntry({ activity, onDelete }: { activity: Activity; onDelete: (id: string) => void }) {
  const isLong = activity.content.length > COLLAPSE_THRESHOLD
  const [expanded, setExpanded] = useState(!isLong)  // Collapsed by default if long
  const [confirmDelete, setConfirmDelete] = useState(false)
  const icon = ACTIVITY_ICONS[activity.type] || '📌'
  const label = ACTIVITY_LABELS[activity.type] || activity.type
  const hasTranscriptionMeta =
    activity.type === 'call' &&
    activity.metadata?.transcription &&
    typeof activity.metadata.transcription === 'string'

  const displayContent =
    !expanded && isLong
      ? activity.content.slice(0, CONTENT_PREVIEW_LENGTH) + '...'
      : activity.content

  // Show match reason badge for Genspark notes
  const matchReason = activity.metadata?.match_reason as string | undefined

  const isEmail = activity.type === 'email_sent' || activity.type === 'email_received'
  const isSent = activity.type === 'email_sent'
  const emailFrom = activity.metadata?.from as string | undefined
  const emailTo = activity.metadata?.to as string | undefined

  return (
    <div className={`group relative flex gap-4 pb-6 last:pb-0 ${isEmail ? `rounded-lg border-l-2 pl-2 ${isSent ? 'border-l-brand-accent/60' : 'border-l-indigo-400/60'}` : ''}`}>
      {/* Timeline line */}
      <div className="absolute left-[18px] top-10 bottom-0 w-px bg-white/10 last:hidden" />

      {/* Icon — colored for emails */}
      <div className={`relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full text-lg ${
        isSent ? 'bg-brand-accent/15' : activity.type === 'email_received' ? 'bg-indigo-500/15' : 'bg-white/10'
      }`}>
        {icon}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${isSent ? 'text-brand-accent' : activity.type === 'email_received' ? 'text-indigo-400' : 'text-foreground'}`}>{label}</span>
          {isEmail && (
            <span className="text-[10px] text-muted-foreground">
              {isSent ? `→ ${emailTo || ''}` : `← ${emailFrom || ''}`}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatRelativeDate(activity.created_at)}
          </span>

          {/* Expand/collapse toggle for long content */}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
              title={expanded ? 'Reduire' : 'Developper'}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          )}

          {/* Delete button */}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400 p-1 rounded"
              title="Supprimer"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
                onClick={() => onDelete(activity.id)}
              >
                Supprimer
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="text-xs"
                onClick={() => setConfirmDelete(false)}
              >
                Annuler
              </Button>
            </div>
          )}
        </div>

        {/* Match reason badge */}
        {matchReason && (
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-accent/10 px-2 py-0.5 text-[10px] text-brand-accent">
            🔗 Matche : {matchReason}
          </div>
        )}

        {activity.content && (
          <div className="mt-1">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {displayContent}
            </p>
            {isLong && !expanded && (
              <Button
                variant="ghost"
                size="xs"
                className="mt-1 text-xs text-brand-accent hover:text-brand-accent/80"
                onClick={() => setExpanded(true)}
              >
                <ChevronDown className="size-3" />
                Voir plus
              </Button>
            )}
          </div>
        )}

        {hasTranscriptionMeta ? (
          <TranscriptionBlock
            text={String(activity.metadata.transcription)}
          />
        ) : null}

        {/* Subject shown as badge for emails without body in content */}
        {isEmail && activity.metadata?.subject && !activity.content.startsWith('Objet') ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Objet : {String(activity.metadata.subject)}
          </p>
        ) : null}

        {activity.type === 'meeting' && activity.metadata?.source === 'genspark' ? (
          <MeetingNoteBlock metadata={activity.metadata} />
        ) : null}

        {expanded && activity.type === 'meeting' && activity.metadata?.action_items &&
          Array.isArray(activity.metadata.action_items) &&
          (activity.metadata.action_items as Array<{text: string; assignee: string | null}>).length > 0 ? (
            <div className="mt-2 rounded-md border border-brand-accent/20 bg-brand-accent/5 px-3 py-2">
              <p className="text-xs font-medium text-brand-accent mb-1">Actions a suivre</p>
              {(activity.metadata.action_items as Array<{text: string; assignee: string | null}>).map((item, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {item.assignee ? `${item.assignee}: ` : '- '}{item.text}
                </p>
              ))}
            </div>
          ) : null}
      </div>
    </div>
  )
}

function MeetingNoteBlock({ metadata }: { metadata: Record<string, unknown> }) {
  const companies = metadata.companies as string[] | undefined
  const participants = metadata.participants as string[] | undefined

  return (
    <div className="mt-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded bg-brand-accent/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-accent">Genspark</span>
        <span className="font-medium text-foreground/80">
          {metadata.meeting_title ? String(metadata.meeting_title) : 'Notes de reunion'}
        </span>
      </div>
      {typeof metadata.meeting_date === 'string' && (
        <p className="text-[11px] text-muted-foreground">
          📅 {new Date(metadata.meeting_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
      {companies && companies.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          🏢 {companies.join(', ')}
        </p>
      )}
      {participants && participants.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          👥 {participants.join(', ')}
        </p>
      )}
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
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleDelete = async (id: string) => {
    try {
      await deleteActivity(id)
      startTransition(() => {
        router.refresh()
      })
    } catch {
      // silently fail
    }
  }

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
    <div className={`space-y-0 ${isPending ? 'opacity-50' : ''}`}>
      {activities.map((activity) => (
        <ActivityEntry key={activity.id} activity={activity} onDelete={handleDelete} />
      ))}
    </div>
  )
}
