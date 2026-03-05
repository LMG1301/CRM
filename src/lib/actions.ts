'use server'

import { supabase } from './supabase'
import type { Prospect, Activity, PipelineStage } from './types'

// ─── Pipeline Stages ───

export async function getStages(): Promise<PipelineStage[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .order('position')
  if (error) throw new Error(error.message)
  return data || []
}

// ─── Prospects ───

export async function getProspects(filters?: {
  stage?: string
  categorie?: string
  source?: string
  search?: string
}): Promise<Prospect[]> {
  let query = supabase.from('prospects').select('*')

  if (filters?.stage) query = query.eq('pipeline_stage', filters.stage)
  if (filters?.categorie) query = query.eq('categorie', filters.categorie)
  if (filters?.source) query = query.ilike('source', `%${filters.source}%`)
  if (filters?.search) {
    query = query.or(
      `prenom.ilike.%${filters.search}%,nom.ilike.%${filters.search}%,entreprise.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
    )
  }

  const { data, error } = await query.order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getProspect(id: string): Promise<Prospect | null> {
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function updateProspect(
  id: string,
  updates: Partial<Prospect>
): Promise<Prospect> {
  const { data, error } = await supabase
    .from('prospects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function createProspect(
  prospect: Partial<Prospect>
): Promise<Prospect> {
  const { data, error } = await supabase
    .from('prospects')
    .insert(prospect)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteProspect(id: string): Promise<void> {
  const { error } = await supabase.from('prospects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Activities ───

export async function getActivities(prospectId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getRecentActivities(limit = 20): Promise<(Activity & { prospect?: Prospect })[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*, prospect:prospects(*)')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data || []
}

export async function createActivity(
  activity: Omit<Activity, 'id' | 'created_at'>
): Promise<Activity> {
  const { data, error } = await supabase
    .from('activities')
    .insert(activity)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ─── Dashboard Stats ───

export async function getDashboardStats() {
  const { data: prospects } = await supabase
    .from('prospects')
    .select('pipeline_stage, categorie, source, statut_commercial')

  const all = prospects || []
  const total = all.length
  const clients = all.filter(p => p.pipeline_stage === 'client').length
  const discussions = all.filter(p =>
    ['call_decouverte', 'devis', 'repondu'].includes(p.pipeline_stage) ||
    p.categorie === 'Client / Discussion active'
  ).length
  const replied = all.filter(p =>
    p.pipeline_stage === 'repondu' || p.categorie === 'A répondu'
  ).length
  const contacted = all.filter(p =>
    !['ciblage', 'bounced'].includes(p.pipeline_stage)
  ).length
  const tauxReponse = contacted > 0 ? Math.round((replied + discussions + clients) / contacted * 100) : 0

  // Count by stage
  const byStage: Record<string, number> = {}
  all.forEach(p => {
    byStage[p.pipeline_stage] = (byStage[p.pipeline_stage] || 0) + 1
  })

  // Count by source
  const bySource: Record<string, number> = {}
  all.forEach(p => {
    const src = p.source || 'Inconnu'
    bySource[src] = (bySource[src] || 0) + 1
  })

  // Count by categorie
  const byCategorie: Record<string, number> = {}
  all.forEach(p => {
    const cat = p.categorie || 'Prospect'
    byCategorie[cat] = (byCategorie[cat] || 0) + 1
  })

  return { total, clients, discussions, replied, tauxReponse, byStage, bySource, byCategorie }
}

// ─── Prospects due for action today ───

export async function getActionsDuJour(): Promise<Prospect[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .lte('date_prochaine_action', today)
    .not('pipeline_stage', 'in', '("client","refuse","bounced")')
    .order('date_prochaine_action')
  if (error) throw new Error(error.message)
  return data || []
}

// ─── Bulk import ───

export async function bulkImportProspects(
  prospects: Partial<Prospect>[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = []
  let inserted = 0

  // Insert in batches of 50
  for (let i = 0; i < prospects.length; i += 50) {
    const batch = prospects.slice(i, i + 50)
    const { data, error } = await supabase
      .from('prospects')
      .insert(batch)
      .select()
    if (error) {
      errors.push(`Batch ${i / 50 + 1}: ${error.message}`)
    } else {
      inserted += data?.length || 0
    }
  }

  return { inserted, errors }
}
