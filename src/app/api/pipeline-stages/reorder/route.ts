import { supabase } from '@/lib/supabase'

export async function PUT(request: Request) {
  const { positions } = await request.json()
  if (!Array.isArray(positions)) {
    return Response.json({ error: 'positions array required' }, { status: 400 })
  }

  const results = await Promise.all(
    positions.map(({ id, position }: { id: string; position: number }) =>
      supabase
        .from('pipeline_stages')
        .update({ position })
        .eq('id', id)
    )
  )

  const error = results.find((r) => r.error)
  if (error?.error) {
    return Response.json({ error: error.error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
