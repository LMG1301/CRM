'use server'

import { supabase } from '../supabase'
import type { Sequence, SequenceEnrollment } from '../types'

// ─── Sequences ───

export async function getSequences(): Promise<Sequence[]> {
  const { data, error } = await supabase
    .from('sequences')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return []
  return data || []
}

export async function getSequence(id: string): Promise<Sequence | null> {
  const { data, error } = await supabase
    .from('sequences')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data
}

export async function createSequence(
  seq: Omit<Sequence, 'id' | 'created_at' | 'updated_at'>
): Promise<Sequence> {
  const { data, error } = await supabase
    .from('sequences')
    .insert(seq)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateSequence(
  id: string,
  updates: Partial<Sequence>
): Promise<Sequence> {
  const { data, error } = await supabase
    .from('sequences')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteSequence(id: string): Promise<void> {
  await supabase.from('sequence_enrollments').delete().eq('sequence_id', id)
  const { error } = await supabase.from('sequences').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ─── Sequence Enrollments ───

export async function getEnrollmentsForProspect(
  prospectId: string
): Promise<SequenceEnrollment[]> {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('*, sequence:sequences(*)')
    .eq('prospect_id', prospectId)
    .order('enrolled_at', { ascending: false })
  if (error) return []
  return data || []
}

export async function getActiveEnrollments(): Promise<SequenceEnrollment[]> {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('*, sequence:sequences(*), prospect:prospects(*)')
    .eq('status', 'active')
    .order('next_step_date')
  if (error) return []
  return data || []
}

export async function getPendingReviewEmails(): Promise<SequenceEnrollment[]> {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('*, sequence:sequences(*), prospect:prospects(*)')
    .eq('status', 'active')
    .not('pending_email', 'is', null)
    .order('updated_at')
  if (error) return []
  return data || []
}
