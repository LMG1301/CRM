import { supabase } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'
import { logApiUsage } from '@/lib/api-usage'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prospect_id, prospect_email, sender_name, email_subject, email_body, instruction, model: requestedModel } = body

    // Load business context
    const { data: ctx } = await supabase
      .from('business_context')
      .select('company_name, tone_and_style, sales_methodology, email_templates, products')
      .limit(1)
    const biz = ctx?.[0] || null

    // Load email signature separately (may be in a different field)
    const { data: sigData } = await supabase
      .from('business_context')
      .select('additional_context')
      .limit(1)
    const signature = '' // Will append if exists

    const anthropic = getAnthropicClient()
    const modelId = requestedModel || 'claude-haiku-4-5-20251001'

    let prospectContext = ''
    let emailHistory = ''

    // If we have a prospect, enrich with CRM context
    if (prospect_id) {
      const { data: pData } = await supabase
        .from('prospects')
        .select('prenom, nom, entreprise, pipeline_stage, fonction, notes')
        .eq('id', prospect_id)
        .limit(1)
      const p = pData?.[0]

      if (p) {
        const { data: noteData } = await supabase
          .from('activities')
          .select('content, created_at')
          .eq('prospect_id', prospect_id)
          .in('type', ['note', 'transcription', 'call_log'])
          .order('created_at', { ascending: false })
          .limit(1)
        const lastNote = noteData?.[0]

        const { data: recentEmails } = await supabase
          .from('emails')
          .select('subject, from_email, body_preview, gmail_date, direction')
          .eq('prospect_id', prospect_id)
          .order('gmail_date', { ascending: false })
          .limit(5)

        const { data: forecastData } = await supabase
          .from('prospect_forecasts')
          .select('product_type, quantity, probability, expected_month')
          .eq('prospect_id', prospect_id)
          .limit(3)

        prospectContext = `CONTEXTE DU PROSPECT :
- Nom : ${p.prenom} ${p.nom}
- Entreprise : ${p.entreprise || 'inconnue'}
- Fonction : ${p.fonction || 'inconnue'}
- Etape pipeline : ${p.pipeline_stage}
- Derniere note : ${lastNote?.content?.substring(0, 300) || 'aucune'}
${forecastData?.length ? `- Forecast : ${forecastData.map(f => `${f.product_type} x${f.quantity} (${f.probability}%, ${f.expected_month})`).join(', ')}` : ''}`

        emailHistory = (recentEmails || []).map(e => {
          const dir = e.direction === 'sent' ? '\u2192' : '\u2190'
          return `${e.gmail_date?.split('T')[0] || '?'} ${dir} ${e.subject || '(sans objet)'}`
        }).join('\n')

        if (emailHistory) {
          prospectContext += `\n\nDERNIERS ECHANGES :\n${emailHistory}\n\nUTILISE CES INFOS pour personnaliser la reponse.`
        }
      }
    }

    if (!prospectContext) {
      prospectContext = `Contact : ${prospect_email || sender_name || 'inconnu'}. Pas encore dans le CRM.`
    }

    // Detect formality from recent emails (auto-detect tu/vous)
    let formalityInstruction = ''
    if (prospect_id && emailHistory) {
      // Check if previous emails use tutoiement
      const { data: sentEmails } = await supabase
        .from('emails')
        .select('body_preview')
        .eq('prospect_id', prospect_id)
        .eq('direction', 'sent')
        .order('gmail_date', { ascending: false })
        .limit(3)
      const sentText = sentEmails?.map(e => e.body_preview || '').join(' ') || ''
      const hasTu = /\b(tu |t'|ton |ta |tes |toi)\b/i.test(sentText)
      if (hasTu) {
        formalityInstruction = 'IMPORTANT : La relation avec ce prospect est en TUTOIEMENT (tu). Continue a le tutoyer.'
      }
    }

    const systemPrompt = `Tu es Louis Matar, Business Development chez ${biz?.company_name || 'Boost Inc'}.
Tu rediges une reponse a un email recu, en francais.

METHODE COMMERCIALE :
${(biz?.sales_methodology || '').substring(0, 400)}

STYLE DE COMMUNICATION :
${(biz?.tone_and_style || 'Professionnel mais humain. Messages courts.').substring(0, 300)}

EXEMPLES D'EMAILS QUI MARCHENT (reproduis ce ton) :
${(biz?.email_templates || '').substring(0, 800)}

${formalityInstruction}

REGLES STRICTES :
- ${formalityInstruction.includes('TUTOIEMENT') ? 'Tutoiement' : 'Vouvoiement'} obligatoire
- Messages COURTS : 5 a 8 lignes max pour le corps
- Pas de "J'espere que vous allez bien" ni "J'espere que tu vas bien"
- Pas de "Belle journee" -> "Bonne journee" ou "Bien a vous" ou "A bientot"
- Pas de tirets longs
- Un seul CTA clair
- Direct et concis
- Reponds au CONTENU de l'email recu
- NE GENERE PAS de ligne objet
- NE METS PAS de signature (ajoutee automatiquement)
- Signe TOUJOURS avec "Louis"`

    let userPrompt = `${prospectContext}

EMAIL RECU :
De : ${prospect_email || sender_name || 'inconnu'}
Objet : ${email_subject || ''}
---
${(email_body || '').substring(0, 1500)}
---
`

    if (instruction) {
      userPrompt += `\nINSTRUCTION DE LOUIS : "${instruction}"\nRedige un email qui exprime cette intention dans le style de Louis.`
    } else {
      userPrompt += '\nRedige une reponse adaptee au contexte.'
    }

    const trimmedSystem = systemPrompt.length > 2500 ? systemPrompt.substring(0, 2500) : systemPrompt

    let response
    try {
      response = await anthropic.messages.create({
        model: modelId,
        max_tokens: 800,
        system: trimmedSystem,
        messages: [{ role: 'user', content: userPrompt }],
      })
    } catch (apiError: unknown) {
      const err = apiError as { message?: string; status?: number }
      console.error('[generate-reply] Anthropic error:', err.message)
      return Response.json(
        { error: 'Erreur IA : ' + (err.message || 'serveur indisponible') },
        { status: 200, headers: corsHeaders }
      )
    }

    logApiUsage({
      endpoint: 'gmail-plugin-generate-reply',
      model: modelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n')

    return Response.json({ reply }, { headers: corsHeaders })
  } catch (error) {
    console.error('[generate-reply] ERROR:', error)
    return Response.json(
      { error: (error as Error).message || 'Erreur serveur' },
      { status: 200, headers: corsHeaders }
    )
  }
}
