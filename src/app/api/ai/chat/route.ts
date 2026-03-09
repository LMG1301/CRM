import { NextRequest } from 'next/server'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { getProspect, getActivities, getBusinessContext, getKnowledgeDocuments, getProspectsSummary, getProspectEmails, getDealGroupMembers } from '@/lib/actions'
import type { Email } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { getCalendarEvents, type CalendarEvent } from '@/lib/calendar'
import type { Prospect } from '@/lib/types'

// ─── CRM Query Tool executor ───

async function executeCrmQuery(input: { data_type: string; filters?: string }): Promise<unknown> {
  const { data_type, filters } = input

  switch (data_type) {
    case 'prospects': {
      let query = supabase
        .from('prospects')
        .select('prenom, nom, entreprise, pipeline_stage, email, date_dernier_contact, date_prochaine_action, type_prochaine_action')
        .order('date_dernier_contact', { ascending: false, nullsFirst: false })
        .limit(50)

      if (filters) {
        const stages = ['ciblage', 'contacte', 'touch_1', 'repondu', 'a_recontacter', 'call_planifie', 'devis', 'onboarding', 'client', 'refuse']
        if (stages.includes(filters.toLowerCase())) {
          query = query.eq('pipeline_stage', filters.toLowerCase())
        } else {
          query = query.ilike('entreprise', `%${filters}%`)
        }
      }

      const { data, error } = await query
      if (error) return { error: error.message }
      return { prospects: data, count: data?.length || 0 }
    }

    case 'clients': {
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise, pipeline_stage, email, date_dernier_contact')
        .in('pipeline_stage', ['client', 'onboarding'])
        .order('date_dernier_contact', { ascending: false })

      if (!prospects || prospects.length === 0) return { clients: [], count: 0 }

      const prospectIds = prospects.map(p => p.id)
      const { data: machines } = await supabase
        .from('client_machines')
        .select('prospect_id, machine_type, quantity, installed_at')
        .in('prospect_id', prospectIds)

      const result = prospects.map(p => ({
        ...p,
        machines: (machines || []).filter(m => m.prospect_id === p.id),
      }))

      return { clients: result, count: result.length }
    }

    case 'entreprises': {
      const { data } = await supabase
        .from('prospects')
        .select('entreprise, pipeline_stage')

      if (!data) return { entreprises: [], count: 0 }

      const grouped: Record<string, { count: number; stages: Set<string> }> = {}
      for (const p of data) {
        const ent = p.entreprise || 'Sans entreprise'
        if (!grouped[ent]) grouped[ent] = { count: 0, stages: new Set() }
        grouped[ent].count++
        grouped[ent].stages.add(p.pipeline_stage)
      }

      const result = Object.entries(grouped)
        .filter(([, v]) => v.count > 1)
        .map(([name, v]) => ({ entreprise: name, contacts: v.count, stages: [...v.stages] }))
        .sort((a, b) => b.contacts - a.contacts)
        .slice(0, 50)

      return { entreprises: result, count: result.length }
    }

    case 'activites_recentes': {
      const days = filters ? parseInt(filters) || 7 : 7
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from('activities')
        .select('type, content, created_at, prospect_id')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(30)

      if (!data || data.length === 0) return { activites: [], count: 0 }

      const prospectIds = [...new Set(data.map(a => a.prospect_id))]
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .in('id', prospectIds)

      const pMap = new Map((prospects || []).map(p => [p.id, p]))

      const result = data.map(a => {
        const p = pMap.get(a.prospect_id)
        return {
          type: a.type,
          content: a.content?.substring(0, 200),
          date: new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          prospect: p ? `${p.prenom} ${p.nom}` : 'Inconnu',
          entreprise: p?.entreprise || '',
        }
      })

      return { activites: result, count: result.length, periode: `${days} derniers jours` }
    }

    case 'emails_recents': {
      const days = filters ? parseInt(filters) || 7 : 7
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from('emails')
        .select('subject, from_email, to_email, gmail_date, direction, prospect_id')
        .gte('gmail_date', since.toISOString())
        .order('gmail_date', { ascending: false })
        .limit(20)

      if (!data || data.length === 0) return { emails: [], count: 0 }

      const prospectIds = [...new Set(data.map(e => e.prospect_id).filter(Boolean))]
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom')
        .in('id', prospectIds)

      const pMap = new Map((prospects || []).map(p => [p.id, p]))

      const result = data.map(e => {
        const p = e.prospect_id ? pMap.get(e.prospect_id) : null
        return {
          subject: e.subject,
          from: e.from_email,
          to: e.to_email,
          date: new Date(e.gmail_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          direction: e.direction === 'sent' ? 'Envoye' : 'Recu',
          prospect: p ? `${p.prenom} ${p.nom}` : null,
        }
      })

      return { emails: result, count: result.length }
    }

    case 'machines': {
      const { data } = await supabase
        .from('client_machines')
        .select('machine_type, quantity, installed_at, notes, prospect_id')
        .order('installed_at', { ascending: false, nullsFirst: false })

      if (!data || data.length === 0) return { machines: [], count: 0, total: 0 }

      const prospectIds = [...new Set(data.map(m => m.prospect_id))]
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .in('id', prospectIds)

      const pMap = new Map((prospects || []).map(p => [p.id, p]))

      const result = data.map(m => {
        const p = pMap.get(m.prospect_id)
        return {
          machine_type: m.machine_type,
          quantity: m.quantity,
          notes: m.notes,
          installed_at: m.installed_at ? new Date(m.installed_at + 'T00:00:00').toLocaleDateString('fr-FR') : null,
          prospect: p ? `${p.prenom} ${p.nom}` : 'Inconnu',
          entreprise: p?.entreprise || '',
        }
      })

      return { machines: result, count: result.length, total: data.reduce((s, m) => s + m.quantity, 0) }
    }

    case 'pipeline_summary': {
      const { data } = await supabase
        .from('prospects')
        .select('pipeline_stage')

      if (!data) return { pipeline: {}, total: 0 }

      const counts: Record<string, number> = {}
      for (const p of data) {
        counts[p.pipeline_stage] = (counts[p.pipeline_stage] || 0) + 1
      }

      return { pipeline: counts, total: data.length }
    }

    case 'deals_bloques': {
      const threshold = new Date()
      threshold.setDate(threshold.getDate() - 21)

      const { data } = await supabase
        .from('prospects')
        .select('prenom, nom, entreprise, pipeline_stage, date_dernier_contact, date_prochaine_action')
        .lt('date_dernier_contact', threshold.toISOString().split('T')[0])
        .not('pipeline_stage', 'in', '("client","refuse","ciblage")')
        .order('date_dernier_contact', { ascending: true })
        .limit(30)

      if (!data) return { bloques: [], count: 0 }

      const result = data.map(p => {
        const lastContact = p.date_dernier_contact ? new Date(p.date_dernier_contact) : null
        const daysSince = lastContact ? Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)) : null
        return {
          nom: `${p.prenom} ${p.nom}`,
          entreprise: p.entreprise,
          stage: p.pipeline_stage,
          dernier_contact: p.date_dernier_contact,
          jours_sans_contact: daysSince,
          prochaine_action: p.date_prochaine_action,
        }
      })

      return { bloques: result, count: result.length }
    }

    default:
      return { error: `Type de donnees inconnu: ${data_type}` }
  }
}

// ─── CRM Tool definition ───

const CRM_TOOL = {
  name: "query_crm",
  description: "Interroge les donnees du CRM Boost. Peut lister les prospects par etape, les clients, les entreprises, les activites recentes, les emails, les machines installees. Utilise cet outil pour repondre aux questions sur le pipeline, les clients, les stats, ou pour analyser les donnees commerciales.",
  input_schema: {
    type: "object" as const,
    properties: {
      data_type: {
        type: "string",
        enum: ["prospects", "clients", "entreprises", "activites_recentes", "emails_recents", "machines", "pipeline_summary", "deals_bloques"],
        description: "Le type de donnees a recuperer",
      },
      filters: {
        type: "string",
        description: "Filtre optionnel : nom d'entreprise, etape pipeline, ou nombre de jours pour les activites recentes. Ex: 'Dallmayr', 'devis', '7'",
      },
    },
    required: ["data_type"],
  },
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'Cle API Anthropic non configuree. Ajoutez ANTHROPIC_API_KEY dans .env.local' },
        { status: 500 },
      )
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const body = await request.json()
    const { messages, prospectId, model: requestedModel } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      prospectId?: string
      model?: string
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Messages requis' }, { status: 400 })
    }

    // Load business context + prospect context + knowledge docs + emails in parallel
    let prospect: Prospect | null = null
    let activities: Awaited<ReturnType<typeof getActivities>> = []
    let businessContext: Awaited<ReturnType<typeof getBusinessContext>> = null
    let knowledgeDocs: Awaited<ReturnType<typeof getKnowledgeDocuments>> = []
    let allProspects: Awaited<ReturnType<typeof getProspectsSummary>> = []
    let prospectEmails: Email[] = []

    try {
      const results = await Promise.all([
        getBusinessContext(),
        getKnowledgeDocuments(),
        prospectId ? getProspect(prospectId) : Promise.resolve(null),
        prospectId ? getActivities(prospectId) : Promise.resolve([]),
        !prospectId ? getProspectsSummary() : Promise.resolve([]),
        prospectId ? getProspectEmails(prospectId) : Promise.resolve([]),
      ])

      businessContext = results[0]
      knowledgeDocs = results[1]
      prospect = results[2]
      activities = results[3]
      allProspects = results[4]
      prospectEmails = results[5] as Email[]
    } catch {
      // Continue without context
    }

    // Fetch deal group members if prospect has a deal_group
    let dealGroupMembers: Prospect[] = []
    if (prospect?.deal_group) {
      try {
        dealGroupMembers = await getDealGroupMembers(prospect.deal_group, prospect.id)
      } catch {
        // Continue without deal group context
      }
    }

    const systemPrompt = buildSystemPrompt(prospect, activities, businessContext, knowledgeDocs, allProspects, prospectEmails, dealGroupMembers.length > 0 ? dealGroupMembers : undefined)

    // Enhance system prompt with knowledge context when relevant
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || ''
    const wantsEnrichment = lastMessage.includes('recherche') ||
      lastMessage.includes('info') ||
      lastMessage.includes('touch 1') ||
      lastMessage.includes('premier message') ||
      lastMessage.includes('personnalis') ||
      lastMessage.includes('mail') ||
      lastMessage.includes('email') ||
      lastMessage.includes('entreprise') ||
      lastMessage.includes('societe') ||
      lastMessage.includes('société') ||
      (prospect?.entreprise && (
        lastMessage.includes('redige') ||
        lastMessage.includes('ecris') ||
        lastMessage.includes('rédige') ||
        lastMessage.includes('écris') ||
        lastMessage.includes('propose') ||
        lastMessage.includes('relance')
      ))

    let enhancedSystem = systemPrompt
    enhancedSystem += `\n\nTu as un outil query_crm() pour interroger les donnees du CRM en temps reel. Utilise-le pour repondre aux questions sur les prospects, clients, pipeline, machines, activites recentes. Ne demande JAMAIS a l'utilisateur de copier-coller des donnees — interroge le CRM directement.`

    if (wantsEnrichment && prospect?.entreprise) {
      enhancedSystem += `\n\n## Recherche d'informations
Utilise tes connaissances sur ${prospect.entreprise} pour personnaliser ton message :
- Ce que tu sais sur cette entreprise (secteur, taille, localisation)
- Des elements qui pourraient rendre le message pertinent
- Si tu ne connais pas l'entreprise, propose un message generique mais professionnel`
    }

    // Detect content suggestion intent
    const wantsContent = lastMessage.includes('contenu') ||
      lastMessage.includes('content') ||
      lastMessage.includes('article') ||
      lastMessage.includes('ressource') ||
      lastMessage.includes('suggere') ||
      lastMessage.includes('recommande') ||
      lastMessage.includes('nurturing') ||
      lastMessage.includes('partager')

    // Detect calendar/availability intent
    const wantsCalendar = lastMessage.includes('calendrier') ||
      lastMessage.includes('calendar') ||
      lastMessage.includes('creneau') ||
      lastMessage.includes('créneau') ||
      lastMessage.includes('dispo') ||
      lastMessage.includes('meeting') ||
      lastMessage.includes('reunion') ||
      lastMessage.includes('réunion') ||
      lastMessage.includes('rdv') ||
      lastMessage.includes('rendez') ||
      lastMessage.includes('planifier') ||
      lastMessage.includes('quand') ||
      lastMessage.includes('semaine prochaine') ||
      lastMessage.includes('prochain call')

    if (wantsCalendar) {
      try {
        const calEvents = await getCalendarEvents(7, 14)
        if (calEvents.length > 0) {
          const now = new Date()
          const upcoming = calEvents.filter((e: CalendarEvent) => {
            const d = new Date(e.start.dateTime || e.start.date || '')
            return d >= now
          })

          if (upcoming.length > 0) {
            const eventLines = upcoming.slice(0, 20).map((e: CalendarEvent) => {
              const start = new Date(e.start.dateTime || e.start.date || '')
              const dateStr = start.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
              const timeStr = e.start.dateTime
                ? start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                : 'journee entiere'
              const endTime = e.end?.dateTime
                ? new Date(e.end.dateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                : ''
              const attendeeList = (e.attendees || [])
                .filter(a => !a.email?.includes('calendar.google.com'))
                .map(a => a.displayName || a.email)
                .join(', ')
              return `- ${dateStr} ${timeStr}${endTime ? `-${endTime}` : ''} : "${e.summary}"${attendeeList ? ` (avec ${attendeeList})` : ''}`
            })

            enhancedSystem += `\n\n## Calendrier Google — Evenements a venir

Voici les evenements du calendrier des 2 prochaines semaines. Utilise ces informations pour :
- Proposer des creneaux libres au prospect (en evitant les conflits)
- Mentionner les meetings deja planifies avec ce prospect
- Suggerer le meilleur moment pour un call ou une reunion

${eventLines.join('\n')}

IMPORTANT : Quand tu proposes des creneaux, verifie qu'ils ne chevauchent pas les evenements ci-dessus. Propose 2-3 options en heures ouvrables (9h-18h, lundi-vendredi).`
          }
        }
      } catch {
        // Calendar not available, continue without
      }
    }

    if (wantsContent) {
      try {
        const { data: contents } = await supabase
          .from('contents')
          .select('id, title, content_type, url, body, themes, products, pipeline_stages')
          .order('created_at', { ascending: false })
          .limit(30)

        if (contents && contents.length > 0) {
          const contentList = contents.map(c => {
            const tags = [
              ...(c.themes || []),
              ...(c.products || []),
            ].join(', ')
            return `- [CONTENT:${c.id}] "${c.title}" (${c.content_type}${tags ? `, tags: ${tags}` : ''}${c.url ? `, url: ${c.url}` : ''})${c.body ? `\n  Resume: ${c.body.slice(0, 150)}` : ''}`
          }).join('\n')

          enhancedSystem += `\n\n## Contenus disponibles pour nurturing

Voici les contenus de notre base. Quand tu suggeres un contenu, utilise EXACTEMENT le format [CONTENT:id] dans ta reponse pour que l'utilisateur puisse envoyer le contenu par email directement.

Exemple de format de reponse :
"Je te recommande cet article : **Titre du contenu** [CONTENT:abc123] — il est pertinent parce que..."

Contenus :
${contentList}`
        }
      } catch {
        // Continue without content context
      }
    }

    const model = resolveModel('chat', requestedModel)
    const anthropic = getAnthropicClient()

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let apiMessages: any[] = messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }))
          let totalInputTokens = 0
          let totalOutputTokens = 0

          // Agentic loop: stream text, handle tool_use for query_crm
          for (let round = 0; round < 4; round++) {
            const stream = anthropic.messages.stream({
              model: model.apiModelId,
              max_tokens: model.maxOutputTokens,
              system: [
                {
                  type: "text" as const,
                  text: enhancedSystem,
                  cache_control: { type: "ephemeral" as const },
                },
              ],
              tools: [
                {
                  type: "web_search_20250305" as const,
                  name: "web_search",
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                CRM_TOOL as any,
              ],
              messages: apiMessages,
            })

            stream.on('text', (text) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
              )
            })

            const finalMessage = await stream.finalMessage()
            totalInputTokens += finalMessage.usage.input_tokens
            totalOutputTokens += finalMessage.usage.output_tokens

            // If stop_reason is not tool_use, we're done
            if (finalMessage.stop_reason !== 'tool_use') break

            // Find query_crm tool calls (web_search is handled server-side by the API)
            const crmBlocks = finalMessage.content.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (b: any) => b.type === 'tool_use' && b.name === 'query_crm'
            )

            if (crmBlocks.length === 0) break

            // Execute CRM queries and build tool results
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolResults: any[] = []
            for (const block of crmBlocks) {
              if (block.type !== 'tool_use') continue
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result = await executeCrmQuery(block.input as any)
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: JSON.stringify(result),
              })
            }

            // Add assistant message + tool results to conversation
            apiMessages = [
              ...apiMessages,
              { role: 'assistant' as const, content: finalMessage.content },
              { role: 'user' as const, content: toolResults },
            ]
          }

          logApiUsage({
            endpoint: 'chat',
            model: model.apiModelId,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          })

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          const errorMessage = parseAnthropicError(error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMessage })}\n\n`,
            ),
          )
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    const message = parseAnthropicError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
