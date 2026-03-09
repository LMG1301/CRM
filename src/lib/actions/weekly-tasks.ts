'use server'

import { supabase } from '../supabase'
import type { WeeklyTask } from '../types'

// ─── Weekly Tasks CRUD ───

export async function getWeeklyTasks(weekStart: string): Promise<WeeklyTask[]> {
  const { data, error } = await supabase
    .from('weekly_tasks')
    .select('*, prospect:prospects(prenom, nom, entreprise)')
    .eq('week_start', weekStart)
    .order('category')
    .order('completed')
    .order('created_at')
  if (error) throw new Error(error.message)
  return data || []
}

export async function addWeeklyTask(task: {
  week_start: string
  category: string
  title: string
  prospect_id?: string | null
}): Promise<WeeklyTask> {
  const { data, error } = await supabase
    .from('weekly_tasks')
    .insert({
      week_start: task.week_start,
      category: task.category,
      title: task.title,
      prospect_id: task.prospect_id || null,
    })
    .select('*, prospect:prospects(prenom, nom, entreprise)')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function toggleWeeklyTask(taskId: string, completed: boolean): Promise<void> {
  const { error } = await supabase
    .from('weekly_tasks')
    .update({ completed, updated_at: new Date().toISOString() })
    .eq('id', taskId)
  if (error) throw new Error(error.message)
}

export async function deleteWeeklyTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('weekly_tasks')
    .delete()
    .eq('id', taskId)
  if (error) throw new Error(error.message)
}

export async function carryOverTasks(fromWeek: string, toWeek: string): Promise<number> {
  // Get incomplete tasks from the previous week
  const { data: incomplete } = await supabase
    .from('weekly_tasks')
    .select('category, title, prospect_id')
    .eq('week_start', fromWeek)
    .eq('completed', false)

  if (!incomplete || incomplete.length === 0) return 0

  // Insert them into the new week
  const { error } = await supabase
    .from('weekly_tasks')
    .insert(
      incomplete.map((t) => ({
        week_start: toWeek,
        category: t.category,
        title: t.title,
        prospect_id: t.prospect_id,
      }))
    )
  if (error) throw new Error(error.message)
  return incomplete.length
}
