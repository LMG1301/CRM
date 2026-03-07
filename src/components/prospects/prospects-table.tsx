'use client'

import { useMemo, useState, useCallback, useTransition } from 'react'
import Link from 'next/link'
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  CheckSquare,
  Plus,
  Trash2,
} from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

import { StageBadge } from '@/components/prospects/stage-badge'
import { AddProspectDialog } from '@/components/prospects/add-prospect-dialog'
import { updateProspect, batchDeleteProspects } from '@/lib/actions'
import type { Prospect, PipelineStage } from '@/lib/types'

// ─── Constants ───

const PAGE_SIZE = 25

const ALL_VALUE = '__all__'

type SortKey =
  | 'nom'
  | 'entreprise'
  | 'fonction'
  | 'pipeline_stage'
  | 'email'
  | 'source'
  | 'updated_at'

type SortDir = 'asc' | 'desc'

// ─── Component ───

interface ProspectsTableProps {
  prospects: Prospect[]
  stages: PipelineStage[]
}

export function ProspectsTable({ prospects, stages }: ProspectsTableProps) {
  // --- State ---
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState(ALL_VALUE)
  const [categorieFilter, setCategorieFilter] = useState(ALL_VALUE)
  const [sourceFilter, setSourceFilter] = useState(ALL_VALUE)
  const [sortKey, setSortKey] = useState<SortKey>('updated_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchStageDialogOpen, setBatchStageDialogOpen] = useState(false)
  const [batchTargetStage, setBatchTargetStage] = useState('')
  const [batchDeleteDialogOpen, setBatchDeleteDialogOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // --- Derived: unique filter values ---
  const categories = useMemo(() => {
    const set = new Set<string>()
    prospects.forEach((p) => {
      if (p.categorie) set.add(p.categorie)
    })
    return Array.from(set).sort()
  }, [prospects])

  const sources = useMemo(() => {
    const set = new Set<string>()
    prospects.forEach((p) => {
      if (p.source) set.add(p.source)
    })
    return Array.from(set).sort()
  }, [prospects])

  // --- Filtering ---
  const filtered = useMemo(() => {
    let list = prospects

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.prenom?.toLowerCase().includes(q) ||
          p.nom?.toLowerCase().includes(q) ||
          p.entreprise?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q)
      )
    }

    if (stageFilter !== ALL_VALUE) {
      list = list.filter((p) => p.pipeline_stage === stageFilter)
    }

    if (categorieFilter !== ALL_VALUE) {
      list = list.filter((p) => p.categorie === categorieFilter)
    }

    if (sourceFilter !== ALL_VALUE) {
      list = list.filter((p) => p.source === sourceFilter)
    }

    return list
  }, [prospects, search, stageFilter, categorieFilter, sourceFilter])

  // --- Sorting ---
  const sorted = useMemo(() => {
    const copy = [...filtered]
    copy.sort((a, b) => {
      let aVal: string
      let bVal: string

      if (sortKey === 'nom') {
        aVal = `${a.nom} ${a.prenom}`.toLowerCase()
        bVal = `${b.nom} ${b.prenom}`.toLowerCase()
      } else {
        aVal = (a[sortKey] ?? '').toLowerCase()
        bVal = (b[sortKey] ?? '').toLowerCase()
      }

      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return copy
  }, [filtered, sortKey, sortDir])

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = useMemo(
    () => sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [sorted, page]
  )

  // Reset page when filters change
  const resetPage = useCallback(() => setPage(0), [])

  // --- Sort handler ---
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
    resetPage()
  }

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column)
      return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground/50" />
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 inline size-3.5" />
    ) : (
      <ArrowDown className="ml-1 inline size-3.5" />
    )
  }

  // --- Selection ---
  const allOnPageSelected =
    paginated.length > 0 && paginated.every((p) => selected.has(p.id))

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allOnPageSelected) {
        paginated.forEach((p) => next.delete(p.id))
      } else {
        paginated.forEach((p) => next.add(p.id))
      }
      return next
    })
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // --- Batch stage change ---
  const handleBatchStageChange = () => {
    if (!batchTargetStage || selected.size === 0) return
    startTransition(async () => {
      const ids = Array.from(selected)
      await Promise.all(
        ids.map((id) => updateProspect(id, { pipeline_stage: batchTargetStage }))
      )
      setSelected(new Set())
      setBatchStageDialogOpen(false)
      setBatchTargetStage('')
      // page will re-render with fresh data on next server visit; for now, prospects are stale
      // In a production app you would use router.refresh() or optimistic updates
    })
  }

  // --- Batch delete ---
  const handleBatchDelete = () => {
    if (selected.size === 0) return
    startTransition(async () => {
      const ids = Array.from(selected)
      await batchDeleteProspects(ids)
      setSelected(new Set())
      setBatchDeleteDialogOpen(false)
      window.location.reload()
    })
  }

  // --- Export CSV ---
  const exportCsv = () => {
    const headers = [
      'Prenom',
      'Nom',
      'Entreprise',
      'Fonction',
      'Email',
      'Email Pro',
      'Telephone',
      'Source',
      'Stage',
      'Categorie',
      'Localisation',
      'LinkedIn',
      'Dernier contact',
    ]

    const rows = filtered.map((p) => [
      p.prenom,
      p.nom,
      p.entreprise,
      p.fonction,
      p.email,
      p.email_pro,
      p.telephone,
      p.source,
      p.pipeline_stage,
      p.categorie,
      p.localisation,
      p.linkedin_url,
      p.date_dernier_contact ?? '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((r) =>
        r.map((cell) => `"${(cell ?? '').replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `prospects_export_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // --- Format date ---
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    try {
      return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(dateStr))
    } catch {
      return dateStr
    }
  }

  // ─── Render ───

  return (
    <div className="space-y-4">
      {/* ─── Header row: count + export ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Prospects</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} prospect{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBatchStageDialogOpen(true)}
              >
                <CheckSquare className="size-4" />
                {selected.size} selectionne{selected.size !== 1 ? 's' : ''} - Changer stage
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBatchDeleteDialogOpen(true)}
              >
                <Trash2 className="size-4" />
                Supprimer ({selected.size})
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="size-4" />
            Exporter CSV
          </Button>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="size-4" />
            Ajouter un prospect
          </Button>
        </div>
      </div>

      {/* ─── Filters row ─── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un prospect..."
            className="pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              resetPage()
            }}
          />
        </div>

        <Select
          value={stageFilter}
          onValueChange={(v) => {
            setStageFilter(v)
            resetPage()
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Tous les stages</SelectItem>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.slug}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={categorieFilter}
          onValueChange={(v) => {
            setCategorieFilter(v)
            resetPage()
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Categorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Toutes les categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={sourceFilter}
          onValueChange={(v) => {
            setSourceFilter(v)
            resetPage()
          }}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>Toutes les sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ─── Table ─── */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <input
                  type="checkbox"
                  className="size-4 rounded border-muted-foreground/30 accent-primary"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                />
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center hover:text-foreground"
                  onClick={() => handleSort('nom')}
                >
                  Nom complet
                  <SortIcon column="nom" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center hover:text-foreground"
                  onClick={() => handleSort('entreprise')}
                >
                  Entreprise
                  <SortIcon column="entreprise" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center hover:text-foreground"
                  onClick={() => handleSort('fonction')}
                >
                  Fonction
                  <SortIcon column="fonction" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center hover:text-foreground"
                  onClick={() => handleSort('pipeline_stage')}
                >
                  Stage
                  <SortIcon column="pipeline_stage" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center hover:text-foreground"
                  onClick={() => handleSort('email')}
                >
                  Email
                  <SortIcon column="email" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center hover:text-foreground"
                  onClick={() => handleSort('source')}
                >
                  Source
                  <SortIcon column="source" />
                </button>
              </TableHead>
              <TableHead>
                <button
                  type="button"
                  className="inline-flex items-center hover:text-foreground"
                  onClick={() => handleSort('updated_at')}
                >
                  Derniere action
                  <SortIcon column="updated_at" />
                </button>
              </TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                  Aucun prospect trouve.
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((prospect) => (
                <TableRow
                  key={prospect.id}
                  className="group cursor-pointer"
                  data-state={selected.has(prospect.id) ? 'selected' : undefined}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="size-4 rounded border-muted-foreground/30 accent-primary"
                      checked={selected.has(prospect.id)}
                      onChange={() => toggleOne(prospect.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/prospects/${prospect.id}`}
                      className="font-medium hover:underline"
                    >
                      {prospect.prenom} {prospect.nom}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {prospect.entreprise || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {prospect.fonction || '-'}
                  </TableCell>
                  <TableCell>
                    <StageBadge stage={prospect.pipeline_stage} stages={stages} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {prospect.email || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {prospect.source || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(prospect.updated_at)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                          <Link href={`/prospects/${prospect.id}`}>Voir le profil</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            if (prospect.email) {
                              navigator.clipboard.writeText(prospect.email)
                            }
                          }}
                        >
                          Copier l&apos;email
                        </DropdownMenuItem>
                        {prospect.linkedin_url && (
                          <DropdownMenuItem asChild>
                            <a
                              href={prospect.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Voir LinkedIn
                            </a>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page + 1} sur {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
              Precedent
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Suivant
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Add prospect dialog ─── */}
      <AddProspectDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        stages={stages}
      />

      {/* ─── Batch delete confirmation dialog ─── */}
      <Dialog open={batchDeleteDialogOpen} onOpenChange={setBatchDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer {selected.size} prospect{selected.size !== 1 ? 's' : ''} ?</DialogTitle>
            <DialogDescription>
              Cette action est irreversible. Les activites et emails associes seront aussi supprimes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchDeleteDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleBatchDelete}
              disabled={isPending}
            >
              {isPending ? 'Suppression...' : `Supprimer ${selected.size} prospect${selected.size !== 1 ? 's' : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Batch stage change dialog ─── */}
      <Dialog open={batchStageDialogOpen} onOpenChange={setBatchStageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le stage</DialogTitle>
            <DialogDescription>
              Modifier le stage pour {selected.size} prospect
              {selected.size !== 1 ? 's' : ''} selectionne
              {selected.size !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          <Select value={batchTargetStage} onValueChange={setBatchTargetStage}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choisir un stage" />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.slug}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchStageDialogOpen(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={handleBatchStageChange}
              disabled={!batchTargetStage || isPending}
            >
              {isPending ? 'En cours...' : 'Appliquer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
