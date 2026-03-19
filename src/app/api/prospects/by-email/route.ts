import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const PROSPECT_FIELDS = 'id, prenom, nom, entreprise, fonction, pipeline_stage, email, email_pro, telephone, localisation, prochaine_action_desc, date_prochaine_action, type_prochaine_action'

const FREE_PROVIDERS = new Set([
  'gmail.com','yahoo.com','yahoo.fr','hotmail.com','hotmail.fr',
  'outlook.com','outlook.fr','live.com','live.fr','icloud.com',
  'orange.fr','free.fr','sfr.fr','wanadoo.fr','laposte.net',
  'protonmail.com','aol.com','msn.com','me.com','mail.com',
])

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function GET(request: NextRequest) {
  try {
  const email = request.nextUrl.searchParams.get('email')?.toLowerCase()?.trim() || undefined
  const name = request.nextUrl.searchParams.get('name')?.trim() || undefined
  const debug = request.nextUrl.searchParams.get('debug') === '1'

  if (!email && !name) {
    return Response.json({ found: false }, { headers: corsHeaders })
  }

  console.log('[by-email] search:', { email, name })

  const domain = email?.split('@')[1]?.toLowerCase() || ''
  const isFreeProvider = FREE_PROVIDERS.has(domain)
  const domainCompany = domain ? domain.split('.')[0] : ''

  let prospect = null
  let matchType = ''
  const debugLog: string[] = []

  // === Level 0: Name-only search (no email provided) ===
  if (!email && name) {
    const searchTerm = name.split(/\s*[-\u2013\u2014|]\s*/)[0].trim()

    // Search by entreprise
    const { data: byCompany } = await supabase
      .from('prospects')
      .select(PROSPECT_FIELDS)
      .ilike('entreprise', `%${searchTerm}%`)
      .limit(1)
    if (byCompany && byCompany.length > 0) {
      prospect = byCompany[0]
      matchType = 'name_only_company'
    }

    // Search by nom or prenom
    if (!prospect) {
      const { data: byName } = await supabase
        .from('prospects')
        .select(PROSPECT_FIELDS)
        .or(`nom.ilike.%${searchTerm}%,prenom.ilike.%${searchTerm}%`)
        .limit(1)
      if (byName && byName.length > 0) {
        prospect = byName[0]
        matchType = 'name_only_name'
      }
    }

    // If multi-word, try prenom + nom
    if (!prospect) {
      const parts = searchTerm.split(/\s+/).filter(p => p.length > 1)
      if (parts.length >= 2) {
        const { data } = await supabase
          .from('prospects')
          .select(PROSPECT_FIELDS)
          .ilike('prenom', `%${parts[0]}%`)
          .ilike('nom', `%${parts.slice(1).join(' ')}%`)
          .limit(1)
        if (data && data.length > 0) {
          prospect = data[0]
          matchType = 'name_only_fullname'
        }
      }
    }
  }

  // === Level 1: Exact email match (case insensitive) ===
  if (email) {
    // Try email field first, then email_pro (avoid .or() parsing issues)
    const { data: d1, error: e1 } = await supabase
      .from('prospects')
      .select(PROSPECT_FIELDS)
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (e1) console.log('[by-email] L1a error:', e1.message)
    if (d1) {
      prospect = d1
      matchType = 'email_exact'
    }
    if (!prospect) {
      const { data: d2, error: e2 } = await supabase
        .from('prospects')
        .select(PROSPECT_FIELDS)
        .ilike('email_pro', email)
        .limit(1)
        .maybeSingle()
      if (e2) console.log('[by-email] L1b error:', e2.message)
      if (d2) {
        prospect = d2
        matchType = 'email_pro_exact'
      }
    }
  }

  // === Level 2: Search in emails table (from_email / to_email) ===
  if (!prospect && email) {
    const { data: emailRecord } = await supabase
      .from('emails')
      .select('prospect_id')
      .or(`from_email.ilike.${email},to_email.ilike.${email}`)
      .not('prospect_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (emailRecord?.prospect_id) {
      const { data } = await supabase
        .from('prospects')
        .select(PROSPECT_FIELDS)
        .eq('id', emailRecord.prospect_id)
        .maybeSingle()
      if (data) {
        prospect = data
        matchType = 'emails_table'
      }
    }
  }

  // === Level 3: Same email domain (skip for free providers) ===
  if (!prospect && !isFreeProvider && domain) {
    const { data } = await supabase
      .from('prospects')
      .select(PROSPECT_FIELDS)
      .or(`email.ilike.%@${domain},email_pro.ilike.%@${domain}`)
      .limit(1)
      .maybeSingle()
    if (data) {
      prospect = data
      matchType = 'email_domain'
    }
  }

  // === Level 4: Match by sender name ===
  if (!prospect && name) {
    // Clean name: "Karine SCHROEDER - DAVANTAGE" → extract name part
    const cleanName = name.split(/\s*[-\u2013\u2014|]\s*/)[0].trim()
    const parts = cleanName.split(/\s+/).filter(p => p.length > 1)

    if (parts.length >= 2) {
      const first = parts[0]
      const last = parts.slice(1).join(' ')

      // Try prenom + nom
      const { data } = await supabase
        .from('prospects')
        .select(PROSPECT_FIELDS)
        .ilike('prenom', `%${first}%`)
        .ilike('nom', `%${last}%`)
        .limit(1)
        .maybeSingle()
      if (data) {
        prospect = data
        matchType = 'name'
      }

      // Try reversed
      if (!prospect) {
        const { data: reversed } = await supabase
          .from('prospects')
          .select(PROSPECT_FIELDS)
          .ilike('prenom', `%${last}%`)
          .ilike('nom', `%${first}%`)
          .limit(1)
          .maybeSingle()
        if (reversed) {
          prospect = reversed
          matchType = 'name_reversed'
        }
      }

      // Try just last name (broader)
      if (!prospect) {
        const { data: byLastName } = await supabase
          .from('prospects')
          .select(PROSPECT_FIELDS)
          .ilike('nom', `%${last}%`)
          .limit(5)
        if (byLastName && byLastName.length > 0) {
          // If only one match, use it; if multiple, try to match first name too
          if (byLastName.length === 1) {
            prospect = byLastName[0]
            matchType = 'name_last_only'
          } else {
            const match = byLastName.find(p =>
              p.prenom?.toLowerCase().includes(first.toLowerCase())
            )
            if (match) {
              prospect = match
              matchType = 'name_fuzzy'
            }
          }
        }
      }
    }
  }

  // === Level 5: Company from sender display name ===
  if (!prospect && name) {
    const nameParts = name.split(/\s*[-\u2013\u2014|]\s*/).map(p => p.trim())
    if (nameParts.length > 1) {
      const companyPart = nameParts[nameParts.length - 1]
      if (companyPart.length > 2) {
        const { data } = await supabase
          .from('prospects')
          .select(PROSPECT_FIELDS)
          .ilike('entreprise', `%${companyPart}%`)
          .limit(1)
          .maybeSingle()
        if (data) {
          prospect = data
          matchType = 'company_from_name'
        }
      }
    }
  }

  // === Level 6: Match by domain → company name ===
  if (!prospect && !isFreeProvider && domainCompany && domainCompany.length > 2) {
    const { data } = await supabase
      .from('prospects')
      .select(PROSPECT_FIELDS)
      .ilike('entreprise', `%${domainCompany}%`)
      .limit(1)
      .maybeSingle()
    if (data) {
      prospect = data
      matchType = 'company_domain'
    }
  }

  if (!prospect) {
    console.log('[by-email] not found, matchType:', matchType)
    return Response.json({ found: false, ...(debug ? { debug: debugLog } : {}) }, { headers: corsHeaders })
  }

  console.log('[by-email] found:', matchType, prospect.id)

  // Enrich with last note + pipeline label
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

  return Response.json({
    found: true,
    match_type: matchType,
    prospect: {
      ...prospect,
      pipeline_stage_label: stageResult.data?.label || prospect.pipeline_stage,
      derniere_note: noteResult.data?.content || null,
    },
    ...(debug ? { debug: debugLog } : {}),
  }, { headers: corsHeaders })

  } catch (error) {
    console.error('[by-email] ERROR:', error)
    return Response.json({ found: false, error: (error as Error).message }, { headers: corsHeaders })
  }
}
