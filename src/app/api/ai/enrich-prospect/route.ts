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

    const { prenom, nom, entreprise, fonction, email, linkedin_url, site_web, model: requestedModel } =
      await request.json()

    if (!nom && !entreprise) {
      return Response.json(
        { error: 'Nom ou entreprise requis pour la recherche' },
        { status: 400 },
      )
    }

    const fullName = [prenom, nom].filter(Boolean).join(' ')
    const model = resolveModel('enrich-prospect', requestedModel)
    const anthropic = getAnthropicClient()

    const userContent = [
      `Recherche des informations sur ce prospect pour completer sa fiche CRM :`,
      ``,
      `Nom : ${fullName || '(inconnu)'}`,
      `Entreprise : ${entreprise || '(inconnue)'}`,
      fonction ? `Fonction actuelle : ${fonction}` : null,
      email ? `Email connu : ${email}` : null,
      linkedin_url ? `LinkedIn : ${linkedin_url}` : null,
      site_web ? `Site web : ${site_web}` : null,
      ``,
      `Recherche sur le web les informations suivantes :`,
      `- Son poste/fonction exact`,
      `- Le site web de l'entreprise`,
      `- Son email professionnel si trouvable publiquement`,
      `- Le telephone de l'entreprise`,
      `- La ville/localisation`,
      `- Le pays`,
      ``,
      `Retourne UNIQUEMENT un JSON valide (pas de markdown, pas de texte avant/apres) :`,
      `{`,
      `  "prenom": "...",`,
      `  "nom": "...",`,
      `  "entreprise": "...",`,
      `  "fonction": "...",`,
      `  "email": "...",`,
      `  "email_pro": "...",`,
      `  "telephone": "...",`,
      `  "linkedin_url": "...",`,
      `  "site_web": "...",`,
      `  "localisation": "...",`,
      `  "pays": "...",`,
      `  "source_info": "court resume des sources utilisees"`,
      `}`,
      ``,
      `Pour les champs sans information fiable, mets null.`,
      `Ne devine PAS les emails — ne les retourne que si tu les trouves publiquement.`,
      `"source_info" doit indiquer d'ou viennent les donnees (ex: "LinkedIn + site web entreprise").`,
    ].filter(Boolean).join('\n')

    // Try with web_search tool first
    let enrichedData: Record<string, string | null> = {}
    let usedWebSearch = false

    try {
      const response = await anthropic.messages.create({
        model: model.apiModelId,
        max_tokens: 1024,
        tools: [
          {
            type: 'web_search_20250305' as const,
            name: 'web_search',
            max_uses: 3,
          },
        ],
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      })

      logApiUsage({
        endpoint: 'enrich-prospect',
        model: model.apiModelId,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      })

      // Extract text from response (may contain web_search_tool_result blocks too)
      const resultText = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')

      usedWebSearch = response.content.some(
        (b) => b.type === 'web_search_tool_result'
      )

      // Parse JSON from response
      enrichedData = parseJsonFromText(resultText)
    } catch (webSearchError) {
      // Fallback: try without web_search if the tool is not available
      console.warn('Web search failed, falling back to knowledge-only:', webSearchError)

      const fallbackResponse = await anthropic.messages.create({
        model: model.apiModelId,
        max_tokens: 1024,
        system: [
          {
            type: 'text' as const,
            text: `Tu es un assistant de recherche commercial. Complete la fiche contact avec tes connaissances.
Reponds UNIQUEMENT en JSON valide, sans texte avant ou apres. Pas de markdown.
Pour les champs sans information fiable, mets null.
Ne devine PAS les emails.`,
            cache_control: { type: 'ephemeral' as const },
          },
        ],
        messages: [
          {
            role: 'user',
            content: userContent,
          },
        ],
      })

      logApiUsage({
        endpoint: 'enrich-prospect',
        model: model.apiModelId,
        input_tokens: fallbackResponse.usage.input_tokens,
        output_tokens: fallbackResponse.usage.output_tokens,
      })

      const fallbackText = fallbackResponse.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')

      enrichedData = parseJsonFromText(fallbackText)
    }

    // Filter out null values and build result
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(enrichedData)) {
      if (value && value !== 'null' && value !== '') {
        result[key] = value
      }
    }

    // Add metadata about the search method
    if (!result.source_info) {
      result.source_info = usedWebSearch
        ? 'Recherche web Anthropic'
        : 'Connaissances IA (pas de recherche web)'
    }

    return Response.json({ data: result, web_search_used: usedWebSearch })
  } catch (error) {
    console.error('Enrich error:', error)
    const message = parseAnthropicError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}

/**
 * Parse JSON from Claude's response text, handling markdown code blocks
 */
function parseJsonFromText(text: string): Record<string, string | null> {
  try {
    const jsonMatch =
      text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      text.match(/(\{[\s\S]*\})/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim())
    }
    return JSON.parse(text.trim())
  } catch {
    console.error('Failed to parse enrich response:', text.substring(0, 200))
    return {}
  }
}
