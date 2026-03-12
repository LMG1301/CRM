import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * POST — Create activity (supports large payloads like transcriptions)
 * Resilient: if activity_date/updated_at columns don't exist yet, falls back to metadata-only.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prospect_id, type, content, metadata, activity_date } = body

    if (!prospect_id || !type || !content) {
      return Response.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    // Always store activity_date in metadata for backward compat
    const meta = { ...(metadata || {}) }
    if (activity_date) {
      meta.activity_date = activity_date
    }

    // Try with activity_date column first
    const insert: Record<string, unknown> = {
      prospect_id,
      type,
      content,
      metadata: meta,
    }

    if (activity_date) {
      insert.activity_date = activity_date
    }

    const { data, error } = await supabase
      .from('activities')
      .insert(insert)
      .select()
      .single()

    if (error) {
      // If column doesn't exist, retry without it
      if (error.message.includes('activity_date') || error.message.includes('updated_at')) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('activities')
          .insert({ prospect_id, type, content, metadata: meta })
          .select()
          .single()

        if (fallbackError) {
          return Response.json({ error: fallbackError.message }, { status: 500 })
        }
        return Response.json(fallbackData)
      }
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

/**
 * PATCH — Update activity content and/or date
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, content, activity_date } = body

    if (!id) {
      return Response.json({ error: 'id requis' }, { status: 400 })
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (typeof content === 'string') {
      update.content = content
    }

    if (typeof activity_date === 'string') {
      update.activity_date = activity_date || null
    }

    const { data, error } = await supabase
      .from('activities')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // Fallback: if columns don't exist, update only content + metadata
      if (error.message.includes('activity_date') || error.message.includes('updated_at')) {
        const fallbackUpdate: Record<string, unknown> = {}
        if (typeof content === 'string') {
          fallbackUpdate.content = content
        }
        // Store date in metadata as fallback
        if (typeof activity_date === 'string') {
          // First fetch current metadata
          const { data: current } = await supabase
            .from('activities')
            .select('metadata')
            .eq('id', id)
            .single()
          const meta = { ...((current?.metadata as Record<string, unknown>) || {}), activity_date: activity_date || null }
          fallbackUpdate.metadata = meta
        }

        if (Object.keys(fallbackUpdate).length > 0) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('activities')
            .update(fallbackUpdate)
            .eq('id', id)
            .select()
            .single()

          if (fallbackError) {
            return Response.json({ error: fallbackError.message }, { status: 500 })
          }
          return Response.json(fallbackData)
        }
      }
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
