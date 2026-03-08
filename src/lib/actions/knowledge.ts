'use server'

import { supabase } from '../supabase'
import type { Content } from '../types'

// ─── Knowledge Documents (upload local + legacy drive) ───

export async function getKnowledgeDocuments(): Promise<Array<{
  id: string
  name: string
  content: string
  folder_path: string | null
  mime_type: string | null
  source: string | null
  file_size: number | null
  summary: string | null
}>> {
  const { data, error } = await supabase
    .from('knowledge_documents')
    .select('id, name, content, folder_path, mime_type, source, file_size, summary')
    .order('name')
  if (error) return []
  return data || []
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
