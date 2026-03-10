import { supabase } from '@/lib/supabase'

export async function PUT(request: Request) {
  const { stages } = await request.json()
  if (!Array.isArray(stages)) {
    return Response.json({ error: 'stages array required' }, { status: 400 })
  }

  for (const { id, position } of stages) {
    await supabase
      .from('pipeline_stages')
      .update({ position })
      .eq('id', id)
  }

  return Response.json({ ok: true })
}
