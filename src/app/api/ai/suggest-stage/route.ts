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

    const { fonction, entreprise, localisation } = await req.json()

    if (!fonction && !entreprise) {
      return NextResponse.json(
        { error: 'Fonction ou entreprise requis' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const model = resolveModel('suggest-stage')
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Tu es un assistant commercial pour Boost Inc., entreprise specialisee dans la telemetrie et le paiement pour la distribution automatique (vending machines).

A partir des informations suivantes sur un prospect LinkedIn :
- Fonction : ${fonction || 'Non renseignee'}
- Entreprise : ${entreprise || 'Non renseignee'}
- Localisation : ${localisation || 'Non renseignee'}

Suggere :
1. Le stage pipeline initial parmi : ciblage, touch_1, nurturing
   - ciblage = on vient de le trouver, pas encore contacte
   - touch_1 = profil tres pertinent, on peut contacter directement
   - nurturing = profil interessant mais pas pret a acheter, on va lui envoyer du contenu
2. Les produits Boost pertinents parmi : boost_telemetry, boost_payment, boost_analytics, boost_connect
   - boost_telemetry = telemetrie machine, monitoring a distance
   - boost_payment = terminaux de paiement cashless
   - boost_analytics = analytics et reporting
   - boost_connect = connectivite IoT

Reponds UNIQUEMENT en JSON valide :
{ "pipeline_stage": "...", "products": ["..."], "reasoning": "explication en 1 phrase" }`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'suggest-stage',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json(
        { pipeline_stage: 'ciblage', products: [], reasoning: 'Suggestion par defaut' },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json(result, {
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
