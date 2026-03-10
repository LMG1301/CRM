import { supabase } from '@/lib/supabase'

export async function GET() {
  // Fetch all stages
  const { data: stages, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .order('position')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Count prospects per stage
  const { data: prospects } = await supabase
    .from('prospects')
    .select('pipeline_stage')

  const counts: Record<string, number> = {}
  for (const p of prospects || []) {
    counts[p.pipeline_stage] = (counts[p.pipeline_stage] || 0) + 1
  }

  const result = (stages || []).map(s => ({
    ...s,
    prospect_count: counts[s.slug] || 0,
  }))

  return Response.json(result)
}

export async function POST(request: Request) {
  const { name, color } = await request.json()
  if (!name?.trim()) return Response.json({ error: 'Name required' }, { status: 400 })

  // Generate slug
  const slug = name.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')

  // Check uniqueness
  const { data: existing } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('slug', slug)
    .limit(1)
  if (existing && existing.length > 0) {
    return Response.json({ error: 'Une étape avec ce nom existe déjà' }, { status: 409 })
  }

  // Find position: insert before the first terminal stage
  const { data: allStages } = await supabase
    .from('pipeline_stages')
    .select('id, position, is_terminal')
    .order('position')

  let newPosition = (allStages || []).length + 1
  const terminalStages = (allStages || []).filter(s => s.is_terminal)
  if (terminalStages.length > 0) {
    newPosition = Math.min(...terminalStages.map(s => s.position))
    // Shift terminal stages down by 1
    for (const ts of (allStages || []).filter(s => s.position >= newPosition)) {
      await supabase
        .from('pipeline_stages')
        .update({ position: ts.position + 1 })
        .eq('id', ts.id)
    }
  }

  const { data, error } = await supabase
    .from('pipeline_stages')
    .insert({
      name: name.trim(),
      slug,
      color: color || '#6b7280',
      position: newPosition,
      is_terminal: false,
      is_default: false,
      is_deletable: true,
    })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
