import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { supabase } from '@/lib/supabase'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' })

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: 'OPENAI_API_KEY non configure' },
        { status: 500 },
      )
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'ANTHROPIC_API_KEY non configure' },
        { status: 500 },
      )
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null
    const prospectId = formData.get('prospect_id') as string | null

    if (!audioFile) {
      return Response.json({ error: 'Fichier audio requis' }, { status: 400 })
    }

    // Step 1: Transcribe with OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'fr',
      response_format: 'text',
    })

    const transcriptText = typeof transcription === 'string'
      ? transcription
      : (transcription as unknown as { text: string }).text

    // Log Whisper usage (estimate tokens from audio size)
    logApiUsage({
      endpoint: 'transcribe-whisper',
      model: 'whisper-1',
      input_tokens: Math.round(audioFile.size / 100), // rough estimate
      output_tokens: 0,
    })

    // Step 2: Structure with Claude Haiku
    const model = resolveModel('transcribe-structure')
    const anthropic = getAnthropicClient()

    // Load prospect names for fuzzy matching of mentioned names
    let prospectList = ''
    if (prospectId) {
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .limit(200)

      prospectList = (prospects || [])
        .map((p) => `${p.prenom} ${p.nom} (${p.entreprise || '?'}) [id:${p.id}]`)
        .join('\n')
    }

    const structureResponse = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 600,
      system: `Tu es un assistant commercial. Tu recois une transcription de note vocale.
Extrais les informations structurees au format JSON.

${prospectList ? `Voici les prospects connus dans le CRM :\n${prospectList}\n\nSi un nom mentionne dans la transcription ressemble a un prospect connu (meme approximativement), indique-le dans mentioned_prospects avec son id.` : ''}

Reponds UNIQUEMENT en JSON valide :
{
  "resume": "Resume en 2-3 phrases",
  "points_cles": ["point 1", "point 2"],
  "action_items": ["action 1", "action 2"],
  "sentiment": "positif" | "neutre" | "negatif",
  "mentioned_prospects": [{"name": "nom_mentionne", "matched_id": "uuid_ou_null"}]
}`,
      messages: [
        {
          role: 'user',
          content: `Transcription de note vocale :\n\n${transcriptText}`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'transcribe-structure',
      model: model.apiModelId,
      input_tokens: structureResponse.usage.input_tokens,
      output_tokens: structureResponse.usage.output_tokens,
    })

    // Parse structured response
    const structuredText = structureResponse.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    let structured: {
      resume: string
      points_cles: string[]
      action_items: string[]
      sentiment: string
      mentioned_prospects: Array<{ name: string; matched_id: string | null }>
    }

    try {
      const jsonMatch =
        structuredText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        structuredText.match(/(\{[\s\S]*\})/)
      structured = JSON.parse(
        jsonMatch ? jsonMatch[1].trim() : structuredText.trim(),
      )
    } catch {
      structured = {
        resume: transcriptText,
        points_cles: [],
        action_items: [],
        sentiment: 'neutre',
        mentioned_prospects: [],
      }
    }

    return Response.json({
      transcription: transcriptText,
      structured,
    })
  } catch (error) {
    console.error('Transcribe error:', error)
    const message = parseAnthropicError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
