import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'

/**
 * POST /api/ai/summarize-url
 * Fetches a URL, extracts text, and returns structured content (title, summary, tags).
 */
export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { url } = await request.json()

    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'URL requise' }, { status: 400 })
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return Response.json({ error: 'URL invalide' }, { status: 400 })
    }

    // Fetch the page content server-side
    const pageRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BoostCRM/1.0)',
        Accept: 'text/html,application/xhtml+xml,*/*',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!pageRes.ok) {
      return Response.json(
        { error: `Impossible de charger la page (${pageRes.status})` },
        { status: 422 },
      )
    }

    const html = await pageRes.text()

    // Extract text: strip scripts/styles, then tags
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim()

    // Truncate to ~4000 chars
    if (text.length > 4000) {
      text = text.slice(0, 4000) + '...'
    }

    if (text.length < 50) {
      return Response.json(
        { error: 'Page vide ou contenu non extractible' },
        { status: 422 },
      )
    }

    const model = resolveModel('summarize-url')
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 500,
      system: `Tu es un assistant qui analyse des pages web pour un CRM de prospection commerciale dans le secteur de la distribution automatique (vending) et du retail connecte.

Analyse le texte de la page et retourne un JSON avec :
- "title": le titre principal de l'article/page
- "summary": un resume en 2-3 phrases du contenu
- "themes": un array de themes parmi : telemetrie, paiement, cashless, durabilite, rse, ia, iot, retail, logistique, hygiene, cafe, snack, boissons, micro_market, smart_fridge, gestion_parc, maintenance, economie_circulaire, digitalisation, experience_client (array vide si aucun ne correspond)
- "products": un array de produits parmi : boost_telemetry, boost_payment, boost_analytics, boost_connect (array vide si non pertinent)

Reponds UNIQUEMENT en JSON valide, sans commentaires.`,
      messages: [
        {
          role: 'user',
          content: `URL: ${url}\n\nContenu de la page:\n${text}`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'summarize-url',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    let rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) rawText = fenceMatch[1].trim()

    const parsed = JSON.parse(rawText)

    return Response.json({
      title: parsed.title || '',
      summary: parsed.summary || '',
      themes: Array.isArray(parsed.themes) ? parsed.themes : [],
      products: Array.isArray(parsed.products) ? parsed.products : [],
      url,
    })
  } catch (error) {
    const parsed = parseAnthropicError(error)
    return Response.json({ error: parsed }, { status: 500 })
  }
}
