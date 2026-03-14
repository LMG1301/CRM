'use server'

import { supabase } from '../supabase'
import type { Company, Prospect } from '../types'

// ─── Get all companies with contact counts ───

export interface CompanyWithContacts extends Company {
  contacts: Pick<Prospect, 'id' | 'prenom' | 'nom' | 'fonction' | 'pipeline_stage' | 'email' | 'date_dernier_contact' | 'date_prochaine_action'>[]
  stages: string[]
  lastContact: string | null
}

export async function getCompaniesFromTable(): Promise<CompanyWithContacts[]> {
  const { data: companies, error: compError } = await supabase
    .from('companies')
    .select('*')
    .order('name')

  if (compError) throw new Error(compError.message)
  if (!companies || companies.length === 0) return []

  // Fetch prospects linked to companies
  const { data: prospects, error: prospError } = await supabase
    .from('prospects')
    .select('id, prenom, nom, fonction, pipeline_stage, email, date_dernier_contact, date_prochaine_action, company_id')
    .not('company_id', 'is', null)
    .not('pipeline_stage', 'in', '("refuse")')
    .order('date_dernier_contact', { ascending: false })

  if (prospError) throw new Error(prospError.message)

  const byCompany = new Map<string, CompanyWithContacts>()

  for (const company of companies) {
    byCompany.set(company.id, {
      ...company,
      contacts: [],
      stages: [],
      lastContact: null,
    })
  }

  for (const p of prospects || []) {
    const entry = byCompany.get(p.company_id)
    if (!entry) continue

    entry.contacts.push(p)

    if (p.pipeline_stage && !entry.stages.includes(p.pipeline_stage)) {
      entry.stages.push(p.pipeline_stage)
    }

    if (p.date_dernier_contact) {
      if (!entry.lastContact || p.date_dernier_contact > entry.lastContact) {
        entry.lastContact = p.date_dernier_contact
      }
    }
  }

  // Sort: most contacts first, then most recent contact
  return [...byCompany.values()].sort((a, b) => {
    if (b.contacts.length !== a.contacts.length) return b.contacts.length - a.contacts.length
    if (b.lastContact && a.lastContact) return b.lastContact > a.lastContact ? 1 : -1
    return 0
  })
}

// ─── Search companies (for autocomplete) ───

export async function searchCompanies(query: string): Promise<Company[]> {
  if (!query || query.trim().length < 1) return []

  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .ilike('name', `%${query.trim()}%`)
    .order('name')
    .limit(10)

  if (error) return []
  return data || []
}

// ─── Create company ───

export async function createCompany(
  name: string,
  extra?: { sector?: string; website?: string; location?: string }
): Promise<Company> {
  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: name.trim(),
      sector: extra?.sector || null,
      website: extra?.website || null,
      location: extra?.location || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ─── Get company by ID ───

export async function getCompany(id: string): Promise<Company | null> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return data
}

// ─── Update company ───

export async function updateCompany(
  id: string,
  updates: Partial<Omit<Company, 'id' | 'created_at'>>
): Promise<Company> {
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}
