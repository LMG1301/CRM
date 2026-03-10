import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { normalizedDistance } from '@/lib/company-matching'

const CRM_BASE_URL = process.env.NEXT_PUBLIC_CRM_URL || 'https://boost-crm-six.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // Validate with CRM password
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '')
    if (!token || token !== process.env.CRM_PASSWORD) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401, headers: corsHeaders })
    }

    const body = await req.json()
    const { prenom, nom, entreprise, email, email_pro, telephone, fonction, linkedin_url, site_web, source, localisation, pays } = body

    if (!nom && !entreprise && !email) {
      return NextResponse.json(
        { error: 'Au moins un champ requis: nom, entreprise ou email' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Check for existing prospect by email or LinkedIn URL
    let existing = null
    if (email) {
      const { data } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .or(`email.eq.${email},email_pro.eq.${email}`)
        .limit(1)
      if (data && data.length > 0) existing = data[0]
    }
    if (!existing && email_pro) {
      const { data } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .or(`email.eq.${email_pro},email_pro.eq.${email_pro}`)
        .limit(1)
      if (data && data.length > 0) existing = data[0]
    }
    if (!existing && linkedin_url) {
      const { data } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .eq('linkedin_url', linkedin_url)
        .limit(1)
      if (data && data.length > 0) existing = data[0]
    }
    // Fuzzy match on nom + entreprise
    if (!existing && nom && entreprise) {
      const { data: candidates } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .ilike('nom', nom)
      if (candidates) {
        existing = candidates.find(p =>
          p.entreprise && normalizedDistance(p.entreprise, entreprise) < 0.35
        ) || null
      }
    }

    if (existing) {
      return NextResponse.json({
        status: 'duplicate',
        message: `Prospect existant: ${existing.prenom || ''} ${existing.nom || ''} (${existing.entreprise || ''})`.trim(),
        prospect_id: existing.id,
        crm_url: `${CRM_BASE_URL}/prospects/${existing.id}`,
      }, { headers: corsHeaders })
    }

    // Create the prospect
    const validStages = ['ciblage', 'touch_1', 'repondu', 'devis', 'onboarding', 'client', 'a_recontacter', 'refuse']
    const prospect: Record<string, string> = {
      pipeline_stage: body.pipeline_stage && validStages.includes(body.pipeline_stage) ? body.pipeline_stage : 'ciblage',
    }
    if (prenom) prospect.prenom = prenom
    if (nom) prospect.nom = nom
    if (entreprise) prospect.entreprise = entreprise
    if (email) prospect.email = email
    if (email_pro) prospect.email_pro = email_pro
    if (telephone) prospect.telephone = telephone
    if (fonction) prospect.fonction = fonction
    if (linkedin_url) prospect.linkedin_url = linkedin_url
    if (site_web) prospect.site_web = site_web
    if (source) prospect.source = source
    if (localisation) prospect.localisation = localisation
    if (pays) prospect.pays = pays

    const { data, error } = await supabase
      .from('prospects')
      .insert(prospect)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }

    return NextResponse.json({
      status: 'created',
      message: `Prospect cree: ${data.prenom || ''} ${data.nom || ''} (${data.entreprise || ''})`.trim(),
      prospect_id: data.id,
      crm_url: `${CRM_BASE_URL}/prospects/${data.id}`,
    }, { headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur serveur'
    return NextResponse.json({ error: message }, { status: 500, headers: corsHeaders })
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
