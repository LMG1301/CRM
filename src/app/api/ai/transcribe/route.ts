import { NextRequest } from 'next/server'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { supabase } from '@/lib/supabase'

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

    // Web Speech API mode: receive pre-transcribed text
    const body = await request.json()
    const transcriptText: string = body.text
    const prospectId: string | null = body.prospect_id || null

    if (!transcriptText?.trim()) {
      return Response.json({ error: 'Texte requis' }, { status: 400 })
    }

    // Structure with Claude Haiku
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
  "produits": ["Smart Fridge x5", "Micro Market x2"],
  "sentiment": "positif" | "neutre" | "negatif",
  "mentioned_prospects": [{"name": "nom_mentionne", "matched_id": "uuid_ou_null"}]
}
Si aucun produit n'est mentionne, retourne un tableau vide pour "produits".`,
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
      produits: string[]
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
        produits: [],
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
