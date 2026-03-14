import { NextRequest } from 'next/server'
import { getGmailAccessToken } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

const CALENDAR_API = 'https://www.googleapis.com/calendar/v3'

export async function GET(request: NextRequest) {
  try {
    const monthParam =
      request.nextUrl.searchParams.get('month') ||
      new Date().toISOString().slice(0, 7)

    const startOfMonth = new Date(monthParam + '-01T00:00:00')
    const endOfMonth = new Date(startOfMonth)
    endOfMonth.setMonth(endOfMonth.getMonth() + 1)

    // Extend to cover partial weeks at start/end of month display
    const startDisplay = new Date(startOfMonth)
    const dayOfWeek = startDisplay.getDay()
    // Shift to Monday (ISO week start)
    const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    startDisplay.setDate(startDisplay.getDate() + offset)

    const endDisplay = new Date(endOfMonth)
    const endDay = endDisplay.getDay()
    if (endDay !== 1) {
      // Extend to next Sunday
      endDisplay.setDate(endDisplay.getDate() + (endDay === 0 ? 0 : 7 - endDay))
    }

    const token = await getGmailAccessToken()
    if (!token) {
      return Response.json({ connected: false, events: [] })
    }

    const params = new URLSearchParams({
      timeMin: startDisplay.toISOString(),
      timeMax: endDisplay.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '200',
    })

    const res = await fetch(
      `${CALENDAR_API}/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    )

    if (!res.ok) {
      return Response.json({ connected: true, events: [] })
    }

    const data = await res.json()

    const events = (data.items || []).map(
      (e: {
        id: string
        summary?: string
        start: { dateTime?: string; date?: string }
        end: { dateTime?: string; date?: string }
        attendees?: { email: string }[]
        location?: string
        colorId?: string
      }) => ({
        id: e.id,
        title: e.summary || '(sans titre)',
        start: e.start.dateTime || e.start.date,
        end: e.end.dateTime || e.end.date,
        allDay: !e.start.dateTime,
        attendees: e.attendees?.map((a) => a.email) || [],
        location: e.location || null,
        color: e.colorId || null,
      }),
    )

    return Response.json({ connected: true, events })
  } catch {
    return Response.json({ connected: false, events: [] })
  }
}
