import { getCalendarEvents } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const events = await getCalendarEvents(0, 7)

    if (!events || events.length === 0) {
      // Check if calendar is connected by trying to get token
      const { getGmailAccessToken } = await import('@/lib/gmail')
      const token = await getGmailAccessToken()

      if (!token) {
        return Response.json({ connected: false, events: [] })
      }

      return Response.json({ connected: true, events: [] })
    }

    const mapped = events.map(e => ({
      id: e.id,
      title: e.summary,
      start: e.start.dateTime || e.start.date,
      end: e.end.dateTime || e.end.date,
      attendees: e.attendees?.map(a => a.email) || [],
    }))

    return Response.json({ connected: true, events: mapped })
  } catch {
    return Response.json({ connected: false, events: [] })
  }
}
