import { NextRequest } from 'next/server'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { getProspect, getActivities, getBusinessContext, getKnowledgeDocuments, getProspectsSummary } from '@/lib/actions'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
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

    // Load business context + prospect context + knowledge docs in parallel
    let prospect: Prospect | null = null
    let activities: Awaited<ReturnType<typeof getActivities>> = []
    let businessContext: Awaited<ReturnType<typeof getBusinessContext>> = null
    let knowledgeDocs: Awaited<ReturnType<typeof getKnowledgeDocuments>> = []
    let allProspects: Awaited<ReturnType<typeof getProspectsSummary>> = []

    try {
      const results = await Promise.all([
        getBusinessContext(),
        getKnowledgeDocuments(),
        prospectId ? getProspect(prospectId) : Promise.resolve(null),
        prospectId ? getActivities(prospectId) : Promise.resolve([]),
        !prospectId ? getProspectsSummary() : Promise.resolve([]),
      ])

      businessContext = results[0]
      knowledgeDocs = results[1]
      prospect = results[2]
      activities = results[3]
      allProspects = results[4]
    } catch {
      // Continue without context
    }

    const systemPrompt = buildSystemPrompt(prospect, activities, businessContext, knowledgeDocs, allProspects)

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

    const model = resolveModel('chat', requestedModel)
    const anthropic = getAnthropicClient()

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = anthropic.messages.stream({
            model: model.apiModelId,
            max_tokens: model.maxOutputTokens,
            system: enhancedSystem,
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
