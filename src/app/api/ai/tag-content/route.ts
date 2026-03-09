import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { CONTENT_THEMES, CONTENT_PRODUCTS } from '@/lib/types'

/**
 * AI Content Tagging — auto-tags a content piece with themes, products, stages, sectors, funnel level.
 *
 * POST /api/ai/tag-content
 * Body: { title, body?, content_type, url? }
 */
export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { title, body, content_type, url } = await request.json()

    if (!title) {
      return Response.json({ error: 'Le titre est requis' }, { status: 400 })
    }

    const model = resolveModel('tag-content')
    const anthropic = getAnthropicClient()

    const contentText = [
      `Titre: ${title}`,
      content_type && `Type: ${content_type}`,
      url && `URL: ${url}`,
      body && `Contenu:\n${body}`,
    ].filter(Boolean).join('\n')

    const validThemes = CONTENT_THEMES.join(', ')
    const validProducts = CONTENT_PRODUCTS.join(', ')
    const validStages = 'ciblage, touch_1, repondu, devis, onboarding, a_recontacter'

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 400,
      system: `Tu es un assistant marketing B2B specialise dans la distribution automatique et le retail connecte. Analyse le contenu et attribue des tags pertinents.

Themes valides: ${validThemes}
Produits valides: ${validProducts}
Stages pipeline valides (a quel moment du cycle de vente ce contenu est pertinent): ${validStages}

Niveau funnel — determine a quel niveau du funnel marketing ce contenu se situe :
- "tofu" (Top of Funnel) : contenu de sensibilisation — tendances marche, chiffres cles, actualites sectorielles, contenu educatif general
- "mofu" (Middle of Funnel) : contenu de consideration — cas clients, comparatifs, demos produit, webinaires, guides techniques
- "bofu" (Bottom of Funnel) : contenu de decision — ROI detaille, pricing, offres commerciales, temoignages clients specifiques, etudes de cas chiffrees

Reponds UNIQUEMENT en JSON valide:
{"themes": ["..."], "products": ["..."], "pipeline_stages": ["..."], "target_sectors": ["..."], "funnel_level": "tofu|mofu|bofu"}

Pour target_sectors, utilise des termes libres comme: grande_distribution, restauration, hotellerie, sante, transport, education, industrie, bureau, collectivite.`,
      messages: [
        {
          role: 'user',
          content: `Analyse ce contenu et attribue les tags:\n\n${contentText}`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'tag-content',
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

    // Validate funnel_level
    const validFunnelLevels = ['tofu', 'mofu', 'bofu']
    const funnelLevel = validFunnelLevels.includes(parsed.funnel_level) ? parsed.funnel_level : null

    return Response.json({
      themes: parsed.themes || [],
      products: parsed.products || [],
      pipeline_stages: parsed.pipeline_stages || [],
      target_sectors: parsed.target_sectors || [],
      funnel_level: funnelLevel,
    })
  } catch (error) {
    const parsed = parseAnthropicError(error)
    return Response.json({ error: parsed }, { status: 500 })
  }
}
