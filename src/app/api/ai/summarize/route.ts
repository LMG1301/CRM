import { GoogleGenAI } from '@google/genai'
import { NextRequest } from 'next/server'
import { logApiUsage } from '@/lib/api-usage'

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: 'Cle API Gemini non configuree' },
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

    // Truncate transcript for API call if very long (keep first 50k chars for summary)
    const truncatedTranscript = transcript.length > 50000
      ? transcript.substring(0, 50000) + '\n[... tronque pour le resume]'
      : transcript

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Resume cette transcription d'appel commercial en 5 a 8 lignes maximum.
Garde les points cles : interlocuteur, sujet principal, decisions prises, prochaines etapes.
Ecris en francais, style professionnel et concis.

Transcription :
${truncatedTranscript}`,
      config: {
        maxOutputTokens: 500,
      },
    })

    // Log API usage
    logApiUsage({
      endpoint: 'summarize',
      model: 'gemini-2.5-flash',
      input_tokens: response.usageMetadata?.promptTokenCount || 0,
      output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
    })

    const summary = response.text || ''

    return Response.json({ summary })
  } catch (error) {
    console.error('Summarize error:', error)
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
