import { supabase } from '@/lib/supabase'
import { getCalendarEvents, matchEventsToCRM } from '@/lib/calendar'

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
