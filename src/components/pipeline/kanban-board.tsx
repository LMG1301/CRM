'use client'

import { useState, useMemo, useCallback, useRef } from 'react'
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
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { PipelineStage, Prospect } from '@/lib/types'
import { updateProspect } from '@/lib/actions'
import { Building2, Clock, GripVertical } from 'lucide-react'

// ─── Business Type Filter ───

type BusinessType = 'all' | 'da_france' | 'partenariats_food' | 'services' | 'international'

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  all: 'Tous',
  da_france: 'DA France',
  partenariats_food: 'Partenariats Food',
  services: 'Services',
  international: 'International',
}

// Food brand partners
const FOOD_PARTNERS = [
  'sodeb', 'bofrost', 'boosting', 'sodeboost', 'picard', 'fleury michon',
  'daunat', 'bonduelle', 'herta', 'labeyrie', 'charal',
]

// International indicators
const INTERNATIONAL_INDICATORS = [
  'switzerland', 'suisse', 'schweiz', 'uk', 'united kingdom', 'germany',
  'deutschland', 'spain', 'italia', 'belgium', 'belgique',
]

function getBusinessType(prospect: Prospect): BusinessType {
  const company = (prospect.entreprise || '').toLowerCase()
  const country = (prospect.pays || '').toLowerCase()
  const location = (prospect.localisation || '').toLowerCase()

  // Food partners
  if (FOOD_PARTNERS.some(fp => company.includes(fp))) return 'partenariats_food'

  // International
  if (country && !['france', 'fr', ''].includes(country)) return 'international'
  if (INTERNATIONAL_INDICATORS.some(ind => location.includes(ind) || company.includes(ind))) return 'international'

  // Services (Boost inc Services related)
  if (company.includes('boost') && company.includes('service')) return 'services'

  // Default: DA France
  return 'da_france'
}

// ─── Types ───

interface KanbanBoardProps {
  stages: PipelineStage[]
  prospects: Prospect[]
}

// ─── Utilities ───

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null
  const then = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - then.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function formatDaysSince(days: number | null): string {
  if (days === null) return 'Jamais contacte'
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  return `Il y a ${days}j`
}

function getDaysColor(days: number | null): string {
  if (days === null) return 'text-white/30'
  if (days <= 3) return 'text-emerald-400'
  if (days <= 7) return 'text-amber-400'
  if (days <= 14) return 'text-orange-400'
  return 'text-red-400'
}

// ─── Prospect Card Content (shared between real card and drag overlay) ───

interface ProspectCardContentProps {
  prospect: Prospect
  stageColor: string
  isDragging?: boolean
  isOverlay?: boolean
}

function ProspectCardContent({
  prospect,
  stageColor,
  isDragging,
  isOverlay,
}: ProspectCardContentProps) {
  const days = daysSince(prospect.date_dernier_contact)
  const daysText = formatDaysSince(days)
  const daysColor = getDaysColor(days)
  const initials = (prospect.prenom?.[0] || '') + (prospect.nom?.[0] || '')

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-white/[0.08] bg-[#152c28] p-3 transition-all',
        isDragging && 'opacity-40',
        isOverlay && 'rotate-2 shadow-2xl shadow-black/50 ring-2 ring-white/20',
        !isDragging && !isOverlay && 'hover:border-white/20 hover:bg-[#1a332f]'
      )}
    >
      {/* Left color accent bar */}
      <div
        className="absolute left-0 top-0 h-full w-[3px] rounded-l-lg"
        style={{ backgroundColor: stageColor }}
      />

      <div className="flex items-start gap-3 pl-1">
        {/* Avatar initials */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: stageColor + '40' }}
        >
          {initials.toUpperCase() || '?'}
        </div>

        {/* Card body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-white">
              {prospect.prenom} {prospect.nom}
            </p>
            <GripVertical className="h-3.5 w-3.5 shrink-0 text-white/25 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>

          {prospect.entreprise && (
            <div className="mt-1 flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-white/30" />
              <p className="truncate text-xs text-white/40">
                {prospect.entreprise}
              </p>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between">
            <div className={cn('flex items-center gap-1.5 text-xs', daysColor)}>
              <Clock className="h-3 w-3" />
              <span>{daysText}</span>
            </div>

            {prospect.source && (
              <Badge
                variant="secondary"
                className="h-5 max-w-[80px] truncate px-1.5 text-[10px]"
              >
                {prospect.source}
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Draggable Prospect Card ───

function DraggableProspectCard({
  prospect,
  stageColor,
}: {
  prospect: Prospect
  stageColor: string
}) {
  const router = useRouter()
  const didDrag = useRef(false)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: prospect.id,
    data: {
      type: 'prospect',
      prospect,
    },
  })

  // Track if a drag actually happened
  if (isDragging) {
    didDrag.current = true
  }

  const handlePointerUp = useCallback(() => {
    // Small delay to let drag end settle first
    requestAnimationFrame(() => {
      if (!didDrag.current) {
        router.push(`/prospects/${prospect.id}`)
      }
      didDrag.current = false
    })
  }, [router, prospect.id])

  const handlePointerDown = useCallback(() => {
    didDrag.current = false
  }, [])

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        handlePointerDown()
        // Call dnd-kit's onPointerDown
        listeners?.onPointerDown?.(e as never)
      }}
      onPointerUp={handlePointerUp}
      style={{ cursor: isDragging ? 'grabbing' : 'pointer' }}
    >
      <ProspectCardContent
        prospect={prospect}
        stageColor={stageColor}
        isDragging={isDragging}
      />
    </div>
  )
}

// ─── Droppable Column (Desktop) ───

interface StageColumnProps {
  stage: PipelineStage
  prospects: Prospect[]
  isOver: boolean
}

function StageColumn({ stage, prospects, isOver }: StageColumnProps) {
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
        'flex h-full w-[300px] shrink-0 flex-col rounded-xl border border-white/[0.06] bg-[#112220] transition-colors',
        isOver && 'border-white/20 bg-[#142a27]'
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
          prospects.map((prospect) => (
            <DraggableProspectCard
              key={prospect.id}
              prospect={prospect}
              stageColor={stage.color}
            />
          ))
        )}
      </div>

      {/* Column footer */}
      <div className="border-t border-white/[0.06] px-4 py-2">
        <p className="text-[10px] text-white/25">
          {prospects.length} prospect{prospects.length !== 1 ? 's' : ''}
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
}

function MobileStageSection({ stage, prospects, isOver }: MobileStageSectionProps) {
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
            prospects.map((prospect) => (
              <DraggableProspectCard
                key={prospect.id}
                prospect={prospect}
                stageColor={stage.color}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ─── Main Kanban Board ───

export function KanbanBoard({ stages, prospects: initialProspects }: KanbanBoardProps) {
  const [prospects, setProspects] = useState<Prospect[]>(initialProspects)
  const [activeProspect, setActiveProspect] = useState<Prospect | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [businessFilter, setBusinessFilter] = useState<BusinessType>('all')

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

      const previousStage = currentProspect.pipeline_stage

      // Optimistic update
      setProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId
            ? { ...p, pipeline_stage: targetColumnSlug, updated_at: new Date().toISOString() }
            : p
        )
      )

      // Persist to database
      try {
        await updateProspect(prospectId, {
          pipeline_stage: targetColumnSlug,
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
    [prospects, findColumnSlug]
  )

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

      {/* Business type filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
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
      </div>

      {/* DnD context wrapping both desktop and mobile views */}
      <DndContext
        sensors={sensors}
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
    </div>
  )
}
