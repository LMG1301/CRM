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
  const email = request.nextUrl.searchParams.get('email')
  if (!email) {
    return Response.json({ found: false }, { headers: corsHeaders })
  }

  // Search by exact email
  let { data: prospect } = await supabase
    .from('prospects')
    .select('id, prenom, nom, entreprise, fonction, pipeline_stage, email, email_pro, telephone, localisation, prochaine_action_desc, date_prochaine_action, type_prochaine_action')
    .or(`email.eq.${email},email_pro.eq.${email}`)
    .limit(1)
    .single()

  // Fallback: search by email domain (for company-wide matching)
  if (!prospect) {
    const domain = email.split('@')[1]
    if (domain) {
      const freeProviders = ['gmail.com','yahoo.com','yahoo.fr','hotmail.com','hotmail.fr','outlook.com','outlook.fr','live.com','live.fr','icloud.com','orange.fr','free.fr','sfr.fr','wanadoo.fr','laposte.net','protonmail.com','aol.com','msn.com','me.com','mail.com']
      if (!freeProviders.includes(domain.toLowerCase())) {
        const { data } = await supabase
          .from('prospects')
          .select('id, prenom, nom, entreprise, fonction, pipeline_stage, email, email_pro, telephone, localisation, prochaine_action_desc, date_prochaine_action, type_prochaine_action')
          .or(`email.ilike.%@${domain},email_pro.ilike.%@${domain}`)
          .limit(1)
          .single()
        prospect = data
      }
    }
  }

  if (!prospect) {
    return Response.json({ found: false }, { headers: corsHeaders })
  }

  // Get last note/activity
  const { data: lastNote } = await supabase
    .from('activities')
    .select('content')
    .eq('prospect_id', prospect.id)
    .in('type', ['note', 'transcription', 'call_log'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Get pipeline stage label
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('label')
    .eq('name', prospect.pipeline_stage)
    .single()

  return Response.json({
    found: true,
    prospect: {
      ...prospect,
      pipeline_stage_label: stage?.label || prospect.pipeline_stage,
      derniere_note: lastNote?.content || null,
    },
  }, { headers: corsHeaders })
}
