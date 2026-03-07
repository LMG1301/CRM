import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * API route for creating activities with large payloads (transcriptions).
 * Bypasses server action body size limits.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prospect_id, type, content, metadata } = body

    if (!prospect_id || !type || !content) {
      return Response.json({ error: 'Champs requis manquants' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('activities')
      .insert({ prospect_id, type, content, metadata: metadata || {} })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
