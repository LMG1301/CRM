'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  pointerWithin,
  rectIntersection,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from '@dnd-kit/core'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PipelineStage, Prospect } from '@/lib/types'
import { updateProspect, deleteProspect, getDealGroupMembers } from '@/lib/actions'
import { Building2, GripVertical, Trash2, Search, X, Zap, CheckSquare } from 'lucide-react'
import { EnrollSequenceDialog } from '@/components/sequences/enroll-sequence-dialog'
import { DealGroupMoveDialog } from './deal-group-move-dialog'

// ─── Business Type Filter ───

type BusinessType = 'all' | 'france' | 'belgique' | 'services'

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  all: 'Tous',
  france: 'France',
  belgique: 'Belgique',
  services: 'Services',
}

// Belgium indicators
const BELGIQUE_INDICATORS = [
  'belgium', 'belgique', 'belgie', 'bruxelles', 'brussels', 'liege',
  'antwerp', 'gent', 'charleroi', '.be', 'luxembourg', '.lu',
]

// Services indicators (Boost services + food brand partners)
const SERVICES_INDICATORS = [
  'sodeb', 'bofrost', 'boosting', 'sodeboost', 'picard', 'fleury michon',
  'daunat', 'bonduelle', 'herta', 'labeyrie', 'charal', 'shape-eat',
]

function getBusinessType(prospect: Prospect): BusinessType {
  const company = (prospect.entreprise || '').toLowerCase()
  const country = (prospect.pays || '').toLowerCase()
  const location = (prospect.localisation || '').toLowerCase()
  const email = (prospect.email || '').toLowerCase()

  // Services (food partners + Boost services)
  if (SERVICES_INDICATORS.some(s => company.includes(s))) return 'services'
  if (company.includes('boost') && company.includes('service')) return 'services'

  // Belgique
  if (BELGIQUE_INDICATORS.some(ind => country.includes(ind) || location.includes(ind) || company.includes(ind) || email.includes(ind))) return 'belgique'

  // Default: France
  return 'france'
}

// ─── Types ───

interface KanbanBoardProps {
  stages: PipelineStage[]
  prospects: Prospect[]
}

// ─── Prospect Card Content (shared between real card and drag overlay) ───

interface ProspectCardContentProps {
  prospect: Prospect
  stageColor: string
  isDragging?: boolean
  isOverlay?: boolean
  onDelete?: (id: string) => void
  showDelete?: boolean
  dimmed?: boolean
  highlighted?: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}

function ProspectCardContent({
  prospect,
  stageColor,
  isDragging,
  isOverlay,
  onDelete,
  showDelete,
  dimmed,
  highlighted,
  selectionMode,
  isSelected,
  onToggleSelect,
}: ProspectCardContentProps) {
  const initials = (prospect.prenom?.[0] || '') + (prospect.nom?.[0] || '')

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-white/[0.08] bg-[#152c28] p-2.5 transition-all',
        isDragging && 'opacity-40',
        isOverlay && 'rotate-2 shadow-2xl shadow-black/50 ring-2 ring-white/20',
        !isDragging && !isOverlay && 'hover:border-white/20 hover:bg-[#1a332f]',
        dimmed && 'opacity-20 pointer-events-none',
        highlighted && 'ring-2 ring-brand-accent/60 border-brand-accent/40',
        isSelected && 'ring-2 ring-brand-accent border-brand-accent/50 bg-brand-accent/5'
      )}
    >
      {/* Left color accent bar */}
      <div
        className="absolute left-0 top-0 h-full w-[3px] rounded-l-lg"
        style={{ backgroundColor: stageColor }}
      />

      <div className="flex items-center gap-2.5 pl-1">
        {/* Selection checkbox */}
        {selectionMode && onToggleSelect && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
              onToggleSelect(prospect.id)
            }}
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              isSelected
                ? 'border-brand-accent bg-brand-accent text-white'
                : 'border-white/30 hover:border-white/50'
            )}
          >
            {isSelected && <CheckSquare className="h-3 w-3" />}
          </button>
        )}

        {/* Avatar initials */}
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: stageColor + '40' }}
        >
          {initials.toUpperCase() || '?'}
        </div>

        {/* Card body — name + company only */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {prospect.prenom} {prospect.nom}
          </p>
          {prospect.entreprise && (
            <div className="mt-0.5 flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0 text-white/30" />
              <p className="truncate text-xs text-white/40">
                {prospect.entreprise}
              </p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5">
          {showDelete && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onDelete(prospect.id)
              }}
              className="shrink-0 rounded p-0.5 text-white/20 opacity-0 transition-all hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/25 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
    </div>
  )
}

// ─── Draggable Prospect Card ───

function DraggableProspectCard({
  prospect,
  stageColor,
  onDelete,
  showDelete,
  dimmed,
  highlighted,
  selectionMode,
  isSelected,
  onToggleSelect,
}: {
  prospect: Prospect
  stageColor: string
  onDelete?: (id: string) => void
  showDelete?: boolean
  dimmed?: boolean
  highlighted?: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: prospect.id,
    data: {
      type: 'prospect',
      prospect,
    },
  })

  const handleClick = useCallback(() => {
    if (!isDragging) {
      if (selectionMode && onToggleSelect) {
        onToggleSelect(prospect.id)
      } else {
        router.push(`/prospects/${prospect.id}`)
      }
    }
  }, [router, prospect.id, isDragging, selectionMode, onToggleSelect])

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      <ProspectCardContent
        prospect={prospect}
        stageColor={stageColor}
        isDragging={isDragging}
        onDelete={onDelete}
        showDelete={showDelete}
        dimmed={dimmed}
        highlighted={highlighted}
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
    </div>
  )
}

// ─── Droppable Column (Desktop) ───

interface StageColumnProps {
  stage: PipelineStage
  prospects: Prospect[]
  isOver: boolean
  onDelete?: (id: string) => void
  showDelete?: boolean
  matchesSearch?: (p: Prospect) => boolean
  hasSearch?: boolean
  selectionMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

function StageColumn({ stage, prospects, isOver, onDelete, showDelete, matchesSearch, hasSearch, selectionMode, selectedIds, onToggleSelect }: StageColumnProps) {
  const { setNodeRef } = useDroppable({
    id: `column-${stage.slug}`,
    data: {
      type: 'column',
      stage,
    },
  })

  return (
    <div
      className={cn(
        'flex h-full w-[300px] shrink-0 flex-col rounded-xl border border-white/[0.06] bg-[#112220] transition-all duration-200',
        isOver && 'border-brand-accent/50 bg-[#142a27] ring-1 ring-brand-accent/20'
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="text-sm font-semibold text-white">{stage.name}</h3>
        </div>
        <Badge
          variant="secondary"
          className="h-5 min-w-[24px] justify-center px-1.5 text-xs tabular-nums"
        >
          {prospects.length}
        </Badge>
      </div>

      {/* Cards container */}
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-1 flex-col gap-2 overflow-y-auto p-2',
          isOver && 'bg-white/[0.02]'
        )}
      >
        {prospects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-xs text-white/25">Aucun prospect</p>
          </div>
        ) : (
          prospects.map((prospect) => {
            const matches = !hasSearch || !matchesSearch || matchesSearch(prospect)
            return (
              <DraggableProspectCard
                key={prospect.id}
                prospect={prospect}
                stageColor={stage.color}
                onDelete={onDelete}
                showDelete={showDelete}
                dimmed={hasSearch && !matches}
                highlighted={hasSearch && matches}
                selectionMode={selectionMode}
                isSelected={selectedIds?.has(prospect.id)}
                onToggleSelect={onToggleSelect}
              />
            )
          })
        )}
      </div>

      {/* Column footer */}
      <div className="border-t border-white/[0.06] px-4 py-2">
        <p className="text-[10px] text-white/25">
          {hasSearch && matchesSearch
            ? `${prospects.filter(matchesSearch).length}/${prospects.length}`
            : `${prospects.length} prospect${prospects.length !== 1 ? 's' : ''}`
          }
        </p>
      </div>
    </div>
  )
}

// ─── Mobile Stage Section (collapsible) ───

interface MobileStageSectionProps {
  stage: PipelineStage
  prospects: Prospect[]
  isOver: boolean
  onDelete?: (id: string) => void
  showDelete?: boolean
  matchesSearch?: (p: Prospect) => boolean
  hasSearch?: boolean
  selectionMode?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
}

function MobileStageSection({ stage, prospects, isOver, onDelete, showDelete, matchesSearch, hasSearch, selectionMode, selectedIds, onToggleSelect }: MobileStageSectionProps) {
  const [isExpanded, setIsExpanded] = useState(
    prospects.length > 0 && prospects.length <= 10
  )

  const { setNodeRef } = useDroppable({
    id: `column-${stage.slug}`,
    data: {
      type: 'column',
      stage,
    },
  })

  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.06] bg-[#112220] transition-colors',
        isOver && 'border-white/20 bg-[#142a27]'
      )}
    >
      {/* Header - tap to expand/collapse */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: stage.color }}
          />
          <h3 className="text-sm font-semibold text-white">{stage.name}</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="h-5 min-w-[24px] justify-center px-1.5 text-xs tabular-nums"
          >
            {prospects.length}
          </Badge>
          <svg
            className={cn(
              'h-4 w-4 text-white/30 transition-transform',
              isExpanded && 'rotate-180'
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Cards list */}
      {isExpanded && (
        <div
          ref={setNodeRef}
          className="flex flex-col gap-2 border-t border-white/[0.06] p-2"
        >
          {prospects.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-xs text-white/25">Aucun prospect</p>
            </div>
          ) : (
            prospects.map((prospect) => {
              const matches = !hasSearch || !matchesSearch || matchesSearch(prospect)
              return (
                <DraggableProspectCard
                  key={prospect.id}
                  prospect={prospect}
                  stageColor={stage.color}
                  onDelete={onDelete}
                  showDelete={showDelete}
                  dimmed={hasSearch && !matches}
                  highlighted={hasSearch && matches}
                  selectionMode={selectionMode}
                  isSelected={selectedIds?.has(prospect.id)}
                  onToggleSelect={onToggleSelect}
                />
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Kanban Board ───

// Custom collision: pointerWithin first (most intuitive), fallback to rectIntersection
const kanbanCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args)
  if (pointerCollisions.length > 0) return pointerCollisions
  return rectIntersection(args)
}

export function KanbanBoard({ stages, prospects: initialProspects }: KanbanBoardProps) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [activeProspect, setActiveProspect] = useState<Prospect | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [businessFilter, setBusinessFilter] = useState<BusinessType>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [sequenceDialogOpen, setSequenceDialogOpen] = useState(false)
  const [pendingMove, setPendingMove] = useState<{
    prospect: Prospect
    members: Prospect[]
    targetSlug: string
    targetStageName: string
    previousStage: string
  } | null>(null)

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectionMode(false)
  }, [])

  // Cmd/Ctrl+F opens pipeline search instead of browser search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('')
        searchInputRef.current?.blur()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchQuery])

  // Simple fuzzy search: case-insensitive includes on nom, prenom, entreprise
  const matchesSearch = useCallback((prospect: Prospect): boolean => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase().trim()
    const fields = [
      prospect.prenom,
      prospect.nom,
      prospect.entreprise,
      `${prospect.prenom} ${prospect.nom}`,
    ].filter(Boolean)
    return fields.some(f => f!.toLowerCase().includes(q))
  }, [searchQuery])

  // Configure drag sensors with activation constraints to avoid accidental drags
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  })
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 5,
    },
  })
  const sensors = useSensors(pointerSensor, touchSensor)

  // Filter prospects by business type then group by pipeline stage
  const filteredProspects = useMemo(() => {
    if (businessFilter === 'all') return prospects
    return prospects.filter(p => getBusinessType(p) === businessFilter)
  }, [prospects, businessFilter])

  // Group prospects by pipeline stage slug
  const prospectsByStage = useMemo(() => {
    const grouped: Record<string, Prospect[]> = {}
    for (const stage of stages) {
      grouped[stage.slug] = []
    }
    for (const prospect of filteredProspects) {
      const slug = prospect.pipeline_stage
      if (grouped[slug]) {
        grouped[slug].push(prospect)
      } else {
        // Unknown stage: assign to first column as fallback
        const firstStage = stages[0]
        if (firstStage) {
          grouped[firstStage.slug].push(prospect)
        }
      }
    }
    return grouped
  }, [filteredProspects, stages])

  // Resolve a droppable/draggable id to a column slug
  const findColumnSlug = useCallback(
    (id: string | number): string | null => {
      const idStr = String(id)
      if (idStr.startsWith('column-')) {
        return idStr.replace('column-', '')
      }
      // Must be a prospect id; find which stage it currently belongs to
      for (const stage of stages) {
        const stageProspects = prospectsByStage[stage.slug] || []
        if (stageProspects.some((p) => p.id === idStr)) {
          return stage.slug
        }
      }
      return null
    },
    [stages, prospectsByStage]
  )

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const prospect = prospects.find((p) => p.id === event.active.id)
      if (prospect) {
        setActiveProspect(prospect)
      }
    },
    [prospects]
  )

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { over } = event
      if (over) {
        const columnSlug = findColumnSlug(over.id)
        setOverId(columnSlug ? `column-${columnSlug}` : null)
      } else {
        setOverId(null)
      }
    },
    [findColumnSlug]
  )

  // Move a single prospect to a new stage (optimistic + persist)
  const executeMoveProspect = useCallback(
    async (prospectId: string, targetSlug: string, previousStage: string) => {
      // Optimistic update
      setProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? { ...p, pipeline_stage: targetSlug, updated_at: new Date().toISOString() }
            : p
        )
      )

      // Persist to database
      try {
        await updateProspect(prospectId, {
          pipeline_stage: targetSlug,
        })
      } catch (error) {
        // Revert on failure
        console.error('Failed to update prospect stage:', error)
        setProspects((prev) =>
          prev.map((p) =>
            p.id === prospectId
              ? { ...p, pipeline_stage: previousStage }
              : p
          )
        )
      }
    },
    []
  )

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event
      setActiveProspect(null)
      setOverId(null)

      if (!over) return

      const prospectId = String(active.id)
      const targetColumnSlug = findColumnSlug(over.id)
      if (!targetColumnSlug) return

      const currentProspect = prospects.find((p) => p.id === prospectId)
      if (!currentProspect) return
      if (currentProspect.pipeline_stage === targetColumnSlug) return

      // Check if prospect belongs to a deal group
      if (currentProspect.deal_group) {
        try {
          const members = await getDealGroupMembers(currentProspect.deal_group, currentProspect.id)
          if (members.length > 0) {
            const targetStage = stages.find(s => s.slug === targetColumnSlug)
            setPendingMove({
              prospect: currentProspect,
              members,
              targetSlug: targetColumnSlug,
              targetStageName: targetStage?.name || targetColumnSlug,
              previousStage: currentProspect.pipeline_stage,
            })
            return
          }
        } catch {
          // If fetch fails, proceed with single move
        }
      }

      // No deal group or no members: move directly
      executeMoveProspect(prospectId, targetColumnSlug, currentProspect.pipeline_stage)
    },
    [prospects, findColumnSlug, stages, executeMoveProspect]
  )

  const handleDealGroupMoveConfirm = useCallback(
    async (moveAll: boolean) => {
      if (!pendingMove) return

      const { prospect, members, targetSlug, previousStage } = pendingMove

      // Always move the dragged prospect
      executeMoveProspect(prospect.id, targetSlug, previousStage)

      // If moveAll, also move all group members
      if (moveAll) {
        for (const member of members) {
          if (member.pipeline_stage !== targetSlug) {
            executeMoveProspect(member.id, targetSlug, member.pipeline_stage)
          }
        }
      }

      setPendingMove(null)
    },
    [pendingMove, executeMoveProspect]
  )

  const handleDeleteProspect = useCallback(async (prospectId: string) => {
    const prospect = prospects.find(p => p.id === prospectId)
    if (!prospect) return
    const name = [prospect.prenom, prospect.nom].filter(Boolean).join(' ') || prospect.entreprise || 'ce prospect'
    if (!window.confirm(`Supprimer ${name} du pipeline ?`)) return

    // Optimistic removal
    setProspects(prev => prev.filter(p => p.id !== prospectId))

    try {
      await deleteProspect(prospectId)
    } catch (error) {
      console.error('Failed to delete prospect:', error)
      // Revert on failure
      setProspects(prev => [...prev, prospect])
    }
  }, [prospects])

  const handleDragCancel = useCallback(() => {
    setActiveProspect(null)
    setOverId(null)
  }, [])

  // Stage color for the drag overlay card
  const activeStageColor = useMemo(() => {
    if (!activeProspect) return '#6366f1'
    const stage = stages.find((s) => s.slug === activeProspect.pipeline_stage)
    return stage?.color || '#6366f1'
  }, [activeProspect, stages])

  const totalCount = filteredProspects.length

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-white">Pipeline</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {totalCount} prospect{totalCount !== 1 ? 's' : ''}{businessFilter !== 'all' ? ` (${BUSINESS_TYPE_LABELS[businessFilter]})` : ' au total'} &middot; {stages.length} etape{stages.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Search bar + Business type filter chips */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Rechercher un prospect... (Cmd+F)"
            className="h-8 w-64 rounded-lg border border-white/[0.08] bg-white/[0.04] pl-8 pr-8 text-xs text-white placeholder:text-white/30 focus:border-brand-accent/40 focus:outline-none focus:ring-1 focus:ring-brand-accent/20"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        {(Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[]).map((type) => (
          <button
            key={type}
            onClick={() => setBusinessFilter(type)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              businessFilter === type
                ? 'bg-brand-accent text-white'
                : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80'
            )}
          >
            {BUSINESS_TYPE_LABELS[type]}
          </button>
        ))}

        {/* Selection mode toggle */}
        <button
          onClick={() => {
            if (selectionMode) clearSelection()
            else setSelectionMode(true)
          }}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors',
            selectionMode
              ? 'bg-brand-accent text-white'
              : 'bg-white/[0.06] text-white/60 hover:bg-white/[0.1] hover:text-white/80'
          )}
        >
          <CheckSquare className="mr-1 inline-block h-3 w-3" />
          {selectionMode ? `${selectedIds.size} selectionnee${selectedIds.size !== 1 ? 's' : ''}` : 'Selectionner'}
        </button>

        {/* Search result count */}
        {searchQuery.trim() && (
          <span className="text-xs text-white/40">
            {filteredProspects.filter(matchesSearch).length} resultat{filteredProspects.filter(matchesSearch).length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* DnD context wrapping both desktop and mobile views */}
      <DndContext
        sensors={sensors}
        collisionDetection={kanbanCollision}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Desktop: horizontal scrolling columns */}
        <div className="hidden flex-1 md:block">
          <div className="flex h-[calc(100vh-200px)] gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <StageColumn
                key={stage.id}
                stage={stage}
                prospects={prospectsByStage[stage.slug] || []}
                isOver={overId === `column-${stage.slug}`}
                onDelete={handleDeleteProspect}
                showDelete
                matchesSearch={matchesSearch}
                hasSearch={!!searchQuery.trim()}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </div>

        {/* Mobile: vertically stacked collapsible sections */}
        <div className="flex flex-col gap-4 md:hidden">
          {stages.map((stage) => (
            <MobileStageSection
              key={stage.id}
              stage={stage}
              prospects={prospectsByStage[stage.slug] || []}
              isOver={overId === `column-${stage.slug}`}
              onDelete={handleDeleteProspect}
              showDelete
              matchesSearch={matchesSearch}
              hasSearch={!!searchQuery.trim()}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>

        {/* Drag overlay - follows the cursor */}
        <DragOverlay dropAnimation={null}>
          {activeProspect ? (
            <div className="w-[284px]">
              <ProspectCardContent
                prospect={activeProspect}
                stageColor={activeStageColor}
                isOverlay
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Bulk action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-white/[0.12] bg-[#112220] px-5 py-3 shadow-2xl shadow-black/50">
          <span className="text-sm font-medium text-white">
            {selectedIds.size} prospect{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setSequenceDialogOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-brand-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-accent/90 transition-colors"
          >
            <Zap className="h-3.5 w-3.5" />
            Inscrire en sequence
          </button>
          <button
            onClick={clearSelection}
            className="rounded-lg px-3 py-1.5 text-xs text-white/60 hover:text-white/90 transition-colors"
          >
            Annuler
          </button>
        </div>
      )}

      {/* Bulk enrollment dialog */}
      <EnrollSequenceDialog
        open={sequenceDialogOpen}
        onOpenChange={setSequenceDialogOpen}
        prospectIds={Array.from(selectedIds)}
        prospectName={`${selectedIds.size} prospects selectionnes`}
        onEnrolled={clearSelection}
      />

      {/* Deal group move dialog */}
      {pendingMove && (
        <DealGroupMoveDialog
          open={!!pendingMove}
          prospect={pendingMove.prospect}
          members={pendingMove.members}
          targetStageName={pendingMove.targetStageName}
          onConfirm={handleDealGroupMoveConfirm}
          onClose={() => {
            // If dismissed, move only the dragged prospect
            handleDealGroupMoveConfirm(false)
          }}
        />
      )}
    </div>
  )
}
