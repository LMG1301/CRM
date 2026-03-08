import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normalizedDistance } from '@/lib/company-matching'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const CRM_BASE_URL = process.env.NEXT_PUBLIC_CRM_URL || 'https://boost-crm-six.vercel.app'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token || token !== process.env.CRM_PASSWORD) {
      return NextResponse.json({ error: 'Non autorise' }, {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { searchParams } = new URL(req.url)
    const email = searchParams.get('email')
    const nom = searchParams.get('nom')
    const entreprise = searchParams.get('entreprise')

    if (!email && !nom) {
      return NextResponse.json(
        { error: 'Parametre email ou nom requis' },
        { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }

    let prospect = null

    // 1. Search by email (exact match on email and email_pro)
    if (email) {
      const { data } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise, fonction, email, email_pro, telephone, linkedin_url, pipeline_stage, date_dernier_contact, date_prochaine_action, type_prochaine_action, localisation')
        .or(`email.eq.${email},email_pro.eq.${email}`)
        .limit(1)
      if (data && data.length > 0) prospect = data[0]
    }

    // 2. Fallback: fuzzy match on nom + entreprise
    if (!prospect && nom && entreprise) {
      const { data: candidates } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise, fonction, email, email_pro, telephone, linkedin_url, pipeline_stage, date_dernier_contact, date_prochaine_action, type_prochaine_action, localisation')
        .ilike('nom', nom)

      if (candidates) {
        prospect = candidates.find(p =>
          p.entreprise && normalizedDistance(p.entreprise, entreprise) < 0.35
        ) || null
      }
    }

    if (!prospect) {
      return NextResponse.json({ found: false }, {
        headers: { 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Load last activity
    const { data: activities } = await supabase
      .from('activities')
      .select('type, content, created_at')
      .eq('prospect_id', prospect.id)
      .order('created_at', { ascending: false })
      .limit(1)

    return NextResponse.json({
      found: true,
      prospect: {
        id: prospect.id,
        prenom: prospect.prenom,
        nom: prospect.nom,
        entreprise: prospect.entreprise,
        fonction: prospect.fonction,
        email: prospect.email,
        email_pro: prospect.email_pro,
        telephone: prospect.telephone,
        linkedin_url: prospect.linkedin_url,
        pipeline_stage: prospect.pipeline_stage,
        localisation: prospect.localisation,
        date_dernier_contact: prospect.date_dernier_contact,
        date_prochaine_action: prospect.date_prochaine_action,
        type_prochaine_action: prospect.type_prochaine_action,
      },
      last_activity: activities?.[0] || null,
      crm_url: `${CRM_BASE_URL}/prospects/${prospect.id}`,
    }, {
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: message }, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}
