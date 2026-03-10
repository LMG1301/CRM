'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft,
  GripVertical,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─── Types ───

interface StageWithCount {
  id: string
  name: string
  slug: string
  position: number
  color: string
  is_terminal: boolean
  is_default: boolean
  is_deletable: boolean
  created_at: string
  prospect_count: number
}

// ─── Constants ───

const COLORS = [
  '#6b7280',
  '#3b82f6',
  '#06b6d4',
  '#22c55e',
  '#eab308',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#10b981',
]

// ─── SortableStageItem ───

function SortableStageItem({
  stage,
  onRename,
  onColorChange,
  onDelete,
  editingId,
  editingName,
  setEditingId,
  setEditingName,
  saving,
}: {
  stage: StageWithCount
  onRename: (id: string, name: string) => void
  onColorChange: (id: string, color: string) => void
  onDelete: (stage: StageWithCount) => void
  editingId: string | null
  editingName: string
  setEditingId: (id: string | null) => void
  setEditingName: (name: string) => void
  saving: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: stage.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  const [showColors, setShowColors] = useState(false)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-card p-3"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none"
      >
        <GripVertical className="size-4 text-muted-foreground" />
      </button>

      {/* Color dot with popover */}
      <div className="relative">
        <button
          onClick={() => setShowColors(!showColors)}
          className="size-5 rounded-full border-2 border-white/20"
          style={{ backgroundColor: stage.color }}
        />
        {showColors && (
          <div
            className="absolute left-0 top-8 z-10 flex flex-wrap gap-1.5 rounded-lg border bg-popover p-2 shadow-lg"
            style={{ width: '140px' }}
          >
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  onColorChange(stage.id, c)
                  setShowColors(false)
                }}
                className={`size-6 rounded-full border-2 ${c === stage.color ? 'border-white' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Name (inline edit or display) */}
      {editingId === stage.id ? (
        <div className="flex flex-1 items-center gap-2">
          <Input
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            className="h-7 text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRename(stage.id, editingName)
              if (e.key === 'Escape') setEditingId(null)
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => onRename(stage.id, editingName)}
            disabled={saving}
          >
            <Check className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => setEditingId(null)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 items-center gap-2">
          <span className="text-sm font-medium">{stage.name}</span>
          {stage.is_default && (
            <Badge variant="secondary" className="text-[10px]">
              par defaut
            </Badge>
          )}
          {stage.is_terminal && (
            <Badge variant="outline" className="text-[10px]">
              terminal
            </Badge>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1">
        {stage.prospect_count > 0 && (
          <span className="text-xs text-muted-foreground">
            {stage.prospect_count} prospect
            {stage.prospect_count > 1 ? 's' : ''}
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => {
            setEditingId(stage.id)
            setEditingName(stage.name)
          }}
          disabled={editingId !== null}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-destructive"
          onClick={() => onDelete(stage)}
          disabled={!stage.is_deletable || saving}
          title={
            !stage.is_deletable
              ? 'Cette etape ne peut pas etre supprimee'
              : ''
          }
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── Main Page ───

export default function PipelineSettingsPage() {
  const [stages, setStages] = useState<StageWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [addingNew, setAddingNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [deletingStage, setDeletingStage] = useState<StageWithCount | null>(
    null
  )
  const [moveToSlug, setMoveToSlug] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  // DnD sensors
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  // ─── Load stages ───

  const loadStages = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline-stages')
      if (!res.ok) throw new Error('Failed to fetch stages')
      const data = await res.json()
      if (Array.isArray(data)) {
        setStages(data)
      }
    } catch (err) {
      console.error('Error loading pipeline stages:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadStages()
  }, [loadStages])

  // ─── Drag & Drop Reorder ───

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = stages.findIndex((s) => s.id === active.id)
      const newIndex = stages.findIndex((s) => s.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const reordered = arrayMove(stages, oldIndex, newIndex)
      setStages(reordered)

      try {
        setSaving(true)
        const res = await fetch('/api/pipeline-stages/reorder', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            positions: reordered.map((s, i) => ({
              id: s.id,
              position: i,
            })),
          }),
        })
        if (!res.ok) throw new Error('Failed to reorder stages')
        setSaveMessage('Ordre sauvegarde')
        setTimeout(() => setSaveMessage(null), 2000)
      } catch (err) {
        console.error('Error reordering stages:', err)
        await loadStages()
      } finally {
        setSaving(false)
      }
    },
    [stages, loadStages]
  )

  // ─── Rename ───

  const handleRename = useCallback(
    async (id: string, name: string) => {
      if (!name.trim()) return
      try {
        setSaving(true)
        const res = await fetch(`/api/pipeline-stages/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim() }),
        })
        if (!res.ok) throw new Error('Failed to rename stage')
        await loadStages()
        setEditingId(null)
      } catch (err) {
        console.error('Error renaming stage:', err)
      } finally {
        setSaving(false)
      }
    },
    [loadStages]
  )

  // ─── Color Change ───

  const handleColorChange = useCallback(
    async (id: string, color: string) => {
      // Optimistic update
      setStages((prev) =>
        prev.map((s) => (s.id === id ? { ...s, color } : s))
      )
      try {
        const res = await fetch(`/api/pipeline-stages/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ color }),
        })
        if (!res.ok) throw new Error('Failed to update color')
      } catch (err) {
        console.error('Error updating stage color:', err)
        await loadStages()
      }
    },
    [loadStages]
  )

  // ─── Delete ───

  const handleDelete = useCallback(
    async (stage: StageWithCount) => {
      if (stage.prospect_count > 0) {
        setDeletingStage(stage)
        // Default move-to: first other stage
        const other = stages.find((s) => s.id !== stage.id)
        if (other) setMoveToSlug(other.slug)
        return
      }

      try {
        setSaving(true)
        const res = await fetch(`/api/pipeline-stages/${stage.id}`, {
          method: 'DELETE',
        })
        if (!res.ok) throw new Error('Failed to delete stage')
        await loadStages()
      } catch (err) {
        console.error('Error deleting stage:', err)
      } finally {
        setSaving(false)
      }
    },
    [stages, loadStages]
  )

  const confirmDelete = useCallback(async () => {
    if (!deletingStage) return
    try {
      setSaving(true)
      const res = await fetch(`/api/pipeline-stages/${deletingStage.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ move_to_slug: moveToSlug }),
      })
      if (!res.ok) throw new Error('Failed to delete stage')
      await loadStages()
      setDeletingStage(null)
      setMoveToSlug('')
    } catch (err) {
      console.error('Error deleting stage with migration:', err)
    } finally {
      setSaving(false)
    }
  }, [deletingStage, moveToSlug, loadStages])

  // ─── Add New ───

  const handleAdd = useCallback(async () => {
    if (!newName.trim()) return
    try {
      setSaving(true)
      const res = await fetch('/api/pipeline-stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      })
      if (!res.ok) throw new Error('Failed to add stage')
      await loadStages()
      setAddingNew(false)
      setNewName('')
      setNewColor('#3b82f6')
    } catch (err) {
      console.error('Error adding stage:', err)
    } finally {
      setSaving(false)
    }
  }, [newName, newColor, loadStages])

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Back link */}
      <Link
        href="/settings"
        className="mb-6 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Retour aux parametres
      </Link>

      {/* Main card */}
      <Card>
        <CardHeader>
          <CardTitle>Etapes du pipeline</CardTitle>
          <CardDescription>
            Configurez les etapes de votre pipeline commercial. Glissez pour
            reordonner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Save confirmation */}
          {saveMessage && (
            <div className="flex items-center gap-2 rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600">
              <Check className="size-4" />
              {saveMessage}
            </div>
          )}

          {/* Sortable stage list */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={stages.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {stages.map((stage) => (
                  <SortableStageItem
                    key={stage.id}
                    stage={stage}
                    onRename={handleRename}
                    onColorChange={handleColorChange}
                    onDelete={handleDelete}
                    editingId={editingId}
                    editingName={editingName}
                    setEditingId={setEditingId}
                    setEditingName={setEditingName}
                    saving={saving}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Delete confirmation overlay */}
          {deletingStage && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="text-sm font-medium">
                      Supprimer &quot;{deletingStage.name}&quot;
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Cette etape contient {deletingStage.prospect_count}{' '}
                      prospect
                      {deletingStage.prospect_count > 1 ? 's' : ''}.
                      Deplacez-les vers :
                    </p>
                  </div>
                  <select
                    value={moveToSlug}
                    onChange={(e) => setMoveToSlug(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {stages
                      .filter((s) => s.id !== deletingStage.id)
                      .map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDeletingStage(null)
                        setMoveToSlug('')
                      }}
                    >
                      Annuler
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={confirmDelete}
                      disabled={saving || !moveToSlug}
                    >
                      {saving ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      Deplacer et supprimer
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Add new stage form */}
          {addingNew ? (
            <div className="flex items-center gap-3 rounded-lg border border-dashed p-3">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nom de l'etape"
                className="h-8 flex-1 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAdd()
                  if (e.key === 'Escape') {
                    setAddingNew(false)
                    setNewName('')
                  }
                }}
              />
              <div className="flex items-center gap-1">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(c)}
                    className={`size-5 rounded-full border-2 ${c === newColor ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={saving || !newName.trim()}
              >
                {saving ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
                Ajouter
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAddingNew(false)
                  setNewName('')
                  setNewColor('#3b82f6')
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setAddingNew(true)}
            >
              <Plus className="size-4" />
              Ajouter une etape
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
