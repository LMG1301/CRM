import { getProspects } from '@/lib/actions'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const prospects = await getProspects()
    return Response.json(prospects)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur'
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    // 1. Auth check
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')

    if (!token || token !== process.env.CRM_API_TOKEN) {
      return Response.json({ error: 'Token API invalide' }, { status: 401 })
    }

    // 2. Parse body
    const body = await request.json()
    const {
      entreprise,
      segment,
      region,
      activite,
      groupement,
      site_web,
      contact_nom,
      contact_fonction,
    } = body

    if (!entreprise) {
      return Response.json({ error: 'Le champ entreprise est requis' }, { status: 400 })
    }

    // 3. Check if entreprise already exists
    const { data: existing, error: lookupError } = await supabase
      .from('prospects')
      .select('id, entreprise')
      .ilike('entreprise', entreprise)
      .limit(1)

    if (lookupError) {
      return Response.json({ error: lookupError.message }, { status: 500 })
    }

    if (existing && existing.length > 0) {
      return Response.json(
        { error: 'Cette entreprise existe deja', existing: existing[0] },
        { status: 409 }
      )
    }

    // 4. Insert new prospect
    const { data: prospect, error: insertError } = await supabase
      .from('prospects')
      .insert({
        entreprise: entreprise.trim(),
        segment: segment || '',
        region: region || '',
        activite: activite || '',
        groupement: groupement || '',
        site_web: site_web || '',
        nom: contact_nom || '',
        fonction: contact_fonction || '',
        source: 'api',
        pipeline_stage: 'ciblage',
      })
      .select()
      .single()

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 })
    }

    return Response.json(prospect, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur'
    return Response.json({ error: message }, { status: 500 })
  }
}
