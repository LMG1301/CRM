'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, Send, Edit3, CheckCircle, AlertCircle, Paperclip, X, CalendarClock, FileIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RichTextEditor } from './rich-text-editor'
import type { EmailTemplate } from '@/lib/types'

interface ComposeEmailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospectId: string
  prospectEmail: string
  prospectName?: string
  contentId: string | null
  /** Pre-fill body HTML directly (e.g. from AI chat) */
  initialBodyHtml?: string
  /** Pre-fill subject directly */
  initialSubject?: string
}

type Step = 'generating' | 'editing' | 'sending' | 'sent' | 'followup' | 'error'

const MAX_FILES = 5
const MAX_TOTAL_SIZE = 10 * 1024 * 1024 // 10MB

export function ComposeEmailDialog({
  open,
  onOpenChange,
  prospectId,
  prospectEmail,
  prospectName,
  contentId,
  initialBodyHtml,
  initialSubject,
}: ComposeEmailDialogProps) {
  const [step, setStep] = useState<Step>('generating')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [to, setTo] = useState(prospectEmail)
  const [fromEmail, setFromEmail] = useState('')
  const [error, setError] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Follow-up state
  const [createFollowUp, setCreateFollowUp] = useState(true)
  const [followUpDelay, setFollowUpDelay] = useState('2')
  const [followUpTitle, setFollowUpTitle] = useState('')
  const [creatingTask, setCreatingTask] = useState(false)

  // Template state
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [showTemplates, setShowTemplates] = useState(false)

  useEffect(() => {
    setTo(prospectEmail)
  }, [prospectEmail])

  // Fetch sender email on mount
  useEffect(() => {
    if (open && !fromEmail) {
      fetch('/api/gmail/profile')
        .then(res => res.json())
        .then(data => {
          if (data.email) setFromEmail(data.email)
        })
        .catch(() => {})
    }
  }, [open, fromEmail])

  // Load templates
  useEffect(() => {
    if (open) {
      fetch('/api/email-templates')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setTemplates(data)
        })
        .catch(() => {})
    }
  }, [open])

  // Generate email when dialog opens, pre-fill from props, or go to editing
  useEffect(() => {
    if (open && contentId) {
      generateEmail()
    } else if (open && initialBodyHtml) {
      setBodyHtml(initialBodyHtml)
      if (initialSubject) setSubject(initialSubject)
      setStep('editing')
    } else if (open && !contentId) {
      setStep('editing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contentId, initialBodyHtml, initialSubject])

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

  const handleAddFiles = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files)
    const combined = [...attachments, ...newFiles].slice(0, MAX_FILES)
    const totalSize = combined.reduce((sum, f) => sum + f.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      setError('Taille totale des pieces jointes limitee a 10 MB')
      return
    }
    setAttachments(combined)
  }

  const handleRemoveFile = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // Remove data:...;base64, prefix
        resolve(result.split(',')[1])
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleSend = async () => {
    if (!to || !subject) return
    setStep('sending')
    setError('')
    try {
      // Convert attachments to base64
      let attachmentPayload = undefined
      if (attachments.length > 0) {
        attachmentPayload = await Promise.all(
          attachments.map(async file => ({
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64: await fileToBase64(file),
          }))
        )
      }

      const res = await fetch('/api/gmail/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          body_html: bodyHtml,
          prospect_id: prospectId,
          attachments: attachmentPayload,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erreur d\'envoi')
        setStep('error')
        return
      }
      // Pre-fill follow-up title
      setFollowUpTitle(`Relancer ${prospectName || to} - ${subject}`)
      setStep('sent')
    } catch {
      setError('Erreur de connexion')
      setStep('error')
    }
  }

  const handleCreateFollowUp = async () => {
    setCreatingTask(true)
    try {
      const dueDate = new Date()
      dueDate.setDate(dueDate.getDate() + parseInt(followUpDelay))

      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospectId,
          title: followUpTitle,
          due_date: dueDate.toISOString(),
          type: 'follow_up',
        }),
      })
    } catch {
      // Silent fail — task creation is optional
    }
    setCreatingTask(false)
    handleClose()
  }

  const handleSkipFollowUp = () => {
    handleClose()
  }

  const handleUseTemplate = async (template: EmailTemplate) => {
    // Fetch prospect data for variable substitution
    try {
      const res = await fetch(`/api/prospects/${prospectId}`)
      const prospect = await res.json()

      let html = template.body_html
      let sub = template.subject

      const vars: Record<string, string> = {
        '{prenom}': prospect.prenom || '',
        '{nom}': prospect.nom || '',
        '{entreprise}': prospect.entreprise || '',
        '{fonction}': prospect.fonction || '',
      }

      for (const [key, val] of Object.entries(vars)) {
        html = html.replaceAll(key, val)
        sub = sub.replaceAll(key, val)
      }

      setSubject(sub)
      setBodyHtml(html)
      setShowTemplates(false)

      // Increment usage count
      fetch(`/api/email-templates/${template.id}/use`, { method: 'POST' }).catch(() => {})
    } catch {
      // Fallback: use template without substitution
      setSubject(template.subject)
      setBodyHtml(template.body_html)
      setShowTemplates(false)
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
      setAttachments([])
      setCreateFollowUp(true)
      setFollowUpDelay('2')
      setFollowUpTitle('')
      setShowTemplates(false)
    }, 200)
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
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
            {step === 'followup' && 'Rappel de suivi'}
            {step === 'error' && 'Erreur'}
          </DialogTitle>
        </DialogHeader>

        {/* Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-accent" />
            <p className="mt-3 text-sm text-muted-foreground">
              L&apos;IA redige un email personnalise...
            </p>
          </div>
        )}

        {/* Editing */}
        {step === 'editing' && (
          <div className="space-y-4 pt-2">
            {/* From field (read-only) */}
            {fromEmail && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">De</Label>
                <Input value={fromEmail} disabled className="text-sm opacity-70" />
              </div>
            )}

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
                <Label>Corps de l&apos;email</Label>
                <div className="flex gap-1">
                  {templates.length > 0 && (
                    <div className="relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 text-[10px]"
                        onClick={() => setShowTemplates(!showTemplates)}
                      >
                        <FileIcon className="h-3 w-3" />
                        Template
                      </Button>
                      {showTemplates && (
                        <div className="absolute right-0 top-7 z-50 w-56 rounded-md border bg-popover p-1 shadow-lg">
                          {templates.map(t => (
                            <button
                              key={t.id}
                              onClick={() => handleUseTemplate(t)}
                              className="w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                            >
                              <span className="font-medium">{t.name}</span>
                              <span className="block text-muted-foreground truncate">{t.subject}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
              </div>
              <RichTextEditor
                value={bodyHtml}
                onChange={setBodyHtml}
                placeholder="Redigez votre email..."
              />
            </div>

            {/* Attachments */}
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => handleAddFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={attachments.length >= MAX_FILES}
              >
                <Paperclip className="h-3 w-3" />
                Piece jointe {attachments.length > 0 && `(${attachments.length})`}
              </Button>
              {attachments.length > 0 && (
                <div className="space-y-1">
                  {attachments.map((file, i) => (
                    <div key={i} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                      <span className="truncate mr-2">{file.name} ({formatFileSize(file.size)})</span>
                      <button onClick={() => handleRemoveFile(i)} className="text-muted-foreground hover:text-red-400">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
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

        {/* Sent — with follow-up form */}
        {step === 'sent' && (
          <div className="space-y-6 py-4">
            <div className="flex flex-col items-center text-center">
              <CheckCircle className="h-10 w-10 text-green-500" />
              <p className="mt-3 text-sm font-medium text-foreground">Email envoye avec succes !</p>
              <p className="mt-1 text-xs text-muted-foreground">
                L&apos;email a ete envoye a {to} et enregistre dans la timeline.
              </p>
            </div>

            {/* Follow-up form */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Creer un rappel de suivi</Label>
                </div>
                <Switch checked={createFollowUp} onCheckedChange={setCreateFollowUp} />
              </div>

              {createFollowUp && (
                <div className="space-y-3 pt-1">
                  <Input
                    value={followUpTitle}
                    onChange={e => setFollowUpTitle(e.target.value)}
                    placeholder="Titre du rappel"
                    className="text-sm"
                  />
                  <Select value={followUpDelay} onValueChange={setFollowUpDelay}>
                    <SelectTrigger className="text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">Dans 2 jours</SelectItem>
                      <SelectItem value="3">Dans 3 jours</SelectItem>
                      <SelectItem value="5">Dans 5 jours</SelectItem>
                      <SelectItem value="7">Dans 1 semaine</SelectItem>
                      <SelectItem value="14">Dans 2 semaines</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleSkipFollowUp}>
                {createFollowUp ? 'Passer' : 'Fermer'}
              </Button>
              {createFollowUp && (
                <Button onClick={handleCreateFollowUp} disabled={creatingTask || !followUpTitle}>
                  {creatingTask ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-2 h-4 w-4" />}
                  Creer le rappel
                </Button>
              )}
            </div>
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
