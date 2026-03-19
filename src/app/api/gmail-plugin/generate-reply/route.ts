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

    console.log('[generate-reply] received:', { prospect_id, prospect_email, sender_name, instruction: instruction?.substring(0, 50), model: requestedModel })

    // Load business context
    const { data: bizContext, error: bizErr } = await supabase
      .from('business_context')
      .select('company_name, tone_and_style, email_signature, sales_method')
      .limit(1)
      .maybeSingle()

    if (bizErr) console.log('[generate-reply] bizContext error:', bizErr.message)

    const anthropic = getAnthropicClient()
    // Use requested model or default to sonnet
    const modelId = requestedModel || 'claude-sonnet-4-20250514'

    let prospectContext = ''
    let emailHistory = ''

    // If we have a prospect, enrich with CRM context
    if (prospect_id) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('*')
        .eq('id', prospect_id)
        .maybeSingle()

      if (prospect) {
        const { data: recentEmails } = await supabase
          .from('emails')
          .select('subject, from_email, body_preview, gmail_date, direction')
          .eq('prospect_id', prospect_id)
          .order('gmail_date', { ascending: false })
          .limit(5)

        const { data: lastNote } = await supabase
          .from('activities')
          .select('content')
          .eq('prospect_id', prospect_id)
          .in('type', ['note', 'transcription', 'call_log'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        prospectContext = `CONTEXTE DU PROSPECT :
- Prenom : ${prospect.prenom || '?'}
- Nom : ${prospect.nom || '?'}
- Entreprise : ${prospect.entreprise || '?'}
- Etape pipeline : ${prospect.pipeline_stage || '?'}
- Derniere note : ${lastNote?.content?.slice(0, 300) || 'Aucune'}`

        emailHistory = (recentEmails || []).map(e => {
          const dir = e.direction === 'sent' ? 'Nous avons envoye' : 'Il/elle a repondu'
          return `- ${dir} (${e.gmail_date?.split('T')[0] || '?'}): "${e.subject || '(sans objet)'}" — ${(e.body_preview || '').slice(0, 200)}`
        }).join('\n')
      }
    }

    // If no prospect context, use sender info
    if (!prospectContext) {
      prospectContext = `CONTEXTE DE L'EXPEDITEUR :
- Nom : ${sender_name || '?'}
- Email : ${prospect_email || '?'}
- Note : Ce contact n'est pas encore dans le CRM. Pas d'historique disponible.`
    }

    const systemPrompt = `Tu es ${bizContext?.company_name ? `Louis Matar, Business Development chez ${bizContext.company_name}` : 'un commercial B2B'}.
Tu rediges une reponse a un email recu, en francais.

STYLE DE COMMUNICATION :
${bizContext?.tone_and_style || 'Professionnel mais humain. Messages courts et percutants.'}

${bizContext?.sales_method ? `METHODE COMMERCIALE :\n${bizContext.sales_method}` : ''}

REGLES STRICTES :
- Vouvoiement toujours
- 5 a 8 lignes MAXIMUM pour le corps (sans compter la formule de politesse)
- Pas de "J'espere que vous allez bien"
- Pas de "Belle journee" → utiliser "Bonne journee" ou "Bien a vous"
- Pas de tirets longs
- Un seul CTA clair
- Reponds au contenu de l'email, ne fais pas un pitch generique
${prospectContext.includes('pas encore dans le CRM') ? '- Pas de reference a un historique CRM puisqu\'il n\'y en a pas' : '- Personnalise avec le contexte du CRM (notes, stage, historique)'}
- NE GENERE PAS de ligne objet, juste le corps de l'email
- NE METS PAS la signature, elle sera ajoutee automatiquement
- Signe TOUJOURS avec "Louis"`

    let userPrompt = `${prospectContext}

${emailHistory ? `DERNIERS EMAILS ECHANGES :\n${emailHistory}` : ''}

EMAIL RECU (a repondre) :
De : ${prospect_email || sender_name || '?'}
Objet : ${email_subject || '(sans objet)'}
Corps :
${email_body || '(vide)'}

`

    if (instruction) {
      userPrompt += `INSTRUCTION DE L'UTILISATEUR :
L'utilisateur veut repondre ceci : "${instruction}"
Redige un email professionnel qui exprime cette intention.
Garde le ton et le style definis. Ne repete pas l'instruction mot pour mot, redige un vrai email professionnel.`
    } else {
      userPrompt += `Redige une reponse adaptee au contexte.`
    }

    console.log('[generate-reply] calling Anthropic with model:', modelId)

    const response = await anthropic.messages.create({
      model: modelId,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

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

    const signature = bizContext?.email_signature || ''
    const fullReply = signature ? reply + '\n\n' + signature : reply

    console.log('[generate-reply] success, reply length:', fullReply.length)

    return Response.json({ reply: fullReply }, { headers: corsHeaders })
  } catch (error) {
    console.error('[generate-reply] ERROR:', error)
    return Response.json(
      { error: (error as Error).message || 'Erreur serveur' },
      { status: 500, headers: corsHeaders }
    )
  }
}
