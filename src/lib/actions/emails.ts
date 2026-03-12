'use server'

import { supabase } from '../supabase'
import type { Prospect, Activity, Email } from '../types'

// ─── Activities ───

export async function getActivities(prospectId: string): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('prospect_id', prospectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  // Sort by activity_date (fallback created_at) — newest first
  const activities = data || []
  activities.sort((a, b) => {
    const dateA = a.activity_date || a.created_at
    const dateB = b.activity_date || b.created_at
    return new Date(dateB).getTime() - new Date(dateA).getTime()
  })
  return activities
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

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const thisWeek = all.filter(e => new Date(e.gmail_date) >= weekAgo).length

  return { total, sent, received, thisWeek }
}
