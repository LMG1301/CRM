import { NextRequest } from 'next/server'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY non configure' },
        { status: 500 },
      )
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { transcript, model: requestedModel } = await request.json()

    if (!transcript || typeof transcript !== 'string') {
      return Response.json({ error: 'Transcript manquant' }, { status: 400 })
    }

    const truncatedTranscript =
      transcript.length > 50000
        ? transcript.substring(0, 50000) + '\n[... tronque pour le resume]'
        : transcript

    const model = resolveModel('summarize', requestedModel)
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Resume cette transcription d'appel commercial en 5 a 8 lignes maximum.
Garde les points cles : interlocuteur, sujet principal, decisions prises, prochaines etapes.
Ecris en francais, style professionnel et concis.

Transcription :
${truncatedTranscript}`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'summarize',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const summary = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return Response.json({ summary })
  } catch (error) {
    console.error('Summarize error:', error)
    const message = parseAnthropicError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
