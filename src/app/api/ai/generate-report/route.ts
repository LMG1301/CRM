import { supabase } from '@/lib/supabase'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { toLocalDateString } from '@/lib/utils'

/**
 * AI Report Generation — generates a structured weekly check-in or bimonthly report.
 *
 * POST /api/ai/generate-report
 * Body: { type: 'weekly' | 'bimonthly' }
 */
export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { type } = await request.json()

    if (!type || !['weekly', 'bimonthly'].includes(type)) {
      return Response.json({ error: 'type requis: weekly ou bimonthly' }, { status: 400 })
    }

    const today = new Date()
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekAgoStr = weekAgo.toISOString()

    // ─── Load all data ───

    const [
      { data: prospects },
      { data: activities },
      { data: recentEmails },
    ] = await Promise.all([
      supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise, fonction, pipeline_stage, categorie, date_dernier_contact, date_prochaine_action, type_prochaine_action')
        .not('pipeline_stage', 'in', '("refuse")')
        .order('date_dernier_contact', { ascending: false }),
      supabase
        .from('activities')
        .select('type, content, created_at, prospect:prospects(prenom, nom, entreprise, pipeline_stage)')
        .gte('created_at', weekAgoStr)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('emails')
        .select('subject, body_preview, direction, gmail_date, prospect:prospects(prenom, nom, entreprise)')
        .gte('gmail_date', weekAgoStr)
        .order('gmail_date', { ascending: false })
        .limit(50),
    ])

    // ─── Pre-process: deduplicate and synthesize ───

    // Group activities by prospect, keep last action per type
    const activityByProspect = new Map<string, Map<string, { type: string; content: string; date: string }>>()
    for (const a of activities || []) {
      const raw = a.prospect as unknown
      const p = (Array.isArray(raw) ? raw[0] : raw) as { prenom: string; nom: string; entreprise: string; pipeline_stage: string } | null
      if (!p) continue
      const key = `${p.prenom} ${p.nom}`
      if (!activityByProspect.has(key)) activityByProspect.set(key, new Map())
      const byType = activityByProspect.get(key)!
      // Keep only the most recent per type
      if (!byType.has(a.type)) {
        byType.set(a.type, {
          type: a.type,
          content: (a.content || '').slice(0, 150),
          date: a.created_at,
        })
      }
    }

    // Build deduplicated activity summary
    const activitySummary: string[] = []
    for (const [name, byType] of activityByProspect) {
      for (const [, act] of byType) {
        activitySummary.push(`- ${name} | ${act.type} | ${act.content}`)
      }
    }

    // Email summary: 1 line per thread (subject + direction), no body
    const emailSummary = (recentEmails || [])
      .slice(0, 15)
      .map(e => {
        const rawP = e.prospect as unknown
        const p = (Array.isArray(rawP) ? rawP[0] : rawP) as { prenom: string; nom: string; entreprise: string } | null
        const who = p ? `${p.prenom} ${p.nom} (${p.entreprise || '—'})` : e.direction === 'sent' ? 'prospect' : 'contact'
        const dir = e.direction === 'sent' ? 'Envoye a' : 'Recu de'
        return `- ${dir} ${who}: "${e.subject || '(sans objet)'}"`
      })

    // Overdue follow-ups (3+ days late)
    const threeDaysAgo = new Date()
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
    const threeDaysAgoStr = toLocalDateString(threeDaysAgo)

    const overdueFollowups = (prospects || [])
      .filter(p => p.date_prochaine_action && p.date_prochaine_action < threeDaysAgoStr)
      .map(p => {
        const daysLate = Math.floor((today.getTime() - new Date(p.date_prochaine_action!).getTime()) / (1000 * 60 * 60 * 24))
        return `- ${p.prenom} ${p.nom} (${p.entreprise || '—'}) — ${p.type_prochaine_action || 'Action'} en retard de ${daysLate} jours`
      })

    // Cooling deals: no activity in 10+ days on active stages
    const tenDaysAgo = new Date()
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
    const tenDaysAgoStr = toLocalDateString(tenDaysAgo)
    const activeStages = ['touch_1', 'repondu', 'devis', 'onboarding', 'a_recontacter']

    const coolingDeals = (prospects || [])
      .filter(p =>
        activeStages.includes(p.pipeline_stage) &&
        (!p.date_dernier_contact || p.date_dernier_contact < tenDaysAgoStr)
      )
      .slice(0, 5)
      .map(p => `- ${p.prenom} ${p.nom} (${p.entreprise || '—'}) — stage ${p.pipeline_stage}, dernier contact: ${p.date_dernier_contact || 'jamais'}`)

    // Try to load calendar events if available
    let calendarContext = ''
    try {
      const calUrl = new URL('/api/calendar/events', request.url)
      const calRes = await fetch(calUrl.toString(), {
        headers: { cookie: request.headers.get('cookie') || '' },
      })
      if (calRes.ok) {
        const calData = await calRes.json()
        const events = calData.events || []
        if (events.length > 0) {
          const pastEvents = events.filter((e: { start: { dateTime?: string; date?: string } }) => {
            const d = new Date(e.start.dateTime || e.start.date || '')
            return d < today
          })
          const futureEvents = events.filter((e: { start: { dateTime?: string; date?: string } }) => {
            const d = new Date(e.start.dateTime || e.start.date || '')
            return d >= today
          })

          if (pastEvents.length > 0) {
            calendarContext += '\n## Meetings de la semaine derniere\n'
            calendarContext += pastEvents.slice(0, 10).map((e: { summary: string; start: { dateTime?: string; date?: string }; attendees?: { email: string; displayName?: string }[]; prospect?: { name: string; entreprise: string } }) => {
              const date = new Date(e.start.dateTime || e.start.date || '').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
              const who = e.prospect ? `avec ${e.prospect.name} (${e.prospect.entreprise})` : `(${(e.attendees || []).length} participants)`
              return `- ${date}: ${e.summary} ${who}`
            }).join('\n')
          }

          if (futureEvents.length > 0) {
            calendarContext += '\n## Meetings a venir\n'
            calendarContext += futureEvents.slice(0, 10).map((e: { summary: string; start: { dateTime?: string; date?: string }; attendees?: { email: string; displayName?: string }[]; prospect?: { name: string; entreprise: string } }) => {
              const date = new Date(e.start.dateTime || e.start.date || '').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
              const who = e.prospect ? `avec ${e.prospect.name} (${e.prospect.entreprise})` : `(${(e.attendees || []).length} participants)`
              return `- ${date}: ${e.summary} ${who}`
            }).join('\n')
          }
        }
      }
    } catch {
      // Calendar not available, continue without
    }

    // ─── Build context for AI ───

    const dataContext = [
      `Date du rapport: ${today.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      '',
      `## Activites de la semaine (dedupliquees)`,
      activitySummary.length > 0 ? activitySummary.join('\n') : '(aucune activite cette semaine)',
      '',
      `## Emails de la semaine`,
      emailSummary.length > 0 ? emailSummary.join('\n') : '(aucun email cette semaine)',
      '',
      `## Follow-ups en retard (3+ jours)`,
      overdueFollowups.length > 0 ? overdueFollowups.join('\n') : '(aucun)',
      '',
      `## Deals qui refroidissent (10+ jours sans activite)`,
      coolingDeals.length > 0 ? coolingDeals.join('\n') : '(aucun)',
      calendarContext,
    ].join('\n')

    // ─── AI call ───

    const model = resolveModel('generate-report')
    const anthropic = getAnthropicClient()

    const systemPrompt = type === 'weekly'
      ? `Tu es l'assistant commercial de Louis chez Boost Inc. (distribution automatique et retail connecte en France). Genere un rapport hebdomadaire STRICTEMENT au format suivant.

## Format OBLIGATOIRE (3 sections uniquement, rien d'autre)

### 1. Recap de la Semaine Derniere
- 5 a 8 bullet points MAXIMUM
- Chaque bullet DOIT commencer par un verbe d'action au passe (Contacte, Envoye, Relance, Signe, Planifie, Deplace, Qualifie...)
- Format: "Verbe + nom du prospect (entreprise) — outcome en 1 ligne"
- Synthetise: si un prospect a eu plusieurs actions, fusionne-les en 1 bullet
- Ne JAMAIS copier de contenu d'email ni de thread

### 2. Priorites de la Semaine
- 5 a 8 items MAXIMUM
- Maximum 3 items marques comme priorite cle avec un asterisque * au debut
- Hierarchie: meetings confirmes > follow-ups en retard > leads chauds > livrables
- Chaque item = 1 action concrete avec le nom du prospect/client

### 3. Points d'Attention
- Follow-ups en retard de 3+ jours (avec le nombre de jours)
- Deals qui refroidissent (10+ jours sans activite en stage actif)
- Si rien, ecrire "RAS" (1 ligne)

## REGLES ABSOLUES
- Langue: Francais
- ZERO section supplementaire
- ZERO metrique brute (pas de "total prospects: 272")
- ZERO thread email copie
- ZERO doublon
- Max 20 lignes au total
- Lisible en 60 secondes`
      : `Tu es l'assistant commercial de Louis chez Boost Inc. Genere un rapport commercial bi-mensuel structure avec:
1. Vue d'ensemble pipeline (conversion, tendances)
2. Top deals en cours avec next steps
3. Analyse par categorie/secteur
4. Recommandations strategiques (3 max)

Langue: Francais. Concis et actionnable.`

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 800,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Voici les donnees CRM de cette semaine. Genere le rapport.\n\n${dataContext}`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'generate-report',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const report = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return Response.json({ report })
  } catch (error) {
    const parsed = parseAnthropicError(error)
    return Response.json({ error: parsed }, { status: 500 })
  }
}
