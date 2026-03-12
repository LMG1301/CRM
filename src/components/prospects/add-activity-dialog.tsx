'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ACTIVITY_LABELS } from '@/lib/types'
import type { ActivityType } from '@/lib/types'

interface AddActivityDialogProps {
  prospectId: string
  type: ActivityType
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

export function AddActivityDialog({
  prospectId,
  type,
  open,
  onOpenChange,
  onSave,
}: AddActivityDialogProps) {
  const [content, setContent] = useState('')
  const [subject, setSubject] = useState('')
  const [transcription, setTranscription] = useState('')
  const [activityDate, setActivityDate] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [saving, setSaving] = useState(false)
  const [summarizing, setSummarizing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const label = ACTIVITY_LABELS[type] || type

  const dialogTitles: Record<string, string> = {
    note: 'Ajouter une note',
    call: 'Logger un appel',
    email_sent: 'Logger un email envoye',
    email_received: 'Logger un email recu',
    transcription: 'Coller une transcription',
    linkedin_interaction: 'Logger une interaction LinkedIn',
  }

  const handleSave = async () => {
    if (!content.trim() && type !== 'call') return
    if (type === 'call' && !content.trim() && !transcription.trim()) return

    setSaving(true)
    setError(null)
    try {
      const metadata: Record<string, unknown> = {}
      let finalContent = content.trim()

      if (
        (type === 'email_sent' || type === 'email_received') &&
        subject.trim()
      ) {
        metadata.subject = subject.trim()
      }

      if ((type === 'call' || type === 'transcription' || type === 'note') && activityDate) {
        metadata.activity_date = activityDate
      }

      if (type === 'call' && transcription.trim()) {
        metadata.transcription = transcription.trim()
      }

      if (type === 'linkedin_interaction' && subject.trim()) {
        metadata.interaction_type = subject.trim()
        metadata.source = 'linkedin'
      }

      // Transcriptions: use API route to bypass server action size limits
      if (type === 'transcription') {
        let summaryContent = finalContent
        const transcriptMetadata: Record<string, unknown> = { ...metadata }

        // Auto-summarize long transcriptions
        if (finalContent.length > 1000) {
          setSummarizing(true)
          try {
            const res = await fetch('/api/ai/summarize', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ transcript: finalContent }),
            })
            if (res.ok) {
              const { summary } = await res.json()
              if (summary) {
                transcriptMetadata.full_transcript = finalContent
                summaryContent = summary
              }
            }
          } catch {
            // If summarization fails, keep original content
          } finally {
            setSummarizing(false)
          }
        }

        // Save via API route (no server action size limit)
        const saveRes = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospect_id: prospectId,
            type,
            content: summaryContent,
            metadata: transcriptMetadata,
            activity_date: activityDate || null,
          }),
        })
        if (!saveRes.ok) {
          const err = await saveRes.json()
          throw new Error(err.error || 'Erreur sauvegarde transcription')
        }
      } else {
        // Save via API route (supports activity_date column)
        const saveRes = await fetch('/api/activities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospect_id: prospectId,
            type,
            content: finalContent,
            metadata,
            activity_date: activityDate || null,
          }),
        })
        if (!saveRes.ok) {
          const err = await saveRes.json()
          throw new Error(err.error || 'Erreur sauvegarde activite')
        }
      }

      // Auto-trigger AI classification after every activity
      fetch('/api/ai/analyze-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal': 'true' },
        body: JSON.stringify({ prospect_id: prospectId }),
      }).catch(() => {}) // fire-and-forget

      setContent('')
      setSubject('')
      setTranscription('')
      setActivityDate('')
      onSave()
    } catch (err) {
      console.error('Erreur creation activite:', err)
      setError((err as Error).message || 'Erreur lors de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitles[type] || label}</DialogTitle>
          <DialogDescription>
            Cette activite sera ajoutee a l&apos;historique du prospect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0">
          {/* Note: date + textarea */}
          {type === 'note' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Date
                </label>
                <Input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                />
              </div>
              <div>
                <Textarea
                  placeholder="Ecrivez votre note..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[120px]"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Call: date + summary + optional transcription */}
          {type === 'call' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Date de l&apos;appel
                </label>
                <Input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Resume de l&apos;appel
                </label>
                <Textarea
                  placeholder="Resume des points cles de l'appel..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[100px]"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Transcription (optionnel)
                </label>
                <Textarea
                  placeholder="Collez la transcription Genspark ici..."
                  value={transcription}
                  onChange={(e) => setTranscription(e.target.value)}
                  className="min-h-[120px] max-h-[40vh] text-xs font-mono"
                />
              </div>
            </>
          )}

          {/* Email: subject + body */}
          {(type === 'email_sent' || type === 'email_received') && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Objet
                </label>
                <Input
                  placeholder="Objet de l'email..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Contenu
                </label>
                <Textarea
                  placeholder="Contenu de l'email..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[150px]"
                />
              </div>
            </>
          )}

          {/* LinkedIn interaction */}
          {type === 'linkedin_interaction' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Type d&apos;interaction
                </label>
                <Input
                  placeholder="Ex: Message envoye, Demande de connexion, InMail, Commentaire..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Contenu / Notes
                </label>
                <Textarea
                  placeholder="Contenu du message ou notes sur l'interaction..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[120px]"
                />
              </div>
            </>
          )}

          {/* Transcription: date + large textarea */}
          {type === 'transcription' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Date de l&apos;echange
                </label>
                <Input
                  type="date"
                  value={activityDate}
                  onChange={(e) => setActivityDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">
                  Transcription
                </label>
                <Textarea
                  placeholder="Collez la transcription Genspark ici..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[200px] max-h-[50vh] text-xs font-mono"
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">{error}</p>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving || summarizing}>
            {summarizing ? 'Resume en cours...' : saving ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
