import Anthropic from '@anthropic-ai/sdk'
import { NextRequest } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '',
})

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'Cle API Anthropic non configuree' },
        { status: 500 }
      )
    }

    const { transcript } = await request.json()

    if (!transcript || typeof transcript !== 'string') {
      return Response.json(
        { error: 'Transcript manquant' },
        { status: 400 }
      )
    }

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: `Resume cette transcription d'appel commercial en 5 a 8 lignes maximum.
Garde les points cles : interlocuteur, sujet principal, decisions prises, prochaines etapes.
Ecris en francais, style professionnel et concis.

Transcription :
${transcript}`,
        },
      ],
    })

    const summary =
      response.content[0].type === 'text' ? response.content[0].text : ''

    return Response.json({ summary })
  } catch (error) {
    console.error('Summarize error:', error)
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
