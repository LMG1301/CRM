'use client'

import { useState, useEffect } from 'react'
import { Calendar, ExternalLink, Loader2 } from 'lucide-react'

interface CalendarEvent {
  id: string
  title: string
  start: string
  end: string
  attendees: string[]
}

interface GroupedDay {
  label: string
  date: string
  events: CalendarEvent[]
}

const INTERNAL_DOMAIN = 'boostinc.com'

function isExternal(email: string): boolean {
  return !email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`)
}

function formatDayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const today = new Date()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)

  const dateOnly = (d: Date) => d.toISOString().split('T')[0]

  const formatted = date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })

  if (dateOnly(date) === dateOnly(today)) {
    return `Aujourd'hui — ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}`
  }
  if (dateOnly(date) === dateOnly(tomorrow)) {
    return `Demain — ${formatted.charAt(0).toUpperCase() + formatted.slice(1)}`
  }

  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function groupByDay(events: CalendarEvent[]): GroupedDay[] {
  const groups: Record<string, CalendarEvent[]> = {}

  for (const event of events) {
    const dayKey = event.start.includes('T')
      ? event.start.split('T')[0]
      : event.start
    if (!groups[dayKey]) groups[dayKey] = []
    groups[dayKey].push(event)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, events]) => ({
      label: formatDayLabel(date),
      date,
      events: events.sort((a, b) => a.start.localeCompare(b.start)),
    }))
}

export function AgendaWidget() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<CalendarEvent[]>([])

  useEffect(() => {
    fetch('/api/calendar/upcoming')
      .then(res => res.json())
      .then(data => {
        setConnected(data.connected)
        setEvents(data.events || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const grouped = groupByDay(events)

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-brand-accent" />
          <h3 className="text-sm font-semibold">Agenda</h3>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !connected ? (
          <div className="py-4 text-center">
            <Calendar className="mx-auto mb-2 size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Connectez Google Calendar dans les{' '}
              <a href="/settings" className="text-brand-accent hover:underline">
                Parametres
              </a>
            </p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-4 text-center">
            <p className="text-sm text-muted-foreground">Aucun event cette semaine</p>
          </div>
        ) : (
          <div className="space-y-4">
            {grouped.map((day) => (
              <div key={day.date}>
                <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {day.label}
                </p>
                <div className="space-y-1.5">
                  {day.events.map((event) => {
                    const hasExternalAttendees = event.attendees.some(isExternal)
                    const isAllDay = !event.start.includes('T')

                    return (
                      <div
                        key={event.id}
                        className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
                      >
                        <span
                          className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                            hasExternalAttendees ? 'bg-blue-400' : 'bg-white/30'
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-foreground">
                              {isAllDay ? 'Journee' : formatTime(event.start)}
                            </span>
                            {hasExternalAttendees && (
                              <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-medium text-blue-400">
                                Externe
                              </span>
                            )}
                            {!hasExternalAttendees && event.attendees.length > 0 && (
                              <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-medium text-white/50">
                                Interne
                              </span>
                            )}
                          </div>
                          <p className="truncate text-sm text-foreground/80">
                            {event.title}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {connected && (
          <div className="mt-4 border-t pt-3">
            <a
              href="https://calendar.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-brand-accent hover:underline"
            >
              Ouvrir Google Calendar
              <ExternalLink className="size-3" />
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
