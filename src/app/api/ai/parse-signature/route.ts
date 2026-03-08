import { NextRequest, NextResponse } from 'next/server'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token || token !== process.env.CRM_PASSWORD) {
      return NextResponse.json({ error: 'Non autorise' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY non configure' },
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } },
      )
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { signature_text } = await req.json()

    if (!signature_text || typeof signature_text !== 'string' || signature_text.trim().length < 5) {
      return NextResponse.json(
        { error: 'Texte de signature requis (min 5 caracteres)' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const model = resolveModel('parse-signature')
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Tu es un parseur de signatures email. Extrais les informations structurees de cette signature.

Signature :
${signature_text.slice(0, 1000)}

Reponds UNIQUEMENT en JSON valide :
{ "entreprise": "nom ou null", "telephone": "numero ou null", "site_web": "url ou null", "fonction": "titre ou null", "localisation": "ville/pays ou null" }

Mets null pour les champs absents ou non detectes.`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'parse-signature',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { entreprise: null, telephone: null, site_web: null, fonction: null, localisation: null },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const result = JSON.parse(jsonMatch[0])
    // Clean null strings
    const cleaned: Record<string, string | null> = {}
    for (const [key, value] of Object.entries(result)) {
      cleaned[key] = value && value !== 'null' ? String(value) : null
    }

    return NextResponse.json(cleaned, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (error) {
    const message = parseAnthropicError(error)
    return NextResponse.json({ error: message }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
