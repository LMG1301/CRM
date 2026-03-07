import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { getProspect, getActivities, getBusinessContext, getKnowledgeDocuments } from '@/lib/actions'
import type { Prospect } from '@/lib/types'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

function parseAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401) return 'Cle API invalide. Verifiez votre ANTHROPIC_API_KEY.'
    if (error.status === 400 && String(error.message).includes('credit'))
      return 'Solde de credits insuffisant. Rechargez vos credits sur console.anthropic.com > Plans & Billing.'
    if (error.status === 429) return 'Trop de requetes. Reessayez dans quelques secondes.'
    if (error.status === 529) return 'API Anthropic surchargee. Reessayez dans un moment.'
    return `Erreur API (${error.status}) : ${error.message}`
  }
  if (error instanceof Error) return error.message
  return 'Erreur inconnue'
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'Cle API Anthropic non configuree. Ajoutez ANTHROPIC_API_KEY dans .env.local' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const { messages, prospectId } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      prospectId?: string
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Messages requis' }, { status: 400 })
    }

    // Load business context + prospect context + knowledge docs in parallel
    let prospect: Prospect | null = null
    let activities: Awaited<ReturnType<typeof getActivities>> = []
    let businessContext: Awaited<ReturnType<typeof getBusinessContext>> = null
    let knowledgeDocs: Awaited<ReturnType<typeof getKnowledgeDocuments>> = []

    try {
      const results = await Promise.all([
        getBusinessContext(),
        getKnowledgeDocuments(),
        prospectId ? getProspect(prospectId) : Promise.resolve(null),
        prospectId ? getActivities(prospectId) : Promise.resolve([]),
      ])

      businessContext = results[0]
      knowledgeDocs = results[1]
      prospect = results[2]
      activities = results[3]
    } catch {
      // Continue without context
    }

    const systemPrompt = buildSystemPrompt(prospect, activities, businessContext, knowledgeDocs)

    // Determine if we should enable web search
    // Enable when prospect has a company, to auto-research for personalization
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || ''
    const wantsWebSearch = lastMessage.includes('recherche') ||
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

    // Build tools array — include web search when relevant
    const tools: Anthropic.Messages.Tool[] = []
    if (wantsWebSearch) {
      tools.push({
        type: 'web_search_20250305',
        name: 'web_search',
        max_uses: 3,
      } as unknown as Anthropic.Messages.Tool)
    }

    // Enhanced system prompt with web search instructions
    let enhancedSystem = systemPrompt
    if (wantsWebSearch && prospect?.entreprise) {
      enhancedSystem += `\n\n## Recherche web
Tu as acces a la recherche web. Avant de rediger un email ou message pour ce prospect, recherche des informations recentes sur ${prospect.entreprise} pour personnaliser ton message :
- Actualites recentes de l'entreprise
- Projets, levees de fonds, nouveaux produits
- Informations sur le secteur d'activite
Utilise ces informations pour rendre le message plus pertinent et personnalise.`
    }

    // Use streaming with tool use support
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // First call — may trigger web search
          let response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: enhancedSystem,
            tools: tools.length > 0 ? tools : undefined,
            messages: messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          })

          // Handle tool use loop (web search may be called)
          const allMessages = [...messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content as string | Anthropic.Messages.ContentBlock[],
          }))]
          let loopCount = 0
          const maxLoops = 5

          while (response.stop_reason === 'tool_use' && loopCount < maxLoops) {
            loopCount++

            // Send a searching indicator to the client
            controller.enqueue(encoder.encode(
              `data: ${JSON.stringify({ text: '\n\n*Recherche en cours...*\n\n' })}\n\n`
            ))

            // Collect tool results
            const toolUseBlocks = response.content.filter(
              (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use'
            )

            // Build the assistant message with all content blocks
            allMessages.push({
              role: 'assistant',
              content: response.content,
            })

            // Build tool results
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = toolUseBlocks.map((toolUse) => ({
              type: 'tool_result' as const,
              tool_use_id: toolUse.id,
              content: 'Search completed',
            }))

            allMessages.push({
              role: 'user',
              content: toolResults as unknown as string,
            })

            // Continue the conversation
            response = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 4096,
              system: enhancedSystem,
              tools: tools.length > 0 ? tools : undefined,
              messages: allMessages as Anthropic.Messages.MessageParam[],
            })
          }

          // Extract text from final response
          for (const block of response.content) {
            if (block.type === 'text') {
              // Send in chunks to simulate streaming
              const chunkSize = 20
              for (let i = 0; i < block.text.length; i += chunkSize) {
                const chunk = block.text.slice(i, i + chunkSize)
                controller.enqueue(encoder.encode(
                  `data: ${JSON.stringify({ text: chunk })}\n\n`
                ))
              }
            }
          }

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          const errorMessage = parseAnthropicError(error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMessage })}\n\n`
            )
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
