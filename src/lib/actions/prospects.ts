'use server'

import { revalidatePath } from 'next/cache'
import { supabase } from '../supabase'
import { toLocalDateString } from '../utils'
import type { Prospect, PipelineStage } from '../types'

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
  revalidatePath('/prospects')
  revalidatePath('/pipeline')
  revalidatePath('/entreprises')
  revalidatePath('/')
  return data
}

export async function deleteProspect(id: string): Promise<void> {
  await supabase.from('activities').delete().eq('prospect_id', id)
  await supabase.from('emails').delete().eq('prospect_id', id)
  const { error } = await supabase.from('prospects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function batchDeleteProspects(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = []
  let deleted = 0

  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20)
    await supabase.from('activities').delete().in('prospect_id', batch)
    await supabase.from('emails').delete().in('prospect_id', batch)
    const { error } = await supabase.from('prospects').delete().in('id', batch)
    if (error) {
      errors.push(`Batch ${Math.floor(i / 20) + 1}: ${error.message}`)
    } else {
      deleted += batch.length
    }
  }

  return { deleted, errors }
}

// ─── Prospects summary (for AI general questions) ───

export async function getProspectsSummary(): Promise<
  Pick<
    Prospect,
    | 'id'
    | 'prenom'
    | 'nom'
    | 'entreprise'
    | 'fonction'
    | 'pipeline_stage'
    | 'categorie'
    | 'statut_commercial'
    | 'source'
    | 'date_dernier_contact'
    | 'date_prochaine_action'
    | 'type_prochaine_action'
    | 'date_premier_contact'
    | 'deal_group'
  >[]
> {
  const { data, error } = await supabase
    .from('prospects')
    .select(
      'id, prenom, nom, entreprise, fonction, pipeline_stage, categorie, statut_commercial, source, date_dernier_contact, date_prochaine_action, type_prochaine_action, date_premier_contact, deal_group'
    )
    .not('pipeline_stage', 'in', '("refuse")')
    .order('date_dernier_contact', { ascending: false })
  if (error) return []
  return data || []
}

// ─── Company Colleagues ───

export async function getCompanyColleagues(
  entreprise: string,
  excludeId: string
): Promise<Prospect[]> {
  if (!entreprise) return []
  const { normalizedDistance } = await import('@/lib/company-matching')
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .not('entreprise', 'is', null)
    .neq('id', excludeId)
    .order('date_dernier_contact', { ascending: false })
  if (error) return []
  return (data || []).filter(p =>
    p.entreprise && normalizedDistance(p.entreprise, entreprise) < 0.35
  )
}

// ─── Deal Groups ───

export async function getDealGroups(): Promise<string[]> {
  const { data } = await supabase
    .from('prospects')
    .select('deal_group')
    .not('deal_group', 'is', null)
    .neq('deal_group', '')
  const unique = [...new Set((data || []).map(d => d.deal_group).filter(Boolean))]
  return unique.sort()
}

export async function getDealGroupMembers(
  dealGroup: string,
  excludeId: string
): Promise<Prospect[]> {
  if (!dealGroup) return []
  const { data } = await supabase
    .from('prospects')
    .select('*')
    .eq('deal_group', dealGroup)
    .neq('id', excludeId)
    .order('date_dernier_contact', { ascending: false })
  return data || []
}

// ─── Companies (aggregated from prospects) ───

export interface CompanySummary {
  entreprise: string
  contacts: Pick<Prospect, 'id' | 'prenom' | 'nom' | 'fonction' | 'pipeline_stage' | 'email' | 'date_dernier_contact' | 'date_prochaine_action'>[]
  stages: string[]
  lastContact: string | null
}

export async function getCompanies(): Promise<CompanySummary[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('id, prenom, nom, entreprise, fonction, pipeline_stage, email, date_dernier_contact, date_prochaine_action')
    .not('pipeline_stage', 'in', '("refuse")')
    .order('date_dernier_contact', { ascending: false })

  if (error) throw new Error(error.message)
  const prospects = data || []

  const companyNames = prospects
    .map((p) => (p.entreprise || '').trim())
    .filter(Boolean)

  const { groupCompaniesFuzzy } = await import('@/lib/company-matching')
  const nameGroups = groupCompaniesFuzzy(companyNames)

  const variantToCanonical = new Map<string, string>()
  for (const [canonical, variants] of nameGroups) {
    for (const v of variants) {
      variantToCanonical.set(v, canonical)
    }
  }

  const byCompany: Record<string, CompanySummary> = {}
  for (const p of prospects) {
    const raw = (p.entreprise || '').trim()
    if (!raw) continue
    const key = variantToCanonical.get(raw) || raw

    if (!byCompany[key]) {
      byCompany[key] = {
        entreprise: key,
        contacts: [],
        stages: [],
        lastContact: null,
      }
    }

    byCompany[key].contacts.push(p)
    if (p.pipeline_stage && !byCompany[key].stages.includes(p.pipeline_stage)) {
      byCompany[key].stages.push(p.pipeline_stage)
    }
    if (p.date_dernier_contact) {
      if (!byCompany[key].lastContact || p.date_dernier_contact > byCompany[key].lastContact!) {
        byCompany[key].lastContact = p.date_dernier_contact
      }
    }
  }

  return Object.values(byCompany).sort((a, b) => {
    if (b.contacts.length !== a.contacts.length) return b.contacts.length - a.contacts.length
    if (b.lastContact && a.lastContact) return b.lastContact > a.lastContact ? 1 : -1
    return 0
  })
}

// ─── Bulk import ───

export async function bulkImportProspects(
  prospects: Partial<Prospect>[]
): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = []
  let inserted = 0

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

// ─── Prospects due for action today ───

export async function getActionsDuJour(): Promise<Prospect[]> {
  const today = toLocalDateString(new Date())
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .lte('date_prochaine_action', today)
    .not('pipeline_stage', 'in', '("client","refuse")')
    .order('date_prochaine_action')
  if (error) throw new Error(error.message)
  return data || []
}
