import { supabase } from '@/lib/supabase'

// Hardcoded start date — stats only count activity after this date
const STATS_START_DATE = '2026-03-10'

export async function GET(request: Request) {
  try {
  const { searchParams } = new URL(request.url)
  let startDate = searchParams.get('start') || getDefaultStart()
  const endDate = searchParams.get('end') || new Date().toISOString()

  // Clamp startDate to STATS_START_DATE (activity queries only count after this date)
  const statsStartISO = new Date(STATS_START_DATE + 'T00:00:00').toISOString()
  if (new Date(startDate) < new Date(statsStartISO)) {
    startDate = statsStartISO
  }

  // ─── 1. Pipeline stages (for labels & ordering) ───
  const { data: pipeStages } = await supabase
    .from('pipeline_stages')
    .select('slug, name, color, position, is_terminal, is_default')
    .order('position')

  const stages = pipeStages || []
  const terminalSlugs = stages.filter(s => s.is_terminal).map(s => s.slug)
  const defaultSlugs = stages.filter(s => s.is_default).map(s => s.slug)

  // ─── 2. Flow data: status_change activities in period ───
  const { data: statusChanges } = await supabase
    .from('activities')
    .select('prospect_id, metadata, created_at')
    .eq('type', 'status_change')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  const changes = statusChanges || []

  // Count distinct prospects that entered each stage during the period
  const flowByStage: Record<string, Set<string>> = {}
  for (const c of changes) {
    const to = c.metadata?.to as string
    if (to) {
      if (!flowByStage[to]) flowByStage[to] = new Set()
      flowByStage[to].add(c.prospect_id)
    }
  }

  const periodFlow: Record<string, number> = {}
  for (const [slug, prospects] of Object.entries(flowByStage)) {
    periodFlow[slug] = prospects.size
  }

  // KPI calculations
  const contacted = periodFlow['contacte'] || 0
  const responded = periodFlow['repondu'] || 0
  const closed = periodFlow['client'] || 0
  const responseRate = contacted > 0 ? Math.round(responded / contacted * 100) : 0
  const conversionRate = contacted > 0 ? Math.round(closed / contacted * 100) : 0

  // ─── 3. Current stock (snapshot) ───
  const { data: prospects } = await supabase
    .from('prospects')
    .select('pipeline_stage')

  const currentStock: Record<string, number> = {}
  for (const p of prospects || []) {
    currentStock[p.pipeline_stage] = (currentStock[p.pipeline_stage] || 0) + 1
  }

  // ─── 4. Activity counts in period ───

  // Emails sent: from emails table
  const { count: emailsSentCount } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true })
    .gte('gmail_date', startDate)
    .lte('gmail_date', endDate)
    .or('direction.eq.sent,from_email.ilike.%boostinc.com%')

  const emailsSent = emailsSentCount || 0

  // Emails received: from emails table
  const { count: emailsReceivedCount } = await supabase
    .from('emails')
    .select('*', { count: 'exact', head: true })
    .gte('gmail_date', startDate)
    .lte('gmail_date', endDate)
    .or('direction.eq.received,to_email.ilike.%boostinc.com%')

  const emailsReceived = emailsReceivedCount || 0

  // Meetings: from activities or calendar
  const { count: meetingsCount } = await supabase
    .from('activities')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'meeting')
    .gte('created_at', startDate)
    .lte('created_at', endDate)

  const meetingsHeld = meetingsCount || 0

  // Response rate from emails: received / sent
  const emailResponseRate = emailsSent > 0 ? Math.round(emailsReceived / emailsSent * 100) : 0

  // ─── 5. Deals moved this week ───
  const weekStart = getWeekStart()
  const { data: weekChanges } = await supabase
    .from('activities')
    .select('prospect_id')
    .eq('type', 'status_change')
    .gte('created_at', weekStart)

  const dealsMovedThisWeek = new Set((weekChanges || []).map(c => c.prospect_id)).size

  // ─── 6. Avg conversion days (contacte → client) ───
  // Find prospects that became client, and look for their contacte date
  const avgConversionDays = await computeAvgConversionDays()

  // ─── 7. Machines signed in period ───
  let machinesSigned = 0
  try {
    const { data: machines } = await supabase
      .from('client_machines')
      .select('quantity')
      .gte('installed_at', startDate)
      .lte('installed_at', endDate)

    machinesSigned = (machines || []).reduce((s, m) => s + m.quantity, 0)
  } catch {
    // Table may not exist
  }

  return Response.json({
    // KPIs
    contacted,
    responded,
    responseRate,
    closed,
    conversionRate,
    machinesSigned,
    // Stock & Flow
    currentStock,
    periodFlow,
    // Activity
    emailsSent,
    emailsReceived,
    meetingsHeld,
    emailResponseRate,
    // Insights
    avgConversionDays,
    dealsMovedThisWeek,
    // Metadata
    stages: stages.map(s => ({
      slug: s.slug,
      name: s.name,
      color: s.color,
      position: s.position,
      is_terminal: s.is_terminal,
      is_default: s.is_default,
    })),
  })
  } catch (error) {
    console.error('Stats API error:', error)
    return Response.json(
      { error: (error as Error).message || 'Internal error' },
      { status: 500 }
    )
  }
}

// ─── Helpers ───

function getDefaultStart(): string {
  const d = new Date()
  d.setDate(1) // First of current month
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

async function computeAvgConversionDays(): Promise<number | null> {
  try {
    // Get all status_change activities, filter in JS for reliability
    const { data: allChanges } = await supabase
      .from('activities')
      .select('prospect_id, metadata, created_at')
      .eq('type', 'status_change')
      .order('created_at', { ascending: true })
      .limit(2000)

    if (!allChanges || allChanges.length === 0) return null

    // Build maps: earliest contacte date and latest client date per prospect
    const contacteDate: Record<string, Date> = {}
    const clientDate: Record<string, Date> = {}

    for (const c of allChanges) {
      const to = (c.metadata as Record<string, unknown>)?.to as string
      if (to === 'contacte' && !contacteDate[c.prospect_id]) {
        contacteDate[c.prospect_id] = new Date(c.created_at)
      }
      if (to === 'client') {
        clientDate[c.prospect_id] = new Date(c.created_at)
      }
    }

    // Calculate days for each prospect that went contacte → client
    const days: number[] = []
    for (const [prospectId, cDate] of Object.entries(clientDate)) {
      const start = contacteDate[prospectId]
      if (start) {
        const diff = Math.floor((cDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        if (diff >= 0) days.push(diff)
      }
    }

    if (days.length === 0) return null
    return Math.round(days.reduce((s, d) => s + d, 0) / days.length)
  } catch {
    return null
  }
}
