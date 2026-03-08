'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ListTodo, CheckCircle2, Building2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface TaskWithProspect {
  id: string
  title: string
  due_date: string
  status: string
  prospect_id: string
  prospect?: { prenom: string; nom: string; entreprise?: string } | null
}

export function TasksToday({ initialTasks }: { initialTasks: TaskWithProspect[] }) {
  const [tasks, setTasks] = useState(initialTasks)

  const handleComplete = async (taskId: string) => {
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: 'done' }),
      })
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch { /* ignore */ }
  }

  if (tasks.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTodo className="size-5" />
          Taches du jour
          <Badge variant="secondary">{tasks.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {tasks.map(task => {
            const due = new Date(task.due_date)
            const now = new Date()
            const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
            const isOverdue = diffDays < 0
            const prospectName = task.prospect
              ? `${task.prospect.prenom} ${task.prospect.nom}`
              : ''

            return (
              <div key={task.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{task.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {prospectName && (
                      <Link
                        href={`/prospects/${task.prospect_id}`}
                        className="flex items-center gap-1 text-xs text-brand-accent hover:underline"
                      >
                        <Building2 className="size-3" />
                        {prospectName}
                      </Link>
                    )}
                    {isOverdue && (
                      <span className="text-xs text-red-400">En retard ({Math.abs(diffDays)}j)</span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 shrink-0 text-green-500 hover:text-green-400"
                  onClick={() => handleComplete(task.id)}
                  title="Marquer comme fait"
                >
                  <CheckCircle2 className="size-4" />
                </Button>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
