'use client'

import { useState, useEffect } from 'react'
import { CalendarDays, ExternalLink, Loader2, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; responseStatus?: string }[]
  status: string
  htmlLink: string
  prospect?: { name: string; entreprise: string }
}

interface ProspectMeetingsProps {
  prospectName: string
  prospectEmail?: string
}

export function ProspectMeetings({ prospectName, prospectEmail }: ProspectMeetingsProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/calendar/events')
      .then(res => res.json())
      .then(data => {
        const all = (data.events || []) as CalendarEvent[]
        // Filter events related to this prospect (by email in attendees or name in summary)
        const nameLower = prospectName.toLowerCase()
        const emailLower = prospectEmail?.toLowerCase()

        const related = all.filter(event => {
          // Check attendees
          if (emailLower && event.attendees?.some(a => a.email?.toLowerCase() === emailLower)) {
            return true
          }
          // Check summary contains prospect name
          if (nameLower && event.summary?.toLowerCase().includes(nameLower)) {
            return true
          }
          return false
        })

        setEvents(related)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [prospectName, prospectEmail])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" />
            Meetings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (events.length === 0) return null

  const now = new Date()
  const upcoming = events.filter(e => {
    const d = new Date(e.start.dateTime || e.start.date || '')
    return d >= now
  })
  const past = events.filter(e => {
    const d = new Date(e.start.dateTime || e.start.date || '')
    return d < now
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4" />
          Meetings
          <Badge variant="secondary" className="text-xs">{events.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {upcoming.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">A venir</p>
            <div className="space-y-2">
              {upcoming.map(event => (
                <MeetingRow key={event.id} event={event} variant="upcoming" />
              ))}
            </div>
          </div>
        )}
        {past.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Passes</p>
            <div className="space-y-2">
              {past.slice(0, 5).map(event => (
                <MeetingRow key={event.id} event={event} variant="past" />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MeetingRow({ event, variant }: { event: CalendarEvent; variant: 'upcoming' | 'past' }) {
  const startDate = new Date(event.start.dateTime || event.start.date || '')
  const isAllDay = !event.start.dateTime

  const dateLabel = startDate.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  const timeLabel = isAllDay
    ? 'Journee entiere'
    : startDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  const attendeeCount = (event.attendees || []).length

  return (
    <a
      href={event.htmlLink}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'flex items-center justify-between rounded-md border px-3 py-2 transition-colors hover:bg-muted/50',
        variant === 'upcoming'
          ? 'border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20'
          : 'border-muted opacity-70'
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{event.summary}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{dateLabel}</span>
          <span>&middot;</span>
          <span>{timeLabel}</span>
          {attendeeCount > 1 && (
            <>
              <span>&middot;</span>
              <span className="flex items-center gap-0.5">
                <Users className="size-3" />
                {attendeeCount}
              </span>
            </>
          )}
        </div>
      </div>
      <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
    </a>
  )
}
