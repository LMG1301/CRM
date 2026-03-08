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
