import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * LinkedIn enrichment endpoint for prospects.
 *
 * POST: Save LinkedIn data for a prospect (called from AI assistant or manual input)
 * GET: Retrieve stored LinkedIn data for a prospect
 *
 * This stores LinkedIn profile data, posts, and activity in the prospect's metadata
 * and creates linkedin_interaction activities.
 */

interface LinkedInData {
  linkedin_url?: string
  headline?: string
  current_position?: string
  company?: string
  location?: string
  summary?: string
  recent_posts?: Array<{
    text: string
    date: string
    engagement?: string
  }>
  experience?: Array<{
    title: string
    company: string
    period: string
  }>
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const secret = request.headers.get('x-webhook-secret')
    if (secret !== process.env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body: LinkedInData = await request.json()

    // Update prospect with LinkedIn data
    const updates: Record<string, unknown> = {}

    if (body.linkedin_url) {
      updates.linkedin_url = body.linkedin_url
    }

    if (body.current_position) {
      updates.fonction = body.current_position
    }

    if (body.company) {
      updates.entreprise = body.company
    }

    if (body.location) {
      updates.localisation = body.location
    }

    // Update prospect fields
    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('prospects')
        .update(updates)
        .eq('id', id)

      if (error) {
        return Response.json({ error: error.message }, { status: 500 })
      }
    }

    // Store full LinkedIn data as activity
    const contentParts: string[] = ['Profil LinkedIn mis a jour']
    if (body.headline) contentParts.push(`Titre: ${body.headline}`)
    if (body.current_position && body.company) {
      contentParts.push(`Poste: ${body.current_position} chez ${body.company}`)
    }
    if (body.recent_posts && body.recent_posts.length > 0) {
      contentParts.push(`${body.recent_posts.length} post(s) recent(s) recupere(s)`)
    }

    await supabase.from('activities').insert({
      prospect_id: id,
      type: 'linkedin_interaction',
      content: contentParts.join('\n'),
      metadata: {
        source: 'linkedin_enrichment',
        linkedin_data: body,
      },
    })

    // Also store LinkedIn insights in knowledge_documents for AI context
    if (body.summary || (body.recent_posts && body.recent_posts.length > 0)) {
      const { data: prospect } = await supabase
        .from('prospects')
        .select('prenom, nom, entreprise')
        .eq('id', id)
        .single()

      if (prospect) {
        const docParts: string[] = []
        docParts.push(`# LinkedIn: ${prospect.prenom} ${prospect.nom}`)
        if (prospect.entreprise) docParts.push(`Entreprise: ${prospect.entreprise}`)
        if (body.headline) docParts.push(`Titre: ${body.headline}`)
        if (body.summary) docParts.push(`\n## A propos\n${body.summary}`)

        if (body.experience && body.experience.length > 0) {
          docParts.push('\n## Experience')
          body.experience.forEach((exp) => {
            docParts.push(`- ${exp.title} chez ${exp.company} (${exp.period})`)
          })
        }

        if (body.recent_posts && body.recent_posts.length > 0) {
          docParts.push('\n## Posts recents')
          body.recent_posts.forEach((post) => {
            docParts.push(`- [${post.date}] ${post.text.substring(0, 300)}`)
          })
        }

        await supabase.from('knowledge_documents').upsert(
          {
            drive_file_id: `linkedin_${id}`,
            name: `LinkedIn: ${prospect.prenom} ${prospect.nom}`,
            mime_type: 'text/linkedin-profile',
            folder_path: 'LinkedIn Profiles',
            content: docParts.join('\n'),
            url: body.linkedin_url || null,
            last_modified: new Date().toISOString(),
            synced_at: new Date().toISOString(),
          },
          { onConflict: 'drive_file_id' }
        )
      }
    }

    return Response.json({ success: true, fields_updated: Object.keys(updates) })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get the latest LinkedIn activity for this prospect
    const { data } = await supabase
      .from('activities')
      .select('metadata, created_at')
      .eq('prospect_id', id)
      .eq('type', 'linkedin_interaction')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!data) {
      return Response.json({ linkedin_data: null })
    }

    return Response.json({
      linkedin_data: data.metadata?.linkedin_data || null,
      last_updated: data.created_at,
    })
  } catch {
    return Response.json({ linkedin_data: null })
  }
}
