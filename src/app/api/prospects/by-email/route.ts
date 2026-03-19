import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email')?.toLowerCase()?.trim() || ''
    const name = request.nextUrl.searchParams.get('name')?.trim() || ''

    if (!email && !name) {
      return Response.json({ found: false }, { headers: corsHeaders })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prospect: any = null
    let matchType = ''

    // === Level 1: Exact email match ===
    if (email) {
      const { data } = await supabase
        .from('prospects').select('*')
        .ilike('email', email).limit(1)
      prospect = data?.[0] || null
      if (prospect) matchType = 'email_exact'
    }

    // === Level 1b: email_pro match ===
    if (!prospect && email) {
      const { data } = await supabase
        .from('prospects').select('*')
        .ilike('email_pro', email).limit(1)
      prospect = data?.[0] || null
      if (prospect) matchType = 'email_pro_exact'
    }

    // === Level 2: emails table ===
    if (!prospect && email) {
      const { data } = await supabase
        .from('emails').select('prospect_id')
        .or(`from_email.ilike.${email},to_email.ilike.${email}`)
        .not('prospect_id', 'is', null).limit(1)
      if (data?.[0]?.prospect_id) {
        const { data: p } = await supabase
          .from('prospects').select('*')
          .eq('id', data[0].prospect_id).limit(1)
        prospect = p?.[0] || null
        if (prospect) matchType = 'emails_table'
      }
    }

    // === Level 3: Same email domain ===
    if (!prospect && email) {
      const domain = email.split('@')[1]
      const skip = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'orange.fr', 'free.fr', 'sfr.fr', 'live.com', 'icloud.com', 'wanadoo.fr', 'laposte.net', 'protonmail.com']
      if (domain && !skip.includes(domain)) {
        const { data } = await supabase
          .from('prospects').select('*')
          .ilike('email', `%@${domain}`).limit(1)
        if (!data?.[0]) {
          const { data: d2 } = await supabase
            .from('prospects').select('*')
            .ilike('email_pro', `%@${domain}`).limit(1)
          prospect = d2?.[0] || null
        } else {
          prospect = data[0]
        }
        if (prospect) matchType = 'email_domain'
      }
    }

    // === Level 4: Search by name ===
    if (!prospect && name) {
      const words = name.replace(/[^a-zA-Z\u00C0-\u00FF\s]/g, '').split(/\s+/).filter(w => w.length > 2)
      for (const word of words) {
        const { data } = await supabase
          .from('prospects').select('*')
          .or(`nom.ilike.%${word}%,prenom.ilike.%${word}%`)
          .limit(5)
        if (data?.length === 1) {
          prospect = data[0]
          matchType = 'name_single'
          break
        }
        if (data && data.length > 1) {
          const other = words.find(w => w !== word)
          if (other) {
            const match = data.find(p =>
              p.nom?.toLowerCase().includes(other.toLowerCase()) ||
              p.prenom?.toLowerCase().includes(other.toLowerCase()) ||
              p.entreprise?.toLowerCase().includes(other.toLowerCase())
            )
            if (match) {
              prospect = match
              matchType = 'name_refined'
              break
            }
          }
        }
      }
    }

    // === Level 5: Company from display name ===
    if (!prospect && name) {
      const parts = name.split(/[-\u2013|,]/).map(p => p.trim()).filter(p => p.length > 2)
      for (const part of parts) {
        const { data } = await supabase
          .from('prospects').select('*')
          .ilike('entreprise', `%${part}%`).limit(1)
        if (data?.[0]) {
          prospect = data[0]
          matchType = 'company_from_name'
          break
        }
      }
    }

    // === Level 6: Domain → company ===
    if (!prospect && email) {
      const domainName = email.split('@')[1]?.split('.')[0]
      if (domainName && domainName.length > 2) {
        const { data } = await supabase
          .from('prospects').select('*')
          .ilike('entreprise', `%${domainName}%`).limit(1)
        prospect = data?.[0] || null
        if (prospect) matchType = 'company_domain'
      }
    }

    // === Level 0: Name-only search (enterprise + name) ===
    if (!prospect && !email && name) {
      const { data: d1 } = await supabase
        .from('prospects').select('*')
        .ilike('entreprise', `%${name}%`).limit(1)
      prospect = d1?.[0] || null
      if (prospect) matchType = 'name_only_company'
    }

    if (!prospect) {
      return Response.json({ found: false }, { headers: corsHeaders })
    }

    // Enrich: last note
    const { data: noteData } = await supabase
      .from('activities').select('content')
      .eq('prospect_id', prospect.id)
      .in('type', ['note', 'transcription', 'call_log'])
      .order('created_at', { ascending: false })
      .limit(1)

    // Enrich: stage label
    const { data: stageData } = await supabase
      .from('pipeline_stages').select('label')
      .eq('name', prospect.pipeline_stage)
      .limit(1)

    return Response.json({
      found: true,
      match_type: matchType,
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
        description_prochaine_action: prospect.description_prochaine_action,
        derniere_note: noteData?.[0]?.content?.substring(0, 300) || null,
      }
    }, { headers: corsHeaders })
  } catch (error) {
    console.error('[by-email] ERROR:', error)
    return Response.json({ found: false, error: (error as Error).message }, { headers: corsHeaders })
  }
}
