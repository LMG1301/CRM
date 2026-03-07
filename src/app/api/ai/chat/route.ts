import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { getProspect, getActivities, getBusinessContext, getKnowledgeDocuments } from '@/lib/actions'

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
    let prospect = null
    let activities: Awaited<ReturnType<typeof getActivities>> = []
    let businessContext = null
    let knowledgeDocs: Awaited<ReturnType<typeof getKnowledgeDocuments>> = []

    try {
      const contextPromise = getBusinessContext()
      const knowledgePromise = getKnowledgeDocuments()
      let prospectPromise: Promise<unknown> = Promise.resolve()
      let activitiesPromise: Promise<unknown> = Promise.resolve()

      if (prospectId) {
        prospectPromise = getProspect(prospectId).then((p) => { prospect = p })
        activitiesPromise = getActivities(prospectId).then((a) => { activities = a })
      }

      const [ctx, docs] = await Promise.all([contextPromise, knowledgePromise, prospectPromise, activitiesPromise])
      businessContext = ctx
      knowledgeDocs = docs
    } catch {
      // Continue without context
    }

    const systemPrompt = buildSystemPrompt(prospect, activities, businessContext, knowledgeDocs)

    // Stream response from Claude
    let stream
    try {
      stream = anthropic.messages.stream({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: systemPrompt,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      })
    } catch (error) {
      return Response.json({ error: parseAnthropicError(error) }, { status: 400 })
    }

    // Convert to ReadableStream for the browser
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              const chunk = `data: ${JSON.stringify({ text: event.delta.text })}\n\n`
              controller.enqueue(encoder.encode(chunk))
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
