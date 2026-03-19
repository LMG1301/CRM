'use server'

import { supabase } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'

const PROSPECT_FIELDS = 'id, prenom, nom, entreprise, fonction, pipeline_stage, email, email_pro, telephone, localisation'

export async function searchProspect(query: string) {
  if (!query.trim()) return { found: false as const }

  const isEmail = query.includes('@')
  const term = query.trim().toLowerCase()

  let prospect = null

  if (isEmail) {
    // Search by email
    const { data: d1 } = await supabase
      .from('prospects')
      .select(PROSPECT_FIELDS)
      .ilike('email', term)
      .limit(1)
      .maybeSingle()
    prospect = d1

    if (!prospect) {
      const { data: d2 } = await supabase
        .from('prospects')
        .select(PROSPECT_FIELDS)
        .ilike('email_pro', term)
        .limit(1)
        .maybeSingle()
      prospect = d2
    }

    // Search in emails table
    if (!prospect) {
      const { data: emailRec } = await supabase
        .from('emails')
        .select('prospect_id')
        .or(`from_email.ilike.${term},to_email.ilike.${term}`)
        .not('prospect_id', 'is', null)
        .limit(1)
        .maybeSingle()
      if (emailRec?.prospect_id) {
        const { data } = await supabase
          .from('prospects')
          .select(PROSPECT_FIELDS)
          .eq('id', emailRec.prospect_id)
          .maybeSingle()
        prospect = data
      }
    }
  } else {
    // Search by company name
    const { data: d1 } = await supabase
      .from('prospects')
      .select(PROSPECT_FIELDS)
      .ilike('entreprise', `%${term}%`)
      .limit(1)
    if (d1 && d1.length > 0) prospect = d1[0]

    // Search by nom/prenom
    if (!prospect) {
      const { data: d2 } = await supabase
        .from('prospects')
        .select(PROSPECT_FIELDS)
        .or(`nom.ilike.%${term}%,prenom.ilike.%${term}%`)
        .limit(1)
      if (d2 && d2.length > 0) prospect = d2[0]
    }

    // Multi-word: try prenom + nom
    if (!prospect) {
      const parts = term.split(/\s+/).filter(p => p.length > 1)
      if (parts.length >= 2) {
        const { data } = await supabase
          .from('prospects')
          .select(PROSPECT_FIELDS)
          .ilike('prenom', `%${parts[0]}%`)
          .ilike('nom', `%${parts.slice(1).join(' ')}%`)
          .limit(1)
        if (data && data.length > 0) prospect = data[0]
      }
    }
  }

  if (!prospect) return { found: false as const }

  // Enrich with last note + stage label
  const [noteResult, stageResult] = await Promise.all([
    supabase
      .from('activities')
      .select('content')
      .eq('prospect_id', prospect.id)
      .in('type', ['note', 'transcription', 'call_log'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('pipeline_stages')
      .select('label')
      .eq('name', prospect.pipeline_stage)
      .maybeSingle(),
  ])

  return {
    found: true as const,
    prospect: {
      ...prospect,
      pipeline_stage_label: stageResult.data?.label || prospect.pipeline_stage,
      derniere_note: noteResult.data?.content || null,
    },
  }
}

export async function generateQuickReply(
  prospectId: string | null,
  prospectEmail: string,
  emailBody: string,
  instruction: string | null,
  model: string
) {
  const { data: bizContext } = await supabase
    .from('business_context')
    .select('company_name, tone_and_style, email_signature, sales_method')
    .limit(1)
    .maybeSingle()

  const anthropic = getAnthropicClient()
  const modelId = model || 'claude-haiku-4-5-20251001'

  let prospectContext = ''
  let emailHistory = ''

  if (prospectId) {
    const { data: prospect } = await supabase
      .from('prospects')
      .select('*')
      .eq('id', prospectId)
      .maybeSingle()

    if (prospect) {
      const { data: recentEmails } = await supabase
        .from('emails')
        .select('subject, from_email, body_preview, gmail_date, direction')
        .eq('prospect_id', prospectId)
        .order('gmail_date', { ascending: false })
        .limit(5)

      const { data: lastNote } = await supabase
        .from('activities')
        .select('content')
        .eq('prospect_id', prospectId)
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
        return `- ${dir} (${e.gmail_date?.split('T')[0] || '?'}): "${e.subject || '(sans objet)'}"`
      }).join('\n')
    }
  }

  if (!prospectContext) {
    prospectContext = `CONTEXTE : Contact ${prospectEmail || 'inconnu'}. Pas encore dans le CRM.`
  }

  const systemPrompt = `Tu es ${bizContext?.company_name ? `Louis Matar, Business Development chez ${bizContext.company_name}` : 'un commercial B2B'}.
Tu rediges une reponse a un email recu, en francais.

STYLE : ${bizContext?.tone_and_style || 'Professionnel mais humain. Messages courts.'}
${bizContext?.sales_method ? `METHODE : ${bizContext.sales_method}` : ''}

REGLES : vouvoiement, 5-8 lignes max, pas de "Belle journee", CTA clair, corps uniquement, signe "Louis".`

  let userPrompt = `${prospectContext}
${emailHistory ? `\nDERNIERS EMAILS :\n${emailHistory}` : ''}

EMAIL RECU de ${prospectEmail || '?'} :
${emailBody || '(vide)'}

`

  if (instruction) {
    userPrompt += `INSTRUCTION : "${instruction}". Redige un email pro qui exprime cette intention.`
  } else {
    userPrompt += `Redige une reponse adaptee.`
  }

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 800,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const reply = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('\n')

  const signature = bizContext?.email_signature || ''
  return { reply: signature ? reply + '\n\n' + signature : reply }
}
