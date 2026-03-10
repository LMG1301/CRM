'use client'

import { useState, useEffect } from 'react'
import { Check, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { SequenceEnrollment } from '@/lib/types'

interface EditSequenceEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  enrollment: SequenceEnrollment
  onSaved: (action: 'sent' | 'draft') => void
}

export function EditSequenceEmailDialog({
  open,
  onOpenChange,
  enrollment,
  onSaved,
}: EditSequenceEmailDialogProps) {
  const pendingEmail = enrollment.pending_email as {
    subject: string
    body_html: string
    body_text: string
    step_position: number
  } | null

  const prospect = enrollment.prospect as Record<string, string> | undefined
  const sequence = enrollment.sequence as Record<string, unknown> | undefined

  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [signature, setSignature] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)

  // Initialize fields when dialog opens
  useEffect(() => {
    if (open && pendingEmail) {
      setSubject(pendingEmail.subject || '')
      setBodyText(pendingEmail.body_text || pendingEmail.body_html?.replace(/<[^>]*>/g, '') || '')
    }
  }, [open, pendingEmail])

  // Load signature
  useEffect(() => {
    if (open) {
      fetch('/api/business-context')
        .then(r => r.json())
        .then(data => {
          if (data?.email_signature) setSignature(data.email_signature)
        })
        .catch(() => {})
    }
  }, [open])

  if (!pendingEmail) return null

  const prospectName = [prospect?.prenom, prospect?.nom].filter(Boolean).join(' ')
  const prospectEmail = prospect?.email || prospect?.email_pro || ''

  // Convert body_text paragraphs to simple HTML
  const textToHtml = (text: string): string => {
    return text
      .split('\n')
      .filter(line => line.trim())
      .map(line => `<p>${line}</p>`)
      .join('')
  }

  const handleApprove = async () => {
    setSending(true)
    try {
      const bodyHtml = textToHtml(bodyText)
      const res = await fetch('/api/sequences/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_id: enrollment.id,
          edited_subject: subject !== pendingEmail.subject ? subject : undefined,
          edited_body_html: bodyText !== pendingEmail.body_text ? bodyHtml : undefined,
        }),
      })
      if (res.ok) {
        onSaved('sent')
        onOpenChange(false)
      } else {
        const data = await res.json()
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`)
      }
    } catch (err) {
      alert(`Erreur reseau: ${(err as Error).message}`)
    }
    setSending(false)
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const bodyHtml = textToHtml(bodyText)
      const res = await fetch('/api/sequences/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enrollment_id: enrollment.id,
          subject,
          body_html: bodyHtml,
          body_text: bodyText,
        }),
      })
      if (res.ok) {
        onSaved('draft')
        onOpenChange(false)
      } else {
        const data = await res.json()
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`)
      }
    } catch (err) {
      alert(`Erreur reseau: ${(err as Error).message}`)
    }
    setSaving(false)
  }

  const isActioning = sending || saving

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            Modifier l&apos;email — Etape {pendingEmail.step_position}
            {sequence?.name ? (
              <span className="font-normal text-muted-foreground ml-2">
                {String(sequence.name)}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Recipient info */}
          <div className="rounded-md bg-white/[0.04] px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Destinataire : <span className="text-foreground font-medium">{prospectName}</span>
              {prospectEmail && (
                <span className="ml-2 text-muted-foreground/60">&lt;{prospectEmail}&gt;</span>
              )}
            </p>
          </div>

          {/* Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="seq-email-subject" className="text-xs">
              Objet
            </Label>
            <Input
              id="seq-email-subject"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Objet de l'email"
              disabled={isActioning}
            />
          </div>

          {/* Body */}
          <div className="space-y-1.5">
            <Label htmlFor="seq-email-body" className="text-xs">
              Corps du message
            </Label>
            <textarea
              id="seq-email-body"
              value={bodyText}
              onChange={e => setBodyText(e.target.value)}
              placeholder="Corps de l'email..."
              rows={10}
              disabled={isActioning}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[200px]"
            />
          </div>

          {/* Signature preview */}
          {signature && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Signature (auto)</Label>
              <div
                className="rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: signature }}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-500"
              onClick={handleApprove}
              disabled={isActioning || !subject.trim() || !bodyText.trim()}
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Envoyer
            </Button>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={handleSaveDraft}
              disabled={isActioning || !subject.trim() || !bodyText.trim()}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Sauvegarder brouillon
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
