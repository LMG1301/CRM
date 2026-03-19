import { supabase } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
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
    const { prospect_id, prospect_email, email_subject, email_body } = await request.json()

    if (!prospect_id) {
      return Response.json({ error: 'prospect_id requis' }, { status: 400, headers: corsHeaders })
    }

    // 1. Load prospect
    const { data: prospect } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospect_id)
      .single()

    if (!prospect) {
      return Response.json({ error: 'Prospect non trouve' }, { status: 404, headers: corsHeaders })
    }

    // 2. Load recent emails
    const { data: recentEmails } = await supabase
      .from('emails')
      .select('subject, from_email, body_preview, gmail_date, direction')
      .eq('prospect_id', prospect_id)
      .order('gmail_date', { ascending: false })
      .limit(5)

    // 3. Load last note
    const { data: lastNote } = await supabase
      .from('activities')
      .select('content')
      .eq('prospect_id', prospect_id)
      .in('type', ['note', 'transcription', 'call_log'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // 4. Load business context
    const { data: bizContext } = await supabase
      .from('business_context')
      .select('company_name, tone_and_style, email_signature, sales_method')
      .limit(1)
      .single()

    // 5. Generate reply
    const model = resolveModel('generate-sequence-email')
    const anthropic = getAnthropicClient()

    const systemPrompt = `Tu es ${bizContext?.company_name ? `Louis Matar, Business Development chez ${bizContext.company_name}` : 'un commercial B2B'}.
Tu rediges une reponse a un email recu d'un prospect, en francais.

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
- Personnalise avec le contexte du CRM (notes, stage, historique)
- NE GENERE PAS de ligne objet, juste le corps de l'email
- NE METS PAS la signature, elle sera ajoutee automatiquement
- Signe TOUJOURS avec "Louis"`

    const emailHistory = (recentEmails || []).map(e => {
      const dir = e.direction === 'sent' ? 'Nous avons envoye' : 'Il/elle a repondu'
      return `- ${dir} (${e.gmail_date?.split('T')[0] || '?'}): "${e.subject || '(sans objet)'}" — ${(e.body_preview || '').slice(0, 200)}`
    }).join('\n')

    const userMessage = `CONTEXTE DU PROSPECT :
- Prenom : ${prospect.prenom || '?'}
- Nom : ${prospect.nom || '?'}
- Entreprise : ${prospect.entreprise || '?'}
- Etape pipeline : ${prospect.pipeline_stage || '?'}
- Derniere note : ${lastNote?.content?.slice(0, 300) || 'Aucune'}

DERNIERS EMAILS ECHANGES :
${emailHistory || 'Aucun'}

EMAIL RECU (a repondre) :
De : ${prospect_email || '?'}
Objet : ${email_subject || '(sans objet)'}
Corps :
${email_body || '(vide)'}

Redige une reponse a cet email.`

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    })

    logApiUsage({
      endpoint: 'generate-sequence-email',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n')

    // Append signature
    const signature = bizContext?.email_signature || ''
    const fullReply = signature ? reply + '\n\n' + signature : reply

    return Response.json({ reply: fullReply }, { headers: corsHeaders })
  } catch (error) {
    console.error('[gmail-plugin/generate-reply]', error)
    return Response.json(
      { error: (error as Error).message },
      { status: 500, headers: corsHeaders }
    )
  }
}
