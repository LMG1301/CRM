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
            ],
            messages: messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          })

          stream.on('text', (text) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
            )
          })

          const finalMessage = await stream.finalMessage()

          logApiUsage({
            endpoint: 'chat',
            model: model.apiModelId,
            input_tokens: finalMessage.usage.input_tokens,
            output_tokens: finalMessage.usage.output_tokens,
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
