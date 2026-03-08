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

    const { prenom, nom, entreprise, fonction, email, linkedin_url, model: requestedModel } =
      await request.json()

    if (!nom && !entreprise) {
      return Response.json(
        { error: 'Nom ou entreprise requis pour la recherche' },
        { status: 400 },
      )
    }

    const fullName = [prenom, nom].filter(Boolean).join(' ')

    const systemPrompt = `Tu es un assistant de recherche commercial. L'utilisateur te donne un nom de prospect et/ou une entreprise.
Tu dois utiliser tes connaissances pour completer sa fiche contact.

IMPORTANT : Tu n'as PAS acces a Internet en temps reel. Utilise tes connaissances pour :
- Identifier l'entreprise si connue (site web, localisation, pays)
- Deduire le format d'email professionnel si l'entreprise est connue (ex: prenom.nom@entreprise.com)
- Donner des informations sur le secteur d'activite
- Pour les champs que tu ne peux pas confirmer avec certitude, mets null

Reponds UNIQUEMENT en JSON valide, sans texte avant ou apres. Pas de markdown, pas de commentaires.

Le format de reponse attendu :
{
  "prenom": "...",
  "nom": "...",
  "entreprise": "...",
  "fonction": "...",
  "email": "...",
  "email_pro": "...",
  "telephone": "...",
  "linkedin_url": "...",
  "site_web": "...",
  "localisation": "...",
  "pays": "...",
  "source_info": "..."
}

Regles :
- Ne remplis QUE les champs pour lesquels tu as des informations fiables
- Pour les champs sans information, mets null
- "source_info" est un court resume de ce que tu sais et la fiabilite de tes informations
- Pour "site_web", donne le site officiel de l'entreprise si tu le connais
- Si l'entreprise est connue, deduis le pays et la localisation
- Pour l'email, ne l'invente pas si tu n'es pas certain du format`

    const model = resolveModel('enrich-prospect', requestedModel)
    const anthropic = getAnthropicClient()

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Recherche des informations sur ce prospect pour completer sa fiche CRM :

Nom : ${fullName || '(inconnu)'}
Entreprise : ${entreprise || '(inconnue)'}
${fonction ? `Fonction actuelle : ${fonction}` : ''}
${email ? `Email connu : ${email}` : ''}
${linkedin_url ? `LinkedIn : ${linkedin_url}` : ''}

Cherche son profil LinkedIn, son poste actuel, l'adresse et le pays de l'entreprise, et tout contact utile.`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'enrich-prospect',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const resultText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    // Parse JSON from response (handle markdown code blocks)
    let enrichedData: Record<string, string | null> = {}
    try {
      const jsonMatch =
        resultText.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        resultText.match(/(\{[\s\S]*\})/)
      if (jsonMatch) {
        enrichedData = JSON.parse(jsonMatch[1].trim())
      } else {
        enrichedData = JSON.parse(resultText.trim())
      }
    } catch {
      return Response.json(
        { error: 'Impossible de parser les resultats', raw: resultText },
        { status: 500 },
      )
    }

    // Filter out null values
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(enrichedData)) {
      if (value && value !== 'null' && value !== '') {
        result[key] = value
      }
    }

    return Response.json({ data: result })
  } catch (error) {
    console.error('Enrich error:', error)
    const message = parseAnthropicError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
