'use server'

import { supabase } from '../supabase'
import { toLocalDateString } from '../utils'
import type { Integration, BusinessContext } from '../types'

// ─── Dashboard Stats ───

export async function getDashboardStats() {
  const { data: prospects } = await supabase
    .from('prospects')
    .select('pipeline_stage, categorie, source, statut_commercial')

  const all = prospects || []
  const total = all.length
  const clients = all.filter(p => p.pipeline_stage === 'client').length
  const discussions = all.filter(p =>
    ['devis', 'repondu', 'onboarding', 'a_recontacter'].includes(p.pipeline_stage) ||
    p.categorie === 'Client / Discussion active'
  ).length
  const replied = all.filter(p =>
    p.pipeline_stage === 'repondu' || p.categorie === 'A répondu'
  ).length
  const contacted = all.filter(p =>
    !['ciblage', 'refuse'].includes(p.pipeline_stage)
  ).length
  const tauxReponse = contacted > 0 ? Math.round((replied + discussions + clients) / contacted * 100) : 0

  const prospectsActifs = all.filter(p =>
    !['refuse', 'client'].includes(p.pipeline_stage)
  ).length
  const conversionRate = total > 0 ? Math.round(clients / total * 100) : 0

  const byStage: Record<string, number> = {}
  all.forEach(p => {
    byStage[p.pipeline_stage] = (byStage[p.pipeline_stage] || 0) + 1
  })

  const byCategorie: Record<string, number> = {}
  all.forEach(p => {
    const cat = p.categorie || 'Prospect'
    byCategorie[cat] = (byCategorie[cat] || 0) + 1
  })

  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const { data: activities } = await supabase
    .from('activities')
    .select('created_at')
    .gte('created_at', fourWeeksAgo.toISOString())

  const weeklyActivity: Record<string, number> = {}
  for (const a of activities || []) {
    const d = new Date(a.created_at)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d.setDate(diff))
    const key = toLocalDateString(monday)
    weeklyActivity[key] = (weeklyActivity[key] || 0) + 1
  }

  // Detect blockers — prospects stuck in non-terminal stages for too long
  const blockers: Array<{
    name: string
    stage: string
    days: number
    reason: string
  }> = []

  const { data: stuckProspects } = await supabase
    .from('prospects')
    .select('id, prenom, nom, entreprise, pipeline_stage, date_dernier_contact, updated_at')
    .not('pipeline_stage', 'in', '("ciblage","client","refuse")')
    .order('updated_at', { ascending: true })
    .limit(50)

  for (const p of stuckProspects || []) {
    const lastDate = p.date_dernier_contact || p.updated_at
    if (!lastDate) continue
    const days = Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
    if (days >= 14) {
      const name = [p.entreprise, [p.prenom, p.nom].filter(Boolean).join(' ')].filter(Boolean).join(' / ')
      blockers.push({
        name,
        stage: p.pipeline_stage,
        days,
        reason: days > 30 ? 'Aucune activite depuis plus d\'un mois' : 'Inactif depuis ' + days + ' jours',
      })
    }
  }

  return {
    total, clients, discussions, replied, tauxReponse,
    prospectsActifs, conversionRate,
    byStage, byCategorie, weeklyActivity,
    blockers: blockers.sort((a, b) => b.days - a.days).slice(0, 10),
  }
}

// ─── Integrations ───

export async function getIntegrations(): Promise<Integration[]> {
  const { data, error } = await supabase
    .from('integrations')
    .select('*')
    .order('service')
  if (error) throw new Error(error.message)
  return data || []
}

export async function updateIntegration(
  service: string,
  updates: Partial<Integration>
): Promise<Integration> {
  const { data, error } = await supabase
    .from('integrations')
    .update(updates)
    .eq('service', service)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ─── Business Context (for AI prompts) ───

export async function getBusinessContext(): Promise<BusinessContext | null> {
  const { data, error } = await supabase
    .from('business_context')
    .select('*')
    .limit(1)
    .single()
  if (error) return null
  return data
}

export async function updateBusinessContext(
  updates: Partial<BusinessContext>
): Promise<BusinessContext> {
  const existing = await getBusinessContext()
  if (existing) {
    const { data, error } = await supabase
      .from('business_context')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw new Error(error.message)
    return data
  }
  const { data, error } = await supabase
    .from('business_context')
    .insert(updates)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}
