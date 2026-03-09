'use server'

import { supabase } from '../supabase'
import type { WeeklyTask } from '../types'

// ─── Weekly Tasks CRUD ───

export async function getWeeklyTasks(weekStart: string): Promise<WeeklyTask[]> {
  // 1. Current week tasks (all — completed and not)
  const { data: currentWeek, error: err1 } = await supabase
    .from('weekly_tasks')
    .select('*, prospect:prospects(prenom, nom, entreprise)')
    .eq('week_start', weekStart)
    .order('category')
    .order('completed')
    .order('created_at')

  // 2. Uncompleted tasks from ALL previous weeks (auto carry-over)
  const { data: carriedOver, error: err2 } = await supabase
    .from('weekly_tasks')
    .select('*, prospect:prospects(prenom, nom, entreprise)')
    .lt('week_start', weekStart)
    .eq('completed', false)
    .order('week_start', { ascending: true })
    .order('category')

  if (err1) throw new Error(err1.message)
  if (err2) throw new Error(err2.message)

  // Merge: carried-over first (oldest first), then current week
  return [...(carriedOver || []), ...(currentWeek || [])]
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

