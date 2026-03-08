'use client'

import { useState } from 'react'
import { Plus, Search, Trash2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { AddContentDialog } from './add-content-dialog'
import type { Content, ContentType } from '@/lib/types'
import { CONTENT_TYPES } from '@/lib/types'

const TYPE_COLORS: Record<ContentType, string> = {
  post_linkedin: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  article: 'bg-green-500/20 text-green-400 border-green-500/30',
  case_study: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  video: 'bg-red-500/20 text-red-400 border-red-500/30',
  infographie: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  temoignage: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
}

interface ContentLibraryProps {
  initialContents: Content[]
}

export function ContentLibrary({ initialContents }: ContentLibraryProps) {
  const [contents, setContents] = useState<Content[]>(initialContents)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingContent, setEditingContent] = useState<Content | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const filtered = contents.filter(c => {
    const matchesSearch = !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      (c.body || '').toLowerCase().includes(search.toLowerCase())
    const matchesType = typeFilter === 'all' || c.content_type === typeFilter
    return matchesSearch && matchesType
  })

  const handleSaved = (content: Content) => {
    setContents(prev => {
      const exists = prev.find(c => c.id === content.id)
      if (exists) {
        return prev.map(c => c.id === content.id ? content : c)
      }
      return [content, ...prev]
    })
    setDialogOpen(false)
    setEditingContent(null)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      const res = await fetch('/api/contents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setContents(prev => prev.filter(c => c.id !== id))
      }
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(CONTENT_TYPES).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => { setEditingContent(null); setDialogOpen(true) }}>
          <Plus className="mr-2 h-4 w-4" />
          Ajouter un contenu
        </Button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {contents.length === 0
              ? 'Aucun contenu. Ajoutez votre premier contenu LinkedIn ou article.'
              : 'Aucun resultat pour cette recherche.'}
          </p>
          {contents.length === 0 && (
            <Button variant="outline" className="mt-4" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter un contenu
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-white/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Titre</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Themes</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(content => (
                <TableRow
                  key={content.id}
                  className="cursor-pointer hover:bg-white/[0.02]"
                  onClick={() => { setEditingContent(content); setDialogOpen(true) }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{content.title}</span>
                      {content.url && (
                        <a
                          href={content.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={TYPE_COLORS[content.content_type]}>
                      {CONTENT_TYPES[content.content_type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(content.themes || []).slice(0, 3).map(t => (
                        <Badge key={t} variant="outline" className="text-[10px]">
                          {t.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                      {(content.themes || []).length > 3 && (
                        <Badge variant="outline" className="text-[10px]">
                          +{content.themes.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(content.created_at).toLocaleDateString('fr-FR')}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={e => { e.stopPropagation(); handleDelete(content.id) }}
                      disabled={deleting === content.id}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AddContentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        content={editingContent}
        onSaved={handleSaved}
      />
    </>
  )
}
