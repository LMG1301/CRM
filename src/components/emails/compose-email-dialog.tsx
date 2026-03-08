'use client'

import { useState, useEffect } from 'react'
import { Loader2, Send, Edit3, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ComposeEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospectId: string
  prospectEmail: string
  contentId: string | null
}

type Step = 'generating' | 'editing' | 'sending' | 'sent' | 'error'

export function ComposeEmailDialog({
  open,
  onOpenChange,
  prospectId,
  prospectEmail,
  contentId,
}: ComposeEmailDialogProps) {
  const [step, setStep] = useState<Step>('generating')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [to, setTo] = useState(prospectEmail)
  const [error, setError] = useState('')

  useEffect(() => {
    setTo(prospectEmail)
  }, [prospectEmail])

  // Generate email when dialog opens
  useEffect(() => {
    if (open && contentId) {
      generateEmail()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contentId])

  const generateEmail = async () => {
    setStep('generating')
    setError('')
    try {
      const res = await fetch('/api/ai/generate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId, content_id: contentId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erreur de generation')
        setStep('error')
        return
      }
      const data = await res.json()
      setSubject(data.subject || '')
      setBodyHtml(data.body_html || '')
      setStep('editing')
    } catch {
      setError('Erreur de connexion')
      setStep('error')
    }
  }

  const handleSend = async () => {
    if (!to || !subject) return
    setStep('sending')
    setError('')
    try {
      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          body_html: bodyHtml,
          prospect_id: prospectId,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erreur d\'envoi')
        setStep('error')
        return
      }
      setStep('sent')
    } catch {
      setError('Erreur de connexion')
      setStep('error')
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    // Reset after animation
    setTimeout(() => {
      setStep('generating')
      setSubject('')
      setBodyHtml('')
      setError('')
    }, 200)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'generating' && 'Generation de l\'email...'}
            {step === 'editing' && 'Valider et envoyer'}
            {step === 'sending' && 'Envoi en cours...'}
            {step === 'sent' && 'Email envoye !'}
            {step === 'error' && 'Erreur'}
          </DialogTitle>
        </DialogHeader>

        {/* Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-accent" />
            <p className="mt-3 text-sm text-muted-foreground">
              L'IA redige un email personnalise...
            </p>
          </div>
        )}

        {/* Editing */}
        {step === 'editing' && (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Destinataire</Label>
              <Input value={to} onChange={e => setTo(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Objet</Label>
              <Input value={subject} onChange={e => setSubject(e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Corps de l'email</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 text-[10px]"
                  onClick={generateEmail}
                >
                  <Edit3 className="h-3 w-3" />
                  Regenerer
                </Button>
              </div>
              <Textarea
                value={bodyHtml}
                onChange={e => setBodyHtml(e.target.value)}
                rows={10}
                className="text-sm"
              />
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-white/[0.06] p-3">
              <Label className="text-xs text-muted-foreground">Apercu</Label>
              <div
                className="mt-2 prose prose-sm prose-invert max-w-none text-sm"
                dangerouslySetInnerHTML={{ __html: bodyHtml }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button onClick={handleSend} disabled={!to || !subject}>
                <Send className="mr-2 h-4 w-4" />
                Envoyer via Gmail
              </Button>
            </div>
          </div>
        )}

        {/* Sending */}
        {step === 'sending' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-accent" />
            <p className="mt-3 text-sm text-muted-foreground">Envoi via Gmail...</p>
          </div>
        )}

        {/* Sent */}
        {step === 'sent' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <CheckCircle className="h-10 w-10 text-green-500" />
            <p className="mt-3 text-sm font-medium text-foreground">Email envoye avec succes !</p>
            <p className="mt-1 text-xs text-muted-foreground">
              L'email a ete envoye a {to} et enregistre dans la timeline du prospect.
            </p>
            <Button className="mt-4" onClick={handleClose}>Fermer</Button>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-10 w-10 text-red-500" />
            <p className="mt-3 text-sm font-medium text-foreground">Erreur</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={handleClose}>Fermer</Button>
              <Button onClick={generateEmail}>Reessayer</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
