import { supabase } from '@/lib/supabase'
import { toLocalDateString } from '@/lib/utils'

/**
 * Tasks API — CRUD for follow-up tasks
 *
 * GET  /api/tasks?prospect_id=xxx  — list tasks for a prospect
 * GET  /api/tasks?due=today        — list tasks due today or overdue
 * POST /api/tasks                  — create a new task
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const prospectId = searchParams.get('prospect_id')
  const due = searchParams.get('due')

  try {
    if (prospectId) {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('prospect_id', prospectId)
        .eq('status', 'pending')
        .order('due_date')

      if (error) throw error
      return Response.json(data || [])
    }

    if (due === 'today') {
      const today = toLocalDateString(new Date())
      const { data, error } = await supabase
        .from('tasks')
        .select('*, prospect:prospects(prenom, nom, entreprise)')
        .eq('status', 'pending')
        .lte('due_date', `${today}T23:59:59`)
        .order('due_date')

      if (error) throw error
      return Response.json(data || [])
    }

    // Default: all pending tasks
    const { data, error } = await supabase
      .from('tasks')
      .select('*, prospect:prospects(prenom, nom, entreprise)')
      .eq('status', 'pending')
      .order('due_date')

    if (error) throw error
    return Response.json(data || [])
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { prospect_id, title, description, due_date, type, related_activity_id } = body

    if (!prospect_id || !title || !due_date) {
      return Response.json({ error: 'prospect_id, title, due_date requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        prospect_id,
        title,
        description: description || null,
        due_date,
        type: type || 'follow_up',
        related_activity_id: related_activity_id || null,
      })
      .select()
      .single()

    if (error) throw error
    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const { id, status } = body

    if (!id || !status) {
      return Response.json({ error: 'id et status requis' }, { status: 400 })
    }

    const updates: Record<string, unknown> = { status }
    if (status === 'done') {
      updates.completed_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
