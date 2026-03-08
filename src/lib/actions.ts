'use server'

import { supabase } from './supabase'
import type { Prospect, Activity, PipelineStage, Email, Integration, BusinessContext, Content } from './types'

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
  // Delete related records first (FK constraints)
  await supabase.from('activities').delete().eq('prospect_id', id)
  await supabase.from('emails').delete().eq('prospect_id', id)
  const { error } = await supabase.from('prospects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function batchDeleteProspects(ids: string[]): Promise<{ deleted: number; errors: string[] }> {
  const errors: string[] = []
  let deleted = 0

  // Delete in batches of 20
  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20)
    // Delete activities first (FK constraint)
    await supabase.from('activities').delete().in('prospect_id', batch)
    // Delete emails linked to these prospects
    await supabase.from('emails').delete().in('prospect_id', batch)
    // Delete prospects
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
  >[]
> {
  const { data, error } = await supabase
    .from('prospects')
    .select(
      'id, prenom, nom, entreprise, fonction, pipeline_stage, categorie, statut_commercial, source, date_dernier_contact, date_prochaine_action, type_prochaine_action, date_premier_contact'
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

  // Collect all company names
  const companyNames = prospects
    .map((p) => (p.entreprise || '').trim())
    .filter(Boolean)

  // Fuzzy-group similar names (Beaufrost/Bofrost, Dallmayer/Dallmayr, etc.)
  const { groupCompaniesFuzzy } = await import('@/lib/company-matching')
  const nameGroups = groupCompaniesFuzzy(companyNames)

  // Build a lookup: variant name → canonical name
  const variantToCanonical = new Map<string, string>()
  for (const [canonical, variants] of nameGroups) {
    for (const v of variants) {
      variantToCanonical.set(v, canonical)
    }
  }

  // Group prospects by canonical company name
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
    // Sort by number of contacts desc, then by last contact
    if (b.contacts.length !== a.contacts.length) return b.contacts.length - a.contacts.length
    if (b.lastContact && a.lastContact) return b.lastContact > a.lastContact ? 1 : -1
    return 0
  })
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

export async function deleteActivity(id: string): Promise<void> {
  const { error } = await supabase.from('activities').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Emails (synced via n8n from Gmail) ───

export async function getProspectEmails(prospectId: string): Promise<Email[]> {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('gmail_date', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getRecentEmails(limit = 10): Promise<Email[]> {
  const { data, error } = await supabase
    .from('emails')
    .select('*')
    .order('gmail_date', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data || []
}

export async function getEmailStats() {
  const { data: emails } = await supabase
    .from('emails')
    .select('direction, gmail_date')

  const all = emails || []
  const total = all.length
  const sent = all.filter(e => e.direction === 'sent').length
  const received = all.filter(e => e.direction === 'received').length

  // Emails this week
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeek = all.filter(e => new Date(e.gmail_date) >= weekAgo).length

  return { total, sent, received, thisWeek }
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

// ─── Dashboard Stats ───

export async function getDashboardStats() {
  const { data: prospects } = await supabase
    .from('prospects')
    .select('pipeline_stage, categorie, source, statut_commercial')

  const all = prospects || []
  const total = all.length
  const clients = all.filter(p => p.pipeline_stage === 'client').length
  const discussions = all.filter(p =>
    ['devis', 'repondu'].includes(p.pipeline_stage) ||
    p.categorie === 'Client / Discussion active'
  ).length
  const replied = all.filter(p =>
    p.pipeline_stage === 'repondu' || p.categorie === 'A répondu'
  ).length
  const contacted = all.filter(p =>
    !['ciblage', 'refuse'].includes(p.pipeline_stage)
  ).length
  const tauxReponse = contacted > 0 ? Math.round((replied + discussions + clients) / contacted * 100) : 0

  // New business metrics
  const prospectsActifs = all.filter(p =>
    !['refuse', 'bounced', 'client'].includes(p.pipeline_stage)
  ).length
  const conversionRate = total > 0 ? Math.round(clients / total * 100) : 0

  // Count by stage
  const byStage: Record<string, number> = {}
  all.forEach(p => {
    byStage[p.pipeline_stage] = (byStage[p.pipeline_stage] || 0) + 1
  })

  // Count by categorie
  const byCategorie: Record<string, number> = {}
  all.forEach(p => {
    const cat = p.categorie || 'Prospect'
    byCategorie[cat] = (byCategorie[cat] || 0) + 1
  })

  // Weekly activity (last 4 weeks)
  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const { data: activities } = await supabase
    .from('activities')
    .select('created_at')
    .gte('created_at', fourWeeksAgo.toISOString())

  const weeklyActivity: Record<string, number> = {}
  for (const a of activities || []) {
    const d = new Date(a.created_at)
    // Get Monday of that week
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d.setDate(diff))
    const key = monday.toISOString().split('T')[0]
    weeklyActivity[key] = (weeklyActivity[key] || 0) + 1
  }

  return {
    total, clients, discussions, replied, tauxReponse,
    prospectsActifs, conversionRate,
    byStage, byCategorie, weeklyActivity,
  }
}

// ─── Prospects due for action today ───

export async function getActionsDuJour(): Promise<Prospect[]> {
  const today = new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .lte('date_prochaine_action', today)
    .not('pipeline_stage', 'in', '("client","refuse")')
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

// ─── Contents (LinkedIn posts, articles, etc.) ───

export async function getContents(filters?: {
  content_type?: string
  theme?: string
  search?: string
}): Promise<Content[]> {
  let query = supabase.from('contents').select('*')

  if (filters?.content_type) query = query.eq('content_type', filters.content_type)
  if (filters?.theme) query = query.contains('themes', [filters.theme])
  if (filters?.search) {
    query = query.or(`title.ilike.%${filters.search}%,body.ilike.%${filters.search}%`)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    // Table may not exist yet — return empty
    console.warn('getContents error:', error.message)
    return []
  }
  return data || []
}

export async function createContent(
  content: Omit<Content, 'id' | 'created_at' | 'updated_at'>
): Promise<Content> {
  const { data, error } = await supabase
    .from('contents')
    .insert(content)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateContent(
  id: string,
  updates: Partial<Content>
): Promise<Content> {
  const { data, error } = await supabase
    .from('contents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteContent(id: string): Promise<void> {
  const { error } = await supabase.from('contents').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Knowledge Documents (synced from Google Drive) ───

export async function getKnowledgeDocuments(): Promise<Array<{
  id: string
  name: string
  content: string
  folder_path: string | null
  mime_type: string | null
}>> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, name, content, folder_path, mime_type')
    .order('name')
  if (error) return []
  return data || []
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
  // Get existing row first
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
  // No row exists — insert
  const { data, error } = await supabase
    .from('business_context')
    .insert(updates)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}
