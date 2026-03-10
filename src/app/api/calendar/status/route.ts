import { getGmailAccessToken } from '@/lib/gmail'

/**
 * GET /api/calendar/status
 * Checks if Google Calendar is accessible (uses same OAuth as Gmail).
 */
export async function GET() {
  try {
    const accessToken = await getGmailAccessToken()

    if (!accessToken) {
      return Response.json({ connected: false })
    }

    // Try to list calendars to verify calendar scope is authorized
    const res = await fetch(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )

    return Response.json({ connected: res.ok })
  } catch {
    return Response.json({ connected: false })
  }
}
