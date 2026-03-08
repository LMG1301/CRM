import { supabase } from '@/lib/supabase'

/**
 * Sequences API
 * GET  /api/sequences — list all sequences
 * POST /api/sequences — create a new sequence
 */

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('sequences')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      if (error.message.includes('sequences')) return Response.json([])
      throw error
    }
    return Response.json(data || [])
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description, steps } = body

    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      return Response.json({ error: 'name et steps (array non vide) requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('sequences')
      .insert({
        name,
        description: description || '',
        steps,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error
    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
