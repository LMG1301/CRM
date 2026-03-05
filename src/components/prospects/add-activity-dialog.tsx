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
import { createActivity } from '@/lib/actions'
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
  const [saving, setSaving] = useState(false)

  const label = ACTIVITY_LABELS[type] || type

  const dialogTitles: Record<string, string> = {
    note: 'Ajouter une note',
    call: 'Logger un appel',
    email_sent: 'Logger un email envoye',
    email_received: 'Logger un email recu',
    transcription: 'Coller une transcription',
  }

  const handleSave = async () => {
    if (!content.trim() && type !== 'call') return
    if (type === 'call' && !content.trim() && !transcription.trim()) return

    setSaving(true)
    try {
      const metadata: Record<string, unknown> = {}

      if (
        (type === 'email_sent' || type === 'email_received') &&
        subject.trim()
      ) {
        metadata.subject = subject.trim()
      }

      if (type === 'call' && transcription.trim()) {
        metadata.transcription = transcription.trim()
      }

      await createActivity({
        prospect_id: prospectId,
        type,
        content: content.trim(),
        metadata,
      })

      setContent('')
      setSubject('')
      setTranscription('')
      onSave()
    } catch (error) {
      console.error('Erreur creation activite:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{dialogTitles[type] || label}</DialogTitle>
          <DialogDescription>
            Cette activite sera ajoutee a l&apos;historique du prospect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Note: simple textarea */}
          {type === 'note' && (
            <div>
              <Textarea
                placeholder="Ecrivez votre note..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[120px]"
                autoFocus
              />
            </div>
          )}

          {/* Call: summary + optional transcription */}
          {type === 'call' && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
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
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Transcription (optionnel)
                </label>
                <Textarea
                  placeholder="Collez la transcription Genspark ici..."
                  value={transcription}
                  onChange={(e) => setTranscription(e.target.value)}
                  className="min-h-[120px] text-xs font-mono"
                />
              </div>
            </>
          )}

          {/* Email: subject + body */}
          {(type === 'email_sent' || type === 'email_received') && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
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
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
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

          {/* Transcription: large textarea */}
          {type === 'transcription' && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                Transcription
              </label>
              <Textarea
                placeholder="Collez la transcription Genspark ici..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px] text-xs font-mono"
                autoFocus
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
