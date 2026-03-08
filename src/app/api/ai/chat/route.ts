import { GoogleGenAI } from '@google/genai'
import { NextRequest } from 'next/server'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { getProspect, getActivities, getBusinessContext, getKnowledgeDocuments, getProspectsSummary } from '@/lib/actions'
import { logApiUsage } from '@/lib/api-usage'
import type { Prospect } from '@/lib/types'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

function parseGeminiError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message
    if (msg.includes('API_KEY') || msg.includes('401')) return 'Cle API Gemini invalide. Verifiez votre GEMINI_API_KEY.'
    if (msg.includes('quota') || msg.includes('429')) return 'Quota API depasse. Reessayez dans quelques secondes.'
    if (msg.includes('500') || msg.includes('503')) return 'API Gemini surchargee. Reessayez dans un moment.'
    if (msg.includes('SAFETY')) return 'Reponse bloquee par le filtre de securite. Reformulez votre demande.'
    return `Erreur API : ${msg}`
  }
  return 'Erreur inconnue'
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: 'Cle API Gemini non configuree. Ajoutez GEMINI_API_KEY dans .env.local' },
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

    // Determine if we should enable Google Search grounding
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

    // Enhanced system prompt with web search instructions
    let enhancedSystem = systemPrompt
    if (wantsWebSearch && prospect?.entreprise) {
      enhancedSystem += `\n\n## Recherche web
Tu as acces a la recherche Google. Avant de rediger un email ou message pour ce prospect, recherche des informations recentes sur ${prospect.entreprise} pour personnaliser ton message :
- Actualites recentes de l'entreprise
- Projets, levees de fonds, nouveaux produits
- Informations sur le secteur d'activite
Utilise ces informations pour rendre le message plus pertinent et personnalise.`
    }

    // Convert messages to Gemini format (assistant -> model)
    const geminiMessages = messages.map((m) => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as 'model' | 'user',
      parts: [{ text: m.content }],
    }))

    // Use streaming for real-time response
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const stream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash',
            contents: geminiMessages,
            config: {
              systemInstruction: enhancedSystem,
              maxOutputTokens: 4096,
              tools: wantsWebSearch ? [{ googleSearch: {} }] : undefined,
            },
          })

          let inputTokens = 0
          let outputTokens = 0

          for await (const chunk of stream) {
            const text = chunk.text || ''
            if (text) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ text })}\n\n`
              ))
            }
            // Capture usage from chunks (last chunk typically has it)
            if (chunk.usageMetadata) {
              inputTokens = chunk.usageMetadata.promptTokenCount || 0
              outputTokens = chunk.usageMetadata.candidatesTokenCount || 0
            }
          }

          // Log API usage
          logApiUsage({
            endpoint: 'chat',
            model: 'gemini-2.5-flash',
            input_tokens: inputTokens,
            output_tokens: outputTokens,
          })

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          const errorMessage = parseGeminiError(error)
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
    const message = parseGeminiError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
