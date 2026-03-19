import { supabase } from '@/lib/supabase'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: Request) {
  try {
    const { prospect_id, note } = await request.json()

    if (!prospect_id || !note?.trim()) {
      return Response.json({ error: 'prospect_id et note requis' }, { status: 400, headers: corsHeaders })
    }

    const { error } = await supabase.from('activities').insert({
      prospect_id,
      type: 'note',
      content: note.trim(),
      metadata: { source: 'gmail-extension' },
    })

    if (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders })
    }

    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500, headers: corsHeaders }
    )
  }
}
