'use server'

import { supabase } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'

export async function searchProspect(query: string) {
  if (!query.trim()) return { found: false as const }

  const isEmail = query.includes('@')
  const term = query.trim().toLowerCase()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prospect: any = null

  if (isEmail) {
    const { data: d1 } = await supabase.from('prospects').select('*').ilike('email', term).limit(1)
    prospect = d1?.[0] || null

    if (!prospect) {
      const { data: d2 } = await supabase.from('prospects').select('*').ilike('email_pro', term).limit(1)
      prospect = d2?.[0] || null
    }

    if (!prospect) {
      const { data: emailRec } = await supabase.from('emails').select('prospect_id')
        .or(`from_email.ilike.${term},to_email.ilike.${term}`)
        .not('prospect_id', 'is', null).limit(1)
      if (emailRec?.[0]?.prospect_id) {
        const { data } = await supabase.from('prospects').select('*').eq('id', emailRec[0].prospect_id).limit(1)
        prospect = data?.[0] || null
      }
    }
  } else {
    // Company
    const { data: d1 } = await supabase.from('prospects').select('*').ilike('entreprise', `%${term}%`).limit(1)
    prospect = d1?.[0] || null

    // Name
    if (!prospect) {
      const { data: d2 } = await supabase.from('prospects').select('*')
        .or(`nom.ilike.%${term}%,prenom.ilike.%${term}%`).limit(1)
      prospect = d2?.[0] || null
    }

    // Multi-word
    if (!prospect) {
      const parts = term.split(/\s+/).filter(p => p.length > 1)
      if (parts.length >= 2) {
        const { data } = await supabase.from('prospects').select('*')
          .ilike('prenom', `%${parts[0]}%`).ilike('nom', `%${parts.slice(1).join(' ')}%`).limit(1)
        prospect = data?.[0] || null
      }
    }
  }

  if (!prospect) return { found: false as const }

  // Enrich
  const { data: noteData } = await supabase.from('activities').select('content')
    .eq('prospect_id', prospect.id).in('type', ['note', 'transcription', 'call_log'])
    .order('created_at', { ascending: false }).limit(1)

  const { data: stageData } = await supabase.from('pipeline_stages').select('label')
    .eq('name', prospect.pipeline_stage).limit(1)

  return {
    found: true as const,
    prospect: {
      id: prospect.id,
      prenom: prospect.prenom,
      nom: prospect.nom,
      entreprise: prospect.entreprise,
      email: prospect.email,
      email_pro: prospect.email_pro,
      fonction: prospect.fonction,
      pipeline_stage: prospect.pipeline_stage,
      pipeline_stage_label: stageData?.[0]?.label || prospect.pipeline_stage,
      derniere_note: noteData?.[0]?.content || null,
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
  const { data: ctxData } = await supabase.from('business_context')
    .select('company_name, tone_and_style, sales_methodology, email_templates, products').limit(1)
  const biz = ctxData?.[0] || null

  const anthropic = getAnthropicClient()
  const modelId = model || 'claude-haiku-4-5-20251001'

  let prospectContext = ''
  let formalityInstruction = ''

  if (prospectId) {
    const { data: pData } = await supabase.from('prospects')
      .select('prenom, nom, entreprise, pipeline_stage, fonction, notes')
      .eq('id', prospectId).limit(1)
    const p = pData?.[0]

    if (p) {
      const { data: noteData } = await supabase.from('activities').select('content')
        .eq('prospect_id', prospectId).in('type', ['note', 'transcription', 'call_log'])
        .order('created_at', { ascending: false }).limit(1)

      const { data: recentEmails } = await supabase.from('emails')
        .select('subject, gmail_date, direction')
        .eq('prospect_id', prospectId).order('gmail_date', { ascending: false }).limit(5)

      const { data: forecastData } = await supabase.from('prospect_forecasts')
        .select('product_type, quantity, probability, expected_month')
        .eq('prospect_id', prospectId).limit(3)

      prospectContext = `CONTEXTE DU PROSPECT :
- Nom : ${p.prenom} ${p.nom}
- Entreprise : ${p.entreprise || 'inconnue'}
- Fonction : ${p.fonction || 'inconnue'}
- Etape : ${p.pipeline_stage}
- Note : ${noteData?.[0]?.content?.substring(0, 300) || 'aucune'}
${forecastData?.length ? `- Forecast : ${forecastData.map(f => `${f.product_type} x${f.quantity} (${f.probability}%)`).join(', ')}` : ''}
${recentEmails?.length ? `\nDERNIERS ECHANGES :\n${recentEmails.map(e => `${e.gmail_date?.split('T')[0] || '?'} ${e.direction === 'sent' ? '\u2192' : '\u2190'} ${e.subject}`).join('\n')}` : ''}`

      // Auto-detect tutoiement
      const { data: sentEmails } = await supabase.from('emails').select('body_preview')
        .eq('prospect_id', prospectId).eq('direction', 'sent')
        .order('gmail_date', { ascending: false }).limit(3)
      const sentText = sentEmails?.map(e => e.body_preview || '').join(' ') || ''
      if (/\b(tu |t'|ton |ta |tes |toi)\b/i.test(sentText)) {
        formalityInstruction = 'IMPORTANT : Relation en TUTOIEMENT. Continue a tutoyer.'
      }
    }
  }

  if (!prospectContext) {
    prospectContext = `Contact : ${prospectEmail || 'inconnu'}. Pas dans le CRM.`
  }

  const systemPrompt = `Tu es Louis Matar, Business Development chez ${biz?.company_name || 'Boost Inc'}.

METHODE : ${(biz?.sales_methodology || '').substring(0, 400)}
STYLE : ${(biz?.tone_and_style || 'Professionnel, court, humain.').substring(0, 300)}
EXEMPLES : ${(biz?.email_templates || '').substring(0, 800)}
${formalityInstruction}

REGLES : ${formalityInstruction.includes('TUTOIEMENT') ? 'tutoiement' : 'vouvoiement'}, 5-8 lignes, pas de "Belle journee", CTA clair, corps uniquement, signe "Louis".`

  let userPrompt = `${prospectContext}\n\nEMAIL RECU de ${prospectEmail || '?'} :\n${(emailBody || '').substring(0, 1500)}\n\n`
  if (instruction) {
    userPrompt += `INSTRUCTION : "${instruction}". Redige un email pro.`
  } else {
    userPrompt += 'Redige une reponse adaptee.'
  }

  const response = await anthropic.messages.create({
    model: modelId,
    max_tokens: 800,
    system: systemPrompt.substring(0, 2500),
    messages: [{ role: 'user', content: userPrompt }],
  })

  const reply = response.content
    .filter(b => b.type === 'text')
    .map(b => (b as { type: 'text'; text: string }).text)
    .join('\n')

  return { reply }
}
