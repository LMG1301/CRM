'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Zap, Plus, Loader2, ChevronLeft, Pencil, Trash2, Save, X,
  GripVertical, ArrowDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { Sequence, SequenceStep } from '@/lib/types'

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [loading, setLoading] = useState(true)

  // Editor state
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState<SequenceStep[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSequences = async () => {
    try {
      const res = await fetch('/api/sequences')
      const data = await res.json()
      if (Array.isArray(data)) {
        setSequences(data)
      } else if (data?.error) {
        setError(data.error)
      }
    } catch {
      setError('Impossible de charger les sequences. Verifiez que la table existe dans Supabase.')
    }
    setLoading(false)
  }

  useEffect(() => { loadSequences() }, [])

  const resetEditor = () => {
    setEditing(false)
    setEditId(null)
    setName('')
    setDescription('')
    setSteps([])
  }

  const openNew = () => {
    resetEditor()
    setSteps([
      { position: 1, delay_days: 0, prompt_hint: 'Premier contact de prospection' },
      { position: 2, delay_days: 3, prompt_hint: 'Relance douce, mentionner le premier email' },
      { position: 3, delay_days: 5, prompt_hint: 'Derniere relance, proposer un call' },
    ])
    setEditing(true)
  }

  const openEdit = (s: Sequence) => {
    setEditId(s.id)
    setName(s.name)
    setDescription(s.description)
    setSteps(s.steps || [])
    setEditing(true)
  }

  const addStep = () => {
    setSteps(prev => [
      ...prev,
      {
        position: prev.length + 1,
        delay_days: 3,
        prompt_hint: '',
      },
    ])
  }

  const removeStep = (index: number) => {
    setSteps(prev =>
      prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, position: i + 1 }))
    )
  }

  const updateStep = (index: number, field: keyof SequenceStep, value: string | number) => {
    setSteps(prev =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    )
  }

  const handleSave = async () => {
    if (!name.trim() || steps.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        description,
        steps: steps.map((s, i) => ({ ...s, position: i + 1 })),
      }

      const res = editId
        ? await fetch(`/api/sequences/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/sequences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Erreur serveur (${res.status})` }))
        throw new Error(err.error || 'Erreur lors de la sauvegarde')
      }

      await loadSequences()
      resetEditor()
    } catch (e) {
      setError((e as Error).message || 'Erreur lors de la sauvegarde')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch(`/api/sequences/${id}`, { method: 'DELETE' })
      await loadSequences()
    } catch { /* ignore */ }
    setDeleting(null)
  }

  const toggleActive = async (s: Sequence) => {
    try {
      await fetch(`/api/sequences/${s.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !s.is_active }),
      })
      await loadSequences()
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/settings"
          className="mb-3 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          Retour aux parametres
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Zap className="size-6" />
              Sequences
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Creez des sequences d&apos;emails automatises. Chaque etape genere un email par l&apos;IA.
            </p>
          </div>
          {!editing && (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Nouvelle
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && !editing && (
        <div className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Editor */}
      {editing && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              {editId ? 'Modifier la sequence' : 'Nouvelle sequence'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="seq-name">Nom</Label>
                <Input
                  id="seq-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Sequence prospection DA"
                />
              </div>
              <div>
                <Label htmlFor="seq-desc">Description</Label>
                <Input
                  id="seq-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Sequence pour les distributeurs automatiques"
                />
              </div>
            </div>

            {/* Steps */}
            <div>
              <Label className="mb-2 block">Etapes ({steps.length})</Label>
              <div className="space-y-3">
                {steps.map((step, i) => (
                  <div key={i} className="relative rounded-lg border border-white/[0.08] bg-white/[0.02] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <GripVertical className="size-4 text-muted-foreground/50" />
                        <span className="flex size-6 items-center justify-center rounded-full bg-brand-accent/20 text-xs font-medium text-brand-accent">
                          {i + 1}
                        </span>
                      </div>
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-[100px_1fr] gap-3">
                          <div>
                            <Label className="text-xs text-muted-foreground">Delai (jours)</Label>
                            <Input
                              type="number"
                              min={0}
                              value={step.delay_days}
                              onChange={(e) => updateStep(i, 'delay_days', parseInt(e.target.value) || 0)}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Objet (indication)</Label>
                            <Input
                              value={step.subject_hint || ''}
                              onChange={(e) => updateStep(i, 'subject_hint', e.target.value)}
                              placeholder="Collaboration {entreprise} x Boost"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Instruction IA pour cette etape</Label>
                          <textarea
                            value={step.prompt_hint}
                            onChange={(e) => updateStep(i, 'prompt_hint', e.target.value)}
                            placeholder="Premier contact, mentionner le ScreenKit et la telemetrie..."
                            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm min-h-[60px] resize-none"
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                        onClick={() => removeStep(i)}
                        disabled={steps.length <= 1}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    {i < steps.length - 1 && (
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                        <ArrowDown className="size-4 text-muted-foreground/30" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={addStep}
              >
                <Plus className="size-4" />
                Ajouter une etape
              </Button>
            </div>

            {error && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button variant="ghost" size="sm" onClick={() => { resetEditor(); setError(null) }}>
                <X className="size-4" />
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !name.trim() || steps.length === 0 || steps.some(s => !s.prompt_hint.trim())}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Sauvegarder
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sequence List */}
      {sequences.length === 0 && !editing ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Zap className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Aucune sequence</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Creez votre premiere sequence pour automatiser votre prospection.
            </p>
            <Button className="mt-4" onClick={openNew}>
              <Plus className="size-4" />
              Creer une sequence
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sequences.map((s) => (
            <Card key={s.id} className={!s.is_active ? 'opacity-50' : ''}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {s.steps?.length || 0} etape{(s.steps?.length || 0) > 1 ? 's' : ''}
                    </Badge>
                    {!s.is_active && (
                      <Badge variant="outline" className="text-xs shrink-0 text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                  </div>
                  {s.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">
                      {s.description}
                    </p>
                  )}
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    {(s.steps || []).map((step, i) => (
                      <span key={i} className="flex items-center gap-1">
                        {i > 0 && <ArrowDown className="size-3" />}
                        <span className="rounded bg-white/[0.06] px-1.5 py-0.5">
                          J+{step.delay_days}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => toggleActive(s)}
                  >
                    {s.is_active ? 'Desactiver' : 'Activer'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                    onClick={() => handleDelete(s.id)}
                    disabled={deleting === s.id}
                  >
                    {deleting === s.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
