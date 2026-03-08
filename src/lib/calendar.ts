import { getGmailAccessToken } from './gmail'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export interface CalendarEvent {
  id: string
  summary: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  attendees?: { email: string; displayName?: string; responseStatus?: string }[]
  status: string
  htmlLink: string
}

/**
 * Fetch calendar events from Google Calendar API.
 * Reuses the same Google OAuth token as Gmail.
 */
export async function getCalendarEvents(
  daysBack = 14,
  daysForward = 14,
): Promise<CalendarEvent[]> {
  const token = await getGmailAccessToken()
  if (!token) return []

  const now = new Date()
  const timeMin = new Date(now)
  timeMin.setDate(timeMin.getDate() - daysBack)
  const timeMax = new Date(now)
  timeMax.setDate(timeMax.getDate() + daysForward)

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
  })

  const res = await fetch(
    `${CALENDAR_API}/calendars/primary/events?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  )

  if (!res.ok) return []

  const data = await res.json()
  return (data.items || []) as CalendarEvent[]
}

/**
 * Create a new event on Google Calendar.
 */
export async function createCalendarEvent(params: {
  summary: string
  description?: string
  startDate: string // YYYY-MM-DD for all-day or ISO datetime (YYYY-MM-DDTHH:mm:ss)
  endDate?: string
  durationMinutes?: number // Default 30 min for timed events
  attendees?: string[]
}): Promise<{ id: string; htmlLink: string } | null> {
  const token = await getGmailAccessToken()
  if (!token) return null

  const isAllDay = /^\d{4}-\d{2}-\d{2}$/.test(params.startDate)
  const durationMs = (params.durationMinutes || 30) * 60 * 1000

  // Build event body
  const event: Record<string, unknown> = {
    summary: params.summary,
    description: params.description || undefined,
  }

  if (isAllDay) {
    // All-day event — end date is exclusive in Google Calendar
    const endDate = params.endDate || (() => {
      const d = new Date(params.startDate + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    event.start = { date: params.startDate }
    event.end = { date: endDate }
  } else {
    event.start = { dateTime: params.startDate, timeZone: 'Europe/Paris' }
    event.end = {
      dateTime: params.endDate || new Date(new Date(params.startDate).getTime() + durationMs).toISOString(),
      timeZone: 'Europe/Paris',
    }
  }

  // No attendees — calendar events are personal reminders only
  // (prospect will be contacted separately)

  const res = await fetch(`${CALENDAR_API}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    console.error('Calendar create error:', err)
    return null
  }

  const data = await res.json()
  return { id: data.id, htmlLink: data.htmlLink }
}

/**
 * Match calendar event attendees to CRM prospects by email.
 */
export function matchEventsToCRM(
  events: CalendarEvent[],
  prospectEmails: Map<string, { name: string; entreprise: string }>,
): (CalendarEvent & { prospect?: { name: string; entreprise: string } })[] {
  return events.map(event => {
    let prospect: { name: string; entreprise: string } | undefined
    for (const attendee of event.attendees || []) {
      const match = prospectEmails.get(attendee.email?.toLowerCase())
      if (match) {
        prospect = match
        break
      }
    }
    return { ...event, prospect }
  })
}
