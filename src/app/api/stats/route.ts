import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // ─── 1. Pipeline stages (for labels & ordering) ───
    const { data: pipeStages } = await supabase
      .from('pipeline_stages')
      .select('slug, name, color, position, is_terminal, is_default')
      .order('position')

    const stages = pipeStages || []
    const terminalSlugs = stages.filter(s => s.is_terminal).map(s => s.slug)

    // ─── 2. Current stock (snapshot) ───
    const { data: prospects } = await supabase
      .from('prospects')
      .select('pipeline_stage')

    const currentStock: Record<string, number> = {}
    for (const p of prospects || []) {
      currentStock[p.pipeline_stage] = (currentStock[p.pipeline_stage] || 0) + 1
    }

    // ─── 3. KPIs from stock ───
    const excludedFromActive = ['ciblage', ...terminalSlugs.filter(s => s !== 'client')]
    const pipelineActif = Object.entries(currentStock)
      .filter(([slug]) => !excludedFromActive.includes(slug))
      .reduce((sum, [, count]) => sum + count, 0)

    const enClosing = (currentStock['devis'] || 0) + (currentStock['closing'] || 0)
    const clients = currentStock['client'] || 0

    // ─── 4. Total machines ───
    let totalMachines = 0
    try {
      const { data: machines } = await supabase
        .from('client_machines')
        .select('quantity')

      totalMachines = (machines || []).reduce((s, m) => s + m.quantity, 0)
    } catch {
      // Table may not exist
    }

    return Response.json({
      pipelineActif,
      enClosing,
      clients,
      totalMachines,
      currentStock,
      stages: stages.map(s => ({
        slug: s.slug,
        name: s.name,
        color: s.color,
        position: s.position,
        is_terminal: s.is_terminal,
        is_default: s.is_default,
      })),
    })
  } catch (error) {
    console.error('Stats API error:', error)
    return Response.json(
      { error: (error as Error).message || 'Internal error' },
      { status: 500 }
    )
  }
}
