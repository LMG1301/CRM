'use server'

import { supabase } from '../supabase'
import type { PipelineStage } from '../types'

export async function getPipelineStages(): Promise<PipelineStage[]> {
  const { data, error } = await supabase
    .from('pipeline_stages')
    .select('*')
    .order('position')
  if (error) throw new Error(error.message)
  return data || []
}

export async function getTerminalStageSlugs(): Promise<string[]> {
  const { data } = await supabase
    .from('pipeline_stages')
    .select('slug')
    .eq('is_terminal', true)
  return (data || []).map(s => s.slug)
}

export async function getDefaultStageSlug(): Promise<string> {
  const { data } = await supabase
    .from('pipeline_stages')
    .select('slug')
    .eq('is_default', true)
    .limit(1)
    .single()
  return data?.slug || 'ciblage'
}
