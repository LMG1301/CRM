'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ───

interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  allDay: boolean
  attendees: string[]
  location: string | null
  color: string | null
}

const INTERNAL_DOMAIN = 'boostinc.com'

function isExternal(email: string): boolean {
  return !!email && !email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`)
}

function hasExternalAttendees(ev: CalEvent): boolean {
  return ev.attendees.some(isExternal)
}

// ─── Date helpers ───

function getMonthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function getMonthLabel(d: Date): string {
  return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    .replace(/^\w/, c => c.toUpperCase())
}

/** Generate 6 weeks of dates for a month grid (Monday-start) */
function getMonthGrid(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1)
  const dayOfWeek = firstDay.getDay()
  const startOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const gridStart = new Date(year, month, 1 + startOffset)

  const weeks: Date[][] = []
  const current = new Date(gridStart)

  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }

  // Remove trailing empty weeks (weeks entirely in next month)
  while (weeks.length > 4) {
    const lastWeek = weeks[weeks.length - 1]
    if (lastWeek[0].getMonth() !== month) {
      weeks.pop()
    } else {
      break
    }
  }

  return weeks
}

/** Get events for a specific day */
function getEventsForDay(events: CalEvent[], day: Date): CalEvent[] {
  const dayStr = toDateStr(day)
  return events.filter((ev) => {
    const evStart = ev.start.split('T')[0]
    const evEnd = ev.end.split('T')[0]

    if (ev.allDay) {
      // All-day events: end date is exclusive in Google Calendar
      const endDate = new Date(evEnd)
      endDate.setDate(endDate.getDate() - 1)
      return dayStr >= evStart && dayStr <= toDateStr(endDate)
    }

    // Timed events
    return evStart === dayStr
  })
}

/** Check if an event spans multiple days */
function isMultiDay(ev: CalEvent): boolean {
  if (!ev.allDay) return false
  const startStr = ev.start.split('T')[0]
  const endDate = new Date(ev.end.split('T')[0])
  endDate.setDate(endDate.getDate() - 1)
  return toDateStr(endDate) > startStr
}

// ─── Day Popover ───

function DayPopover({
  day,
  events,
  onClose,
}: {
  day: Date
  events: CalEvent[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [onClose])

  const label = day.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <div
      ref={ref}
      className="absolute z-50 top-full left-0 mt-1 w-64 rounded-lg border bg-background shadow-xl p-3 space-y-2"
    >
      <p className="text-xs font-semibold text-muted-foreground capitalize">
        {label}
      </p>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun event</p>
      ) : (
        events.map((ev) => {
          const ext = hasExternalAttendees(ev)
          return (
            <a
              key={ev.id}
              href={`https://calendar.google.com/calendar/event?eid=${btoa(ev.id.split('_')[0] + ' primary')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded-md px-2 py-1 hover:bg-white/5 transition-colors"
            >
              <span
                className={cn(
                  'mt-1.5 size-1.5 shrink-0 rounded-full',
                  ext ? 'bg-blue-400' : 'bg-white/30',
                )}
              />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-foreground">
                  {ev.allDay ? 'Journee' : formatTime(ev.start)}
                </span>
                <p className="text-xs text-foreground/80 truncate">
                  {ev.title}
                </p>
                {ext && (
                  <span className="text-[9px] text-blue-400">Externe</span>
                )}
              </div>
            </a>
          )
        })
      )}
    </div>
  )
}

// ─── Month View ───

function MonthView({
  year,
  month,
  events,
  today,
}: {
  year: number
  month: number
  events: CalEvent[]
  today: Date
}) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const weeks = getMonthGrid(year, month)
  const dayNames = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di']

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold text-muted-foreground py-1"
          >
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7 border-t border-l border-white/[0.06]">
        {weeks.flat().map((day, i) => {
          const isCurrentMonth = day.getMonth() === month
          const isToday = isSameDay(day, today)
          const dayEvents = getEventsForDay(events, day)
          const isSelected =
            selectedDay !== null && isSameDay(day, selectedDay)

          // Show max 2 event chips, then "+N"
          const singleDayEvents = dayEvents.filter((e) => !isMultiDay(e))
          const multiDayEvents = dayEvents.filter((e) => isMultiDay(e))
          const visibleSingle = singleDayEvents.slice(0, 2 - Math.min(multiDayEvents.length, 1))
          const remaining =
            dayEvents.length - visibleSingle.length - Math.min(multiDayEvents.length, 1)

          return (
            <div
              key={i}
              className={cn(
                'relative border-r border-b border-white/[0.06] min-h-[70px] p-0.5 cursor-pointer transition-colors',
                !isCurrentMonth && 'opacity-30',
                isToday && 'bg-brand-accent/10',
                isSelected && 'bg-white/[0.06]',
              )}
              onClick={() =>
                setSelectedDay(isSelected ? null : day)
              }
            >
              {/* Day number */}
              <div className="flex items-center justify-between px-1">
                <span
                  className={cn(
                    'text-[11px] font-medium',
                    isToday &&
                      'flex h-5 w-5 items-center justify-center rounded-full bg-brand-accent text-white text-[10px]',
                    !isToday && !isCurrentMonth && 'text-muted-foreground',
                    !isToday && isCurrentMonth && 'text-foreground/70',
                  )}
                >
                  {day.getDate()}
                </span>
              </div>

              {/* Multi-day events */}
              {multiDayEvents.slice(0, 1).map((ev) => (
                <div
                  key={ev.id}
                  className={cn(
                    'mx-0.5 mb-0.5 truncate rounded px-1 py-px text-[9px] font-medium leading-tight',
                    hasExternalAttendees(ev)
                      ? 'bg-violet-500/30 text-violet-300'
                      : 'bg-orange-500/30 text-orange-300',
                  )}
                  title={ev.title}
                >
                  {ev.title.slice(0, 10)}
                </div>
              ))}

              {/* Single-day events */}
              {visibleSingle.map((ev) => (
                <div
                  key={ev.id}
                  className={cn(
                    'mx-0.5 mb-0.5 truncate rounded px-1 py-px text-[9px] font-medium leading-tight',
                    hasExternalAttendees(ev)
                      ? 'bg-blue-500/25 text-blue-300'
                      : 'bg-white/10 text-white/60',
                  )}
                  title={`${ev.allDay ? '' : formatTime(ev.start) + ' '}${ev.title}`}
                >
                  {ev.allDay ? '' : formatTime(ev.start).slice(0, 5) + ' '}
                  {ev.title.slice(0, 8)}
                </div>
              ))}

              {/* Overflow */}
              {remaining > 0 && (
                <div className="mx-0.5 text-[9px] text-muted-foreground">
                  +{remaining}
                </div>
              )}

              {/* Popover */}
              {isSelected && dayEvents.length > 0 && (
                <DayPopover
                  day={day}
                  events={dayEvents}
                  onClose={() => setSelectedDay(null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Quarter View (compact) ───

function QuarterView({
  year,
  month,
  events,
  today,
}: {
  year: number
  month: number
  events: CalEvent[]
  today: Date
}) {
  const months = [month, month + 1, month + 2].map((m) => {
    const y = year + Math.floor(m / 12)
    const mo = m % 12
    return { year: y, month: mo }
  })

  return (
    <div className="grid grid-cols-3 gap-3">
      {months.map(({ year: y, month: m }) => (
        <MiniMonth key={`${y}-${m}`} year={y} month={m} events={events} today={today} />
      ))}
    </div>
  )
}

function MiniMonth({
  year,
  month,
  events,
  today,
}: {
  year: number
  month: number
  events: CalEvent[]
  today: Date
}) {
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const weeks = getMonthGrid(year, month)
  const label = new Date(year, month).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })

  return (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground capitalize mb-1">
        {label}
      </p>
      <div className="grid grid-cols-7 gap-px">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div
            key={i}
            className="text-center text-[8px] text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {weeks.flat().map((day, i) => {
          const isCurrentMonth = day.getMonth() === month
          const isToday = isSameDay(day, today)
          const dayEvents = getEventsForDay(events, day)
          const hasEvents = dayEvents.length > 0
          const isSelected =
            selectedDay !== null && isSameDay(day, selectedDay)

          return (
            <div
              key={i}
              className={cn(
                'relative text-center text-[9px] py-0.5 cursor-pointer rounded',
                !isCurrentMonth && 'opacity-20',
                isToday && 'bg-brand-accent/20 font-bold',
                isSelected && 'bg-white/10',
              )}
              onClick={() => {
                if (hasEvents) {
                  setSelectedDay(isSelected ? null : day)
                }
              }}
            >
              <span className={cn(isToday && 'text-brand-accent')}>
                {day.getDate()}
              </span>
              {hasEvents && isCurrentMonth && (
                <span
                  className={cn(
                    'absolute bottom-0 left-1/2 -translate-x-1/2 size-1 rounded-full',
                    dayEvents.some(hasExternalAttendees)
                      ? 'bg-blue-400'
                      : 'bg-white/40',
                  )}
                />
              )}
              {isSelected && dayEvents.length > 0 && (
                <DayPopover
                  day={day}
                  events={dayEvents}
                  onClose={() => setSelectedDay(null)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main CalendarWidget ───

type ViewMode = 'month' | 'quarter'

export function CalendarWidget() {
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(() => {
    // Snap to quarter start (Jan=0, Apr=3, Jul=6, Oct=9)
    const quarterStart = Math.floor(today.getMonth() / 3) * 3
    return new Date(today.getFullYear(), quarterStart, 1)
  })
  const [viewMode, setViewMode] = useState<ViewMode>('quarter')
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [events, setEvents] = useState<CalEvent[]>([])

  const fetchEvents = useCallback(async (date: Date, mode: ViewMode) => {
    setLoading(true)
    try {
      const months =
        mode === 'quarter'
          ? [0, 1, 2].map((offset) => {
              const d = new Date(date.getFullYear(), date.getMonth() + offset, 1)
              return getMonthKey(d)
            })
          : [getMonthKey(date)]

      const allEvents: CalEvent[] = []

      for (const m of months) {
        const res = await fetch(`/api/calendar/month?month=${m}`)
        const data = await res.json()
        setConnected(data.connected)
        if (data.events) {
          allEvents.push(...data.events)
        }
      }

      // Deduplicate by id
      const seen = new Set<string>()
      const deduped = allEvents.filter((e) => {
        if (seen.has(e.id)) return false
        seen.add(e.id)
        return true
      })

      setEvents(deduped)
    } catch {
      setConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEvents(currentDate, viewMode)
  }, [currentDate, viewMode, fetchEvents])

  const goToPrev = () => {
    setCurrentDate((d) => {
      const step = viewMode === 'quarter' ? 3 : 1
      return new Date(d.getFullYear(), d.getMonth() - step, 1)
    })
  }

  const goToNext = () => {
    setCurrentDate((d) => {
      const step = viewMode === 'quarter' ? 3 : 1
      return new Date(d.getFullYear(), d.getMonth() + step, 1)
    })
  }

  const headerLabel =
    viewMode === 'quarter'
      ? (() => {
          const q =
            Math.floor(currentDate.getMonth() / 3) + 1
          return `T${q} ${currentDate.getFullYear()}`
        })()
      : getMonthLabel(currentDate)

  return (
    <div className="rounded-xl border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar className="size-4 text-brand-accent" />
          <h3 className="text-sm font-semibold">Calendrier</h3>
        </div>
      </div>

      <div className="p-3">
        {/* Navigation */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button
              onClick={goToPrev}
              className="rounded p-1 hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="size-4 text-muted-foreground" />
            </button>
            <span className="text-sm font-semibold min-w-[140px] text-center capitalize">
              {headerLabel}
            </span>
            <button
              onClick={goToNext}
              className="rounded p-1 hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
            <button
              onClick={() => {
                setViewMode('month')
              }}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium transition-colors',
                viewMode === 'month'
                  ? 'bg-brand-accent text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Mois
            </button>
            <button
              onClick={() => {
                setViewMode('quarter')
                // Snap to quarter start
                setCurrentDate((d) => {
                  const qStart = Math.floor(d.getMonth() / 3) * 3
                  return new Date(d.getFullYear(), qStart, 1)
                })
              }}
              className={cn(
                'px-2.5 py-1 text-[10px] font-medium transition-colors',
                viewMode === 'quarter'
                  ? 'bg-brand-accent text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Trimestre
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !connected ? (
          <div className="py-8 text-center">
            <Calendar className="mx-auto mb-2 size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Connectez Google Calendar dans les{' '}
              <a href="/settings" className="text-brand-accent hover:underline">
                Parametres
              </a>{' '}
              pour voir votre agenda
            </p>
          </div>
        ) : viewMode === 'month' ? (
          <MonthView
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            events={events}
            today={today}
          />
        ) : (
          <QuarterView
            year={currentDate.getFullYear()}
            month={currentDate.getMonth()}
            events={events}
            today={today}
          />
        )}

        {/* Footer */}
        {connected && (
          <div className="mt-3 border-t border-white/[0.06] pt-2">
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
