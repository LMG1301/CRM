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

    const { prenom, nom, entreprise, fonction, email, linkedin_url } = await request.json()

    if (!nom && !entreprise) {
      return Response.json(
        { error: 'Nom ou entreprise requis pour la recherche' },
        { status: 400 }
      )
    }

    const fullName = [prenom, nom].filter(Boolean).join(' ')

    const systemPrompt = `Tu es un assistant de recherche commercial. L'utilisateur te donne un nom de prospect et/ou une entreprise.
Tu dois rechercher sur le web des informations pour completer sa fiche contact.

IMPORTANT : Reponds UNIQUEMENT en JSON valide, sans texte avant ou apres. Pas de markdown, pas de commentaires.

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
- Ne remplis QUE les champs pour lesquels tu as trouve des informations fiables
- Pour les champs sans information trouvee, mets null
- "source_info" est un court resume (1-2 lignes) de ce que tu as trouve sur la personne/entreprise
- Pour "site_web", trouve le site officiel de l'entreprise (ex: https://www.acme.com)
- Cherche en priorite : profil LinkedIn, site web de l'entreprise, annuaires professionnels
- Si l'entreprise est connue, deduis le pays et la localisation
- Pour le telephone, essaie de trouver le standard de l'entreprise si pas de ligne directe
- Pour l'email, si tu ne trouves pas l'email exact, ne l'invente pas`

    // Use Google Search grounding for web research
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Recherche des informations sur ce prospect pour completer sa fiche CRM :

Nom : ${fullName || '(inconnu)'}
Entreprise : ${entreprise || '(inconnue)'}
${fonction ? `Fonction actuelle : ${fonction}` : ''}
${email ? `Email connu : ${email}` : ''}
${linkedin_url ? `LinkedIn : ${linkedin_url}` : ''}

Cherche son profil LinkedIn, son poste actuel, l'adresse et le pays de l'entreprise, et tout contact utile.`,
      config: {
        systemInstruction: systemPrompt,
        maxOutputTokens: 1024,
        tools: [{ googleSearch: {} }],
      },
    })

    // Log API usage
    logApiUsage({
      endpoint: 'enrich-prospect',
      model: 'gemini-2.5-flash',
      input_tokens: response.usageMetadata?.promptTokenCount || 0,
      output_tokens: response.usageMetadata?.candidatesTokenCount || 0,
    })

    // Extract text from response
    const resultText = response.text || ''

    // Parse JSON from response (handle markdown code blocks)
    let enrichedData: Record<string, string | null> = {}
    try {
      // Try to extract JSON from code blocks or raw text
      const jsonMatch = resultText.match(/```(?:json)?\s*([\s\S]*?)```/) || resultText.match(/(\{[\s\S]*\})/)
      if (jsonMatch) {
        enrichedData = JSON.parse(jsonMatch[1].trim())
      } else {
        enrichedData = JSON.parse(resultText.trim())
      }
    } catch {
      return Response.json(
        { error: 'Impossible de parser les resultats', raw: resultText },
        { status: 500 }
      )
    }

    // Filter out null values and return only found info
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(enrichedData)) {
      if (value && value !== 'null' && value !== '') {
        result[key] = value
      }
    }

    return Response.json({ data: result })
  } catch (error) {
    console.error('Enrich error:', error)
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
