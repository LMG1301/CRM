'use client'

import { useState, useEffect } from 'react'
import { Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Sequence } from '@/lib/types'

interface EnrollSequenceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prospectIds: string[]
  prospectName?: string
  onEnrolled?: () => void
}

export function EnrollSequenceDialog({
  open,
  onOpenChange,
  prospectIds,
  prospectName,
  onEnrolled,
}: EnrollSequenceDialogProps) {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [sendMode, setSendMode] = useState<'semi_auto' | 'auto'>('semi_auto')
  const [enrolling, setEnrolling] = useState(false)
  const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null)

  useEffect(() => {
    if (open) {
      setResult(null)
      setLoading(true)
      fetch('/api/sequences')
        .then(r => r.json())
        .then(data => {
          const active = (Array.isArray(data) ? data : []).filter((s: Sequence) => s.is_active)
          setSequences(active)
          if (active.length > 0 && !selectedId) setSelectedId(active[0].id)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    }
  }, [open])

  const handleEnroll = async () => {
    if (!selectedId || prospectIds.length === 0) return
    setEnrolling(true)
    try {
      const res = await fetch('/api/sequences/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sequence_id: selectedId,
          prospect_ids: prospectIds,
          send_mode: sendMode,
        }),
      })
      const data = await res.json()
      setResult({ enrolled: data.enrolled || 0, skipped: data.skipped || 0 })
      onEnrolled?.()
    } catch { /* ignore */ }
    setEnrolling(false)
  }

  if (!open) return null

  const selected = sequences.find(s => s.id === selectedId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div
        className="w-full max-w-md rounded-xl border border-white/[0.08] bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <Zap className="size-5 text-brand-accent" />
          <h2 className="text-lg font-semibold">Inscrire dans une sequence</h2>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : result ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-500/10 p-4 text-sm">
              <p className="font-medium text-emerald-400">
                {result.enrolled} prospect{result.enrolled > 1 ? 's' : ''} inscrit{result.enrolled > 1 ? 's' : ''}
              </p>
              {result.skipped > 0 && (
                <p className="mt-1 text-muted-foreground">
                  {result.skipped} deja inscrit{result.skipped > 1 ? 's' : ''}
                </p>
              )}
            </div>
            <Button className="w-full" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
          </div>
        ) : sequences.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Aucune sequence active. Creez-en une dans Parametres &gt; Sequences.
          </div>
        ) : (
          <div className="space-y-4">
            {prospectName && (
              <p className="text-sm text-muted-foreground">
                {prospectIds.length > 1
                  ? `${prospectIds.length} prospects selectionnes`
                  : prospectName}
              </p>
            )}

            <div>
              <Label>Sequence</Label>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                {sequences.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.steps?.length || 0} etapes)
                  </option>
                ))}
              </select>
            </div>

            {selected && (
              <div className="rounded-lg bg-white/[0.03] p-3 text-xs text-muted-foreground">
                {selected.description && <p className="mb-2">{selected.description}</p>}
                <div className="space-y-1">
                  {(selected.steps || []).map((step, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-brand-accent/20 text-[10px] font-medium text-brand-accent">
                        {i + 1}
                      </span>
                      <span>J+{step.delay_days}</span>
                      <span className="text-muted-foreground/70 truncate">{step.prompt_hint}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <Label>Mode d&apos;envoi</Label>
              <div className="mt-1 flex gap-2">
                <button
                  className={`flex-1 rounded-lg border p-3 text-left text-xs transition-colors ${
                    sendMode === 'semi_auto'
                      ? 'border-brand-accent bg-brand-accent/10'
                      : 'border-white/[0.08] hover:border-white/[0.15]'
                  }`}
                  onClick={() => setSendMode('semi_auto')}
                >
                  <p className="font-medium">Semi-auto</p>
                  <p className="mt-0.5 text-muted-foreground">Reviser avant envoi</p>
                </button>
                <button
                  className={`flex-1 rounded-lg border p-3 text-left text-xs transition-colors ${
                    sendMode === 'auto'
                      ? 'border-brand-accent bg-brand-accent/10'
                      : 'border-white/[0.08] hover:border-white/[0.15]'
                  }`}
                  onClick={() => setSendMode('auto')}
                >
                  <p className="font-medium">Automatique</p>
                  <p className="mt-0.5 text-muted-foreground">Envoi direct par l&apos;IA</p>
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button className="flex-1" onClick={handleEnroll} disabled={enrolling || !selectedId}>
                {enrolling ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
                Inscrire
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
