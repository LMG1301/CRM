'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
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
  produits: string[]
  sentiment: string
  mentioned_prospects: Array<{ name: string; matched_id: string | null }>
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// Check if Web Speech API is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognition(): any {
  if (typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function VoiceRecorder({
  prospectId,
  open,
  onOpenChange,
  onSave,
}: VoiceRecorderProps) {
  const [state, setState] = useState<RecordingState>('idle')
  const [duration, setDuration] = useState(0)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [transcription, setTranscription] = useState('')
  const [structured, setStructured] = useState<StructuredResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const finalTranscriptRef = useRef('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Check browser support on mount
  const [supported, setSupported] = useState(true)
  useEffect(() => {
    if (!getSpeechRecognition()) {
      setSupported(false)
    }
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setDuration(0)
    setLiveTranscript('')
    setTranscription('')
    setStructured(null)
    setError(null)
    setSaving(false)
    finalTranscriptRef.current = ''
    if (timerRef.current) clearInterval(timerRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  const startRecording = useCallback(() => {
    const SpeechRecognitionClass = getSpeechRecognition()
    if (!SpeechRecognitionClass) {
      setError('Web Speech API non supportee. Utilisez Chrome ou Edge.')
      return
    }

    const recognition = new SpeechRecognitionClass()
    recognition.lang = 'fr-FR'
    recognition.continuous = true
    recognition.interimResults = true

    finalTranscriptRef.current = ''
    setLiveTranscript('')
    setError(null)

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          final += result[0].transcript + ' '
        } else {
          interim += result[0].transcript
        }
      }
      if (final) {
        finalTranscriptRef.current = final.trim()
      }
      setLiveTranscript((finalTranscriptRef.current + ' ' + interim).trim())
    }

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') return // Ignore silence
      if (event.error === 'aborted') return // Ignore manual abort
      setError(`Erreur reconnaissance vocale: ${event.error}`)
      setState('idle')
      if (timerRef.current) clearInterval(timerRef.current)
    }

    recognition.onend = () => {
      // Auto-restart if we're still in recording state (Web Speech can stop randomly)
      if (recognitionRef.current && state === 'recording') {
        try { recognition.start() } catch { /* ignore */ }
      }
    }

    try {
      recognition.start()
      recognitionRef.current = recognition
      setState('recording')
      setDuration(0)

      timerRef.current = setInterval(() => {
        setDuration((d) => d + 1)
      }, 1000)
    } catch {
      setError("Impossible de demarrer la reconnaissance vocale.")
    }
  }, [state])

  const stopRecording = useCallback(async () => {
    if (!recognitionRef.current) return

    // Stop recognition
    const recognition = recognitionRef.current
    recognitionRef.current = null // Prevent auto-restart in onend
    try { recognition.stop() } catch { /* ignore */ }
    if (timerRef.current) clearInterval(timerRef.current)

    // Get the final transcript
    const transcript = finalTranscriptRef.current || liveTranscript
    if (!transcript.trim()) {
      setError("Aucune parole detectee. Reessayez en parlant plus fort.")
      setState('idle')
      return
    }

    setTranscription(transcript)
    setState('processing')

    // Send text to API for AI structuration only
    try {
      const res = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: transcript,
          prospect_id: prospectId,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Erreur structuration')
      }

      const data = await res.json()
      setTranscription(data.transcription)
      setStructured(data.structured)
      setState('result')
    } catch (err) {
      setError((err as Error).message)
      setState('idle')
    }
  }, [prospectId, liveTranscript])

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
            produits: structured.produits || [],
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
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    if (timerRef.current) clearInterval(timerRef.current)
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
            Dictez votre note. Elle sera transcrite en temps reel et structuree
            par l&apos;IA.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Browser not supported */}
          {!supported && state === 'idle' && (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              <AlertCircle className="size-4 shrink-0" />
              Votre navigateur ne supporte pas la reconnaissance vocale. Utilisez Chrome ou Edge.
            </div>
          )}

          {/* Recording controls */}
          {state === 'idle' && supported && (
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={startRecording}
                size="lg"
                className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600"
              >
                <Mic className="size-6 text-white" />
              </Button>
              <p className="text-sm text-muted-foreground">
                Cliquez pour dicter
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

              {/* Live transcription preview */}
              {liveTranscript && (
                <div className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-foreground/60">
                    Transcription en cours...
                  </p>
                  <p className="text-sm text-muted-foreground italic">
                    {liveTranscript}
                  </p>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Cliquez pour arreter
              </p>
            </div>
          )}

          {state === 'processing' && (
            <div className="flex flex-col items-center gap-4 py-8">
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Structuration IA en cours...
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

              {/* Produits mentionnes */}
              {structured.produits && structured.produits.length > 0 && (
                <div className="rounded-md border border-violet-500/20 bg-violet-500/5 px-3 py-2">
                  <p className="mb-1 text-xs font-medium text-violet-400">
                    Produits mentionnes
                  </p>
                  {structured.produits.map((p, i) => (
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
