import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/chat-history?prospectId=xxx&limit=50
 * Load chat history for a prospect (or global if no prospectId).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const prospectId = searchParams.get('prospectId') || null
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200)

  let query = supabase
    .from('ai_chat_messages')
    .select('id, role, content, model, created_at')
    .order('created_at', { ascending: true })
    .limit(limit)

  if (prospectId) {
    query = query.eq('prospect_id', prospectId)
  } else {
    query = query.is('prospect_id', null)
  }

  const { data, error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ messages: data || [] })
}

/**
 * POST /api/ai/chat-history
 * Save a user+assistant message pair.
 * Body: { prospectId?, userMessage, assistantMessage, model? }
 */
export async function POST(request: NextRequest) {
  try {
    const { prospectId, userMessage, assistantMessage, model } = await request.json()

    if (!userMessage || !assistantMessage) {
      return Response.json({ error: 'userMessage and assistantMessage required' }, { status: 400 })
    }

    const rows = [
      {
        prospect_id: prospectId || null,
        role: 'user' as const,
        content: userMessage,
        model: null,
      },
      {
        prospect_id: prospectId || null,
        role: 'assistant' as const,
        content: assistantMessage,
        model: model || null,
      },
    ]

    const { error } = await supabase.from('ai_chat_messages').insert(rows)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Server error' },
      { status: 500 },
    )
  }
}

/**
 * DELETE /api/ai/chat-history?prospectId=xxx
 * Clear chat history for a prospect (or global if no prospectId).
 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const prospectId = searchParams.get('prospectId') || null

  let query = supabase.from('ai_chat_messages').delete()

  if (prospectId) {
    query = query.eq('prospect_id', prospectId)
  } else {
    query = query.is('prospect_id', null)
  }

  const { error } = await query

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
