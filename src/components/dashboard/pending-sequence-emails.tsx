'use client'

import { useState } from 'react'
import { Check, Loader2, Mail, Pencil, RotateCcw, SkipForward, Square, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EditSequenceEmailDialog } from '@/components/sequences/edit-sequence-email-dialog'
import type { SequenceEnrollment } from '@/lib/types'

interface PendingSequenceEmailsProps {
  initialPending: SequenceEnrollment[]
}

export function PendingSequenceEmails({ initialPending }: PendingSequenceEmailsProps) {
  const [pending, setPending] = useState(initialPending)
  const [actioning, setActioning] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingEnrollment, setEditingEnrollment] = useState<SequenceEnrollment | null>(null)

  const handleApprove = async (enrollmentId: string) => {
    console.log('[APPROVE] Starting...', enrollmentId)
    setActioning(enrollmentId)
    try {
      const res = await fetch('/api/sequences/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId }),
      })
      console.log('[APPROVE] Response status:', res.status)
      const data = await res.json()
      console.log('[APPROVE] Response body:', data)
      if (res.ok) {
        console.log('[APPROVE] Success — removing from list')
        setPending(prev => prev.filter(p => p.id !== enrollmentId))
      } else {
        console.error('[APPROVE] API error:', data.error)
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`)
      }
    } catch (err) {
      console.error('[APPROVE] Network error:', err)
      alert(`Erreur reseau: ${(err as Error).message}`)
    }
    setActioning(null)
  }

  const handleRegenerate = async (enrollmentId: string) => {
    setActioning(enrollmentId)
    try {
      // 1. Clear pending email
      const res = await fetch('/api/sequences/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId, action: 'regenerate' }),
      })
      if (!res.ok) { setActioning(null); return }

      // 2. Trigger immediate re-generation
      await fetch('/api/sequences/process-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId }),
      })

      // 3. Re-fetch the enrollment to get the new pending email
      const enrollment = pending.find(p => p.id === enrollmentId)
      if (enrollment) {
        const enrollRes = await fetch(`/api/sequences/enroll?prospect_id=${enrollment.prospect_id}`)
        if (enrollRes.ok) {
          const enrollments = await enrollRes.json()
          const updated = enrollments.find((e: SequenceEnrollment) => e.id === enrollmentId)
          if (updated?.pending_email) {
            setPending(prev => prev.map(p =>
              p.id === enrollmentId
                ? { ...p, pending_email: updated.pending_email }
                : p
            ))
          }
        }
      }
    } catch { /* ignore */ }
    setActioning(null)
  }

  const handleReject = async (enrollmentId: string, action: 'skip' | 'stop') => {
    setActioning(enrollmentId)
    try {
      const res = await fetch('/api/sequences/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId, action }),
      })
      if (res.ok) {
        setPending(prev => prev.filter(p => p.id !== enrollmentId))
      }
    } catch { /* ignore */ }
    setActioning(null)
  }

  if (pending.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4 text-brand-accent" />
          Emails de sequence a valider
          <Badge variant="secondary" className="ml-auto">
            {pending.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pending.map((enrollment) => {
          const prospect = enrollment.prospect as Record<string, string> | undefined
          const sequence = enrollment.sequence as Record<string, unknown> | undefined
          const email = enrollment.pending_email
          if (!email) return null

          const isExpanded = expanded === enrollment.id
          const isActioning = actioning === enrollment.id

          return (
            <div
              key={enrollment.id}
              className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {prospect?.prenom} {prospect?.nom}
                    </span>
                    {prospect?.entreprise && (
                      <span className="text-xs text-muted-foreground truncate">
                        {prospect.entreprise}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      <Zap className="mr-1 size-3" />
                      {(sequence?.name as string) || 'Sequence'} — Etape {email.step_position}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Email preview */}
              <div className="mt-3 rounded-md bg-white/[0.04] p-3">
                <p className="text-xs font-medium text-brand-accent">
                  Objet : {email.subject}
                </p>
                <div
                  className="mt-2 text-xs text-muted-foreground"
                  onClick={() => setExpanded(isExpanded ? null : enrollment.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {isExpanded ? (
                    <div
                      className="prose prose-xs prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: email.body_html }}
                    />
                  ) : (
                    <p className="line-clamp-2">
                      {email.body_text || email.body_html?.replace(/<[^>]*>/g, '').slice(0, 200)}
                    </p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="mt-3 flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="h-7 gap-1.5 bg-emerald-600 px-3 text-xs hover:bg-emerald-500"
                  onClick={() => handleApprove(enrollment.id)}
                  disabled={isActioning}
                >
                  {isActioning ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Check className="size-3" />
                  )}
                  Envoyer
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => setEditingEnrollment(enrollment)}
                  disabled={isActioning}
                >
                  <Pencil className="size-3" />
                  Modifier
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => handleRegenerate(enrollment.id)}
                  disabled={isActioning}
                >
                  <RotateCcw className="size-3" />
                  Regenerer
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => handleReject(enrollment.id, 'skip')}
                  disabled={isActioning}
                >
                  <SkipForward className="size-3" />
                  Passer
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs text-red-400 hover:text-red-300"
                  onClick={() => handleReject(enrollment.id, 'stop')}
                  disabled={isActioning}
                >
                  <Square className="size-3" />
                  Arreter
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>

      {/* Edit email dialog */}
      {editingEnrollment && (
        <EditSequenceEmailDialog
          open={!!editingEnrollment}
          onOpenChange={(open) => { if (!open) setEditingEnrollment(null) }}
          enrollment={editingEnrollment}
          onSaved={(action) => {
            if (action === 'sent') {
              setPending(prev => prev.filter(p => p.id !== editingEnrollment.id))
            }
            setEditingEnrollment(null)
          }}
        />
      )}
    </Card>
  )
}
