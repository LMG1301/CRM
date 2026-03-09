'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { WeeklyTask, WeeklyTaskCategory } from '@/lib/types'
import { WEEKLY_TASK_CATEGORY_LABELS, WEEKLY_TASK_CATEGORY_ICONS } from '@/lib/types'
import {
  getWeeklyTasks,
  addWeeklyTask,
  toggleWeeklyTask,
  deleteWeeklyTask,
} from '@/lib/actions'

// ─── Helpers ───

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatWeekStart(date: Date): string {
  return date.toISOString().split('T')[0]
}

function formatWeekLabel(date: Date): string {
  const end = new Date(date)
  end.setDate(end.getDate() + 4) // Friday
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  return `${date.toLocaleDateString('fr-FR', opts)} - ${end.toLocaleDateString('fr-FR', opts)}`
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Returns how many weeks a task has been carried over (0 = current week) */
function getCarryOverWeeks(taskWeekStart: string, displayedWeekStart: string): number {
  const taskDate = new Date(taskWeekStart + 'T00:00:00')
  const displayDate = new Date(displayedWeekStart + 'T00:00:00')
  const diffMs = displayDate.getTime() - taskDate.getTime()
  return Math.round(diffMs / (7 * 24 * 60 * 60 * 1000))
}

const CATEGORIES: WeeklyTaskCategory[] = ['key_priority', 'follow_up', 'meeting', 'onboarding', 'task']

// ─── Component ───

export function WeeklyChecklist() {
  const [currentMonday, setCurrentMonday] = useState(() => getMonday(new Date()))
  const [tasks, setTasks] = useState<WeeklyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add form
  const [showForm, setShowForm] = useState(false)
  const [formTitle, setFormTitle] = useState('')
  const [formCategory, setFormCategory] = useState<WeeklyTaskCategory>('task')
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // Copy feedback
  const [copied, setCopied] = useState(false)

  const weekStart = formatWeekStart(currentMonday)
  const isCurrentWeek = formatWeekStart(getMonday(new Date())) === weekStart

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getWeeklyTasks(weekStart)
      setTasks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [weekStart])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  // Navigation
  const goToPreviousWeek = () => {
    const prev = new Date(currentMonday)
    prev.setDate(prev.getDate() - 7)
    setCurrentMonday(prev)
  }

  const goToNextWeek = () => {
    const next = new Date(currentMonday)
    next.setDate(next.getDate() + 7)
    setCurrentMonday(next)
  }

  const goToCurrentWeek = () => {
    setCurrentMonday(getMonday(new Date()))
  }

  // CRUD
  const handleAdd = async () => {
    if (!formTitle.trim()) return
    setSaving(true)
    setError(null)
    try {
      await addWeeklyTask({
        week_start: weekStart,
        category: formCategory,
        title: formTitle.trim(),
      })
      setFormTitle('')
      setFormCategory('task')
      setShowForm(false)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (task: WeeklyTask) => {
    setTogglingId(task.id)
    try {
      await toggleWeeklyTask(task.id, !task.completed)
      setTasks(prev =>
        prev.map(t => (t.id === task.id ? { ...t, completed: !t.completed } : t))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setTogglingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteWeeklyTask(id)
      setTasks(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setDeletingId(null)
    }
  }

  // Copy for Monday call
  const handleCopy = () => {
    const lines: string[] = []
    lines.push(`Checklist semaine du ${formatWeekLabel(currentMonday)}`)
    lines.push('')

    for (const cat of CATEGORIES) {
      const catTasks = tasks.filter(t => t.category === cat)
      if (catTasks.length === 0) continue
      lines.push(`${WEEKLY_TASK_CATEGORY_ICONS[cat]} ${WEEKLY_TASK_CATEGORY_LABELS[cat]}`)
      for (const t of catTasks) {
        const check = t.completed ? '[x]' : '[ ]'
        const prospect = t.prospect ? ` (${t.prospect.prenom} ${t.prospect.nom})` : ''
        const weeks = getCarryOverWeeks(t.week_start, weekStart)
        const carryTag = weeks >= 2
          ? ` [EN RETARD S${getISOWeekNumber(new Date(t.week_start + 'T00:00:00'))}]`
          : weeks === 1
            ? ' [Reporte]'
            : ''
        lines.push(`  ${check} ${t.title}${prospect}${carryTag}`)
      }
      lines.push('')
    }

    navigator.clipboard.writeText(lines.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Carry-over badge for a task
  const renderCarryOverBadge = (task: WeeklyTask) => {
    const weeks = getCarryOverWeeks(task.week_start, weekStart)
    if (weeks <= 0) return null

    const origWeekNum = getISOWeekNumber(new Date(task.week_start + 'T00:00:00'))

    if (weeks >= 2) {
      return (
        <span className="ml-1.5 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[9px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
          En retard S{origWeekNum}
        </span>
      )
    }

    return (
      <span className="ml-1.5 inline-flex shrink-0 items-center rounded px-1 py-0.5 text-[9px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
        Reporte
      </span>
    )
  }

  // Group tasks by category
  const tasksByCategory = CATEGORIES.map(cat => ({
    category: cat,
    label: WEEKLY_TASK_CATEGORY_LABELS[cat],
    icon: WEEKLY_TASK_CATEGORY_ICONS[cat],
    tasks: tasks.filter(t => t.category === cat),
  })).filter(g => g.tasks.length > 0)

  const completedCount = tasks.filter(t => t.completed).length
  const totalCount = tasks.length
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Checklist semaine</CardTitle>
          {totalCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {completedCount}/{totalCount}
            </Badge>
          )}
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between pt-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={goToPreviousWeek}>
            <ChevronLeft className="size-4" />
          </Button>
          <button
            onClick={goToCurrentWeek}
            className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {formatWeekLabel(currentMonday)}
            {isCurrentWeek && (
              <span className="ml-1 text-brand-accent">(cette semaine)</span>
            )}
          </button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={goToNextWeek}>
            <ChevronRight className="size-4" />
          </Button>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="mt-2">
            <div className="h-1.5 w-full rounded-full bg-white/[0.06]">
              <div
                className="h-1.5 rounded-full bg-brand-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Task groups */}
            {tasksByCategory.length > 0 ? (
              <div className="space-y-4">
                {tasksByCategory.map(group => (
                  <div key={group.category}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-sm">{group.icon}</span>
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label}
                      </span>
                      <Badge variant="secondary" className="text-[10px] ml-auto">
                        {group.tasks.filter(t => t.completed).length}/{group.tasks.length}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      {group.tasks.map(task => (
                        <div
                          key={task.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.03] group"
                        >
                          {/* Checkbox */}
                          <button
                            onClick={() => handleToggle(task)}
                            disabled={togglingId === task.id}
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              task.completed
                                ? 'border-brand-accent bg-brand-accent text-white'
                                : 'border-white/20 hover:border-brand-accent/50'
                            }`}
                          >
                            {togglingId === task.id ? (
                              <Loader2 className="size-2.5 animate-spin" />
                            ) : task.completed ? (
                              <Check className="size-2.5" />
                            ) : null}
                          </button>

                          {/* Title + prospect + carry-over badge */}
                          <div className="min-w-0 flex-1">
                            <span
                              className={`text-sm ${
                                task.completed ? 'line-through text-muted-foreground' : ''
                              }`}
                            >
                              {task.title}
                            </span>
                            {renderCarryOverBadge(task)}
                            {task.prospect && (
                              <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                <Building2 className="size-2.5" />
                                {task.prospect.prenom} {task.prospect.nom}
                              </span>
                            )}
                          </div>

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 shrink-0"
                            onClick={() => handleDelete(task.id)}
                            disabled={deletingId === task.id}
                          >
                            {deletingId === task.id ? (
                              <Loader2 className="size-2.5 animate-spin" />
                            ) : (
                              <Trash2 className="size-2.5" />
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-xs text-muted-foreground py-3">
                Aucune tache pour cette semaine
              </p>
            )}

            {/* Add form */}
            {showForm ? (
              <div className="mt-3 space-y-2 rounded-lg border bg-white/[0.02] p-3">
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="Titre de la tache..."
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  autoFocus
                  className="w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm placeholder:text-white/20 focus:border-brand-accent/40 focus:outline-none focus:ring-1 focus:ring-brand-accent/20"
                />
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value as WeeklyTaskCategory)}
                  className="w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm focus:border-brand-accent/40 focus:outline-none focus:ring-1 focus:ring-brand-accent/20"
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat} className="bg-[#112220] text-white">
                      {WEEKLY_TASK_CATEGORY_ICONS[cat]} {WEEKLY_TASK_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAdd} disabled={saving || !formTitle.trim()} className="flex-1">
                    {saving ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                    Ajouter
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => setShowForm(true)}
                >
                  <Plus className="size-3" />
                  Ajouter
                </Button>
                {tasks.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="size-3 text-green-400" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    {copied ? 'Copie !' : 'Monday call'}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
