'use client'

import { useState, useRef, useCallback } from 'react'
import { Mic, Square, Loader2, Save, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface VoiceRecorderProps {
  prospectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: () => void
}

type RecordingState = 'idle' | 'recording' | 'processing' | 'result'

interface StructuredResult {
  resume: string
  points_cles: string[]
  action_items: string[]
  sentiment: string
  mentioned_prospects: Array<{ name: string; matched_id: string | null }>
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function VoiceRecorder({
  prospectId,
  open,
  onOpenChange,
  onSave,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [transcription, setTranscription] = useState('')
  const [structured, setStructured] = useState<StructuredResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const reset = useCallback(() => {
    setState('idle')
    setDuration(0)
    setTranscription('')
    setStructured(null)
    setError(null)
    setSaving(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'
      const mediaRecorder = new MediaRecorder(stream, { mimeType })

      chunksRef.current = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.start(1000)
      mediaRecorderRef.current = mediaRecorder
      setState('recording')
      setDuration(0)
      setError(null)

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } catch {
      setError("Impossible d'acceder au microphone. Verifiez les permissions.")
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return

    setState('processing')
    if (timerRef.current) clearInterval(timerRef.current)

    return new Promise<void>((resolve) => {
      mediaRecorderRef.current!.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, {
          type: mediaRecorderRef.current!.mimeType,
        })

        // Stop all tracks
        mediaRecorderRef.current!.stream
          .getTracks()
          .forEach((t) => t.stop())

        // Send to API
        const formData = new FormData()
        formData.append('audio', audioBlob, 'recording.webm')
        formData.append('prospect_id', prospectId)

        try {
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
          })

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'Erreur transcription')
          }

          const data = await res.json()
          setTranscription(data.transcription)
          setStructured(data.structured)
          setState('result')
        } catch (err) {
          setError((err as Error).message)
          setState('idle')
        }

        resolve()
      }

      mediaRecorderRef.current!.stop()
    })
  }, [prospectId])

  const handleSave = async () => {
    if (!structured) return
    setSaving(true)

    try {
      const res = await fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospect_id: prospectId,
          type: 'transcription',
          content: structured.resume,
          metadata: {
            full_transcript: transcription,
            points_cles: structured.points_cles,
            action_items: structured.action_items,
            sentiment: structured.sentiment,
            mentioned_prospects: structured.mentioned_prospects,
            source: 'voice_recording',
          },
        }),
      })

      if (res.ok) {
        reset()
        onSave()
      } else {
        setError('Erreur lors de la sauvegarde')
        setSaving(false)
      }
    } catch {
      setError('Erreur lors de la sauvegarde')
      setSaving(false)
    }
  }

  const handleClose = () => {
    // Stop recording if active
    if (mediaRecorderRef.current && state === 'recording') {
      if (timerRef.current) clearInterval(timerRef.current)
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop())
      mediaRecorderRef.current.stop()
    }
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="size-5" />
            Note vocale
          </DialogTitle>
          <DialogDescription>
            Enregistrez une note vocale. Elle sera transcrite et structuree
            automatiquement.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recording controls */}
          {state === 'idle' && (
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={startRecording}
                size="lg"
                className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600"
              >
                <Mic className="size-6 text-white" />
              </Button>
              <p className="text-sm text-muted-foreground">
                Cliquez pour enregistrer
              </p>
            </div>
          )}

          {state === 'recording' && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
                <Button
                  onClick={stopRecording}
                  size="lg"
                  className="relative h-16 w-16 rounded-full bg-red-500 hover:bg-red-600"
                >
                  <Square className="size-5 text-white" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="font-mono text-lg">{formatDuration(duration)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Cliquez pour arreter
              </p>
            </div>
          )}

          {state === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Transcription et analyse en cours...
              </p>
            </div>
          )}

          {state === 'result' && structured && (
            <div className="space-y-3">
              {/* Resume */}
              <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <p className="mb-1 text-xs font-medium text-foreground/80">
                  Resume
                </p>
                <p className="text-sm text-muted-foreground">
                  {structured.resume}
                </p>
              </div>

              {/* Points cles */}
              {structured.points_cles.length > 0 && (
                <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-foreground/80">
                    Points cles
                  </p>
                  {structured.points_cles.map((p, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      - {p}
                    </p>
                  ))}
                </div>
              )}

              {/* Action items */}
              {structured.action_items.length > 0 && (
                <div className="rounded-md border border-brand-accent/20 bg-brand-accent/5 px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-brand-accent">
                    Actions a suivre
                  </p>
                  {structured.action_items.map((a, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      - {a}
                    </p>
                  ))}
                </div>
              )}

              {/* Sentiment */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Sentiment :</span>
                <Badge
                  variant="outline"
                  className={
                    structured.sentiment === 'positif'
                      ? 'border-green-500/30 text-green-400'
                      : structured.sentiment === 'negatif'
                        ? 'border-red-500/30 text-red-400'
                        : 'border-gray-500/30 text-gray-400'
                  }
                >
                  {structured.sentiment}
                </Badge>
              </div>

              {/* Transcription brute (collapsed) */}
              <details className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-foreground/60">
                  Transcription brute
                </summary>
                <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                  {transcription}
                </p>
              </details>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          {state === 'result' && (
            <div className="flex w-full gap-2">
              <Button variant="outline" onClick={reset} className="flex-1">
                Recommencer
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Sauvegarder
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
