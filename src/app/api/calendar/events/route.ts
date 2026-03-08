import { supabase } from '@/lib/supabase'
import { getCalendarEvents, matchEventsToCRM, createCalendarEvent } from '@/lib/calendar'

/**
 * GET /api/calendar/events
 * Returns calendar events from the last 14 days + next 14 days,
 * matched against CRM prospects by email.
 */
export async function GET() {
  try {
    const events = await getCalendarEvents(14, 14)

    if (events.length === 0) {
      return Response.json({ events: [], total: 0, withProspect: 0 })
    }

    // Build email→prospect map from CRM
    const { data: prospects } = await supabase
      .from('prospects')
      .select('prenom, nom, entreprise, email')
      .not('email', 'is', null)

    const emailMap = new Map<string, { name: string; entreprise: string }>()
    for (const p of prospects || []) {
      if (p.email) {
        emailMap.set(p.email.toLowerCase(), {
          name: `${p.prenom} ${p.nom}`,
          entreprise: p.entreprise || '',
        })
      }
    }

    const matched = matchEventsToCRM(events, emailMap)
    const withProspect = matched.filter(e => e.prospect).length

    return Response.json({
      events: matched,
      total: matched.length,
      withProspect,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Calendar error' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/calendar/events
 * Create a new Google Calendar event.
 * Body: { summary, description?, startDate, endDate?, attendees?: string[] }
 */
export async function POST(request: Request) {
  try {
    const { summary, description, startDate, endDate, durationMinutes } = await request.json()

    if (!summary || !startDate) {
      return Response.json(
        { error: 'summary et startDate requis' },
        { status: 400 },
      )
    }

    const result = await createCalendarEvent({
      summary,
      description,
      startDate,
      endDate,
      durationMinutes,
    })

    if (!result) {
      return Response.json(
        { error: 'Google Calendar non connecte ou erreur API. Reconnectez Google dans Parametres.' },
        { status: 401 },
      )
    }

    return Response.json({
      success: true,
      event_id: result.id,
      htmlLink: result.htmlLink,
    })
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Calendar create error' },
      { status: 500 },
    )
  }
}
