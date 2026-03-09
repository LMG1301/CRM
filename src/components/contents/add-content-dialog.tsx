'use client'

import { useState, useEffect } from 'react'
import { Loader2, Sparkles, X, Globe, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
import type { Content, ContentType, FunnelLevel } from '@/lib/types'
import { CONTENT_TYPES, FUNNEL_LEVELS } from '@/lib/types'

interface AddContentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  content: Content | null
  onSaved: (content: Content) => void
}

export function AddContentDialog({
  open,
  onOpenChange,
  content,
  onSaved,
}: AddContentDialogProps) {
  const isEditing = !!content

  const [title, setTitle] = useState('')
  const [contentType, setContentType] = useState<ContentType>('post_linkedin')
  const [url, setUrl] = useState('')
  const [body, setBody] = useState('')
  const [funnelLevel, setFunnelLevel] = useState<FunnelLevel | ''>('')
  const [themes, setThemes] = useState<string[]>([])
  const [products, setProducts] = useState<string[]>([])
  const [pipelineStages, setPipelineStages] = useState<string[]>([])
  const [targetSectors, setTargetSectors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [tagging, setTagging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [bodyFromScrape, setBodyFromScrape] = useState(false)

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      if (content) {
        setTitle(content.title)
        setContentType(content.content_type)
        setUrl(content.url || '')
        setBody(content.body || '')
        setFunnelLevel(content.funnel_level || '')
        setThemes(content.themes || [])
        setProducts(content.products || [])
        setPipelineStages(content.pipeline_stages || [])
        setTargetSectors(content.target_sectors || [])
        setBodyFromScrape(false)
      } else {
        setTitle('')
        setContentType('post_linkedin')
        setUrl('')
        setBody('')
        setFunnelLevel('')
        setThemes([])
        setProducts([])
        setPipelineStages([])
        setTargetSectors([])
        setBodyFromScrape(false)
      }
      setTagInput('')
      setImportUrl('')
    }
  }, [open, content])

  const handleAutoTag = async () => {
    if (!title) return
    setTagging(true)
    try {
      const res = await fetch('/api/ai/tag-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body, content_type: contentType, url: url || undefined }),
      })
      if (res.ok) {
        const tags = await res.json()
        if (tags.themes?.length) setThemes(tags.themes)
        if (tags.products?.length) setProducts(tags.products)
        if (tags.pipeline_stages?.length) setPipelineStages(tags.pipeline_stages)
        if (tags.target_sectors?.length) setTargetSectors(tags.target_sectors)
        if (tags.funnel_level) setFunnelLevel(tags.funnel_level)
      }
    } finally {
      setTagging(false)
    }
  }

  const handleImportUrl = async () => {
    if (!importUrl.trim()) return
    setImporting(true)
    try {
      const res = await fetch('/api/ai/summarize-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.title) setTitle(data.title)
        if (data.summary) {
          setBody(data.summary)
          setBodyFromScrape(true)
        }
        if (data.url) setUrl(data.url)
        if (data.themes?.length) setThemes(data.themes)
        if (data.products?.length) setProducts(data.products)
      }
    } finally {
      setImporting(false)
    }
  }

  const handleSave = async () => {
    if (!title) return
    setSaving(true)
    try {
      const payload = {
        title,
        content_type: contentType,
        url: url || null,
        body: body || null,
        themes,
        products,
        pipeline_stages: pipelineStages,
        target_sectors: targetSectors,
        funnel_level: funnelLevel || null,
      }

      const endpoint = isEditing ? '/api/contents' : '/api/contents'
      const method = isEditing ? 'PUT' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEditing ? { id: content.id, ...payload } : payload),
      })

      if (res.ok) {
        const saved = await res.json()
        onSaved(saved)
      }
    } finally {
      setSaving(false)
    }
  }

  const removeTag = (list: string[], setter: (v: string[]) => void, value: string) => {
    setter(list.filter(t => t !== value))
  }

  const addThemeTag = () => {
    const tag = tagInput.trim().toLowerCase().replace(/\s+/g, '_')
    if (tag && !themes.includes(tag)) {
      setThemes([...themes, tag])
    }
    setTagInput('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Modifier le contenu' : 'Ajouter un contenu'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* URL Import */}
          {!isEditing && (
            <div className="flex gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.02] p-3">
              <div className="flex-1">
                <Input
                  value={importUrl}
                  onChange={e => setImportUrl(e.target.value)}
                  placeholder="Coller une URL pour importer automatiquement..."
                  className="h-9 text-sm"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleImportUrl() } }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleImportUrl}
                disabled={!importUrl.trim() || importing}
                className="h-9 gap-2"
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                Importer
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <Label>Titre *</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Ex: Comment la telemetrie reduit les couts de 30%"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={contentType} onValueChange={v => setContentType(v as ContentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONTENT_TYPES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Texte complet du post</Label>
            <Textarea
              value={body}
              onChange={e => { setBody(e.target.value); setBodyFromScrape(false) }}
              placeholder="Collez ici le texte complet du post LinkedIn. Note : le scraping automatique ne recupere souvent qu'un extrait tronque — collez le texte manuellement pour de meilleurs resultats IA."
              rows={8}
              className="min-h-[180px]"
            />
            {bodyFromScrape && body.length > 0 && body.length < 500 && (
              <div className="flex items-start gap-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 px-3 py-2 text-xs text-yellow-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-400" />
                <span>
                  Le texte importe semble tronque ({body.length} caracteres). Pour de meilleurs tags IA, collez le texte complet du post LinkedIn manuellement.
                </span>
              </div>
            )}
          </div>

          {/* Funnel Level */}
          <div className="space-y-2">
            <Label>Niveau funnel</Label>
            <Select value={funnelLevel} onValueChange={v => setFunnelLevel(v as FunnelLevel)}>
              <SelectTrigger>
                <SelectValue placeholder="Selectionner un niveau..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FUNNEL_LEVELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Auto-tag button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoTag}
            disabled={!title || tagging}
            className="gap-2"
          >
            {tagging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Auto-tagger IA
          </Button>

          {/* Tags display */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Themes</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {themes.map(t => (
                  <Badge key={t} variant="outline" className="gap-1 text-[10px]">
                    {t.replace(/_/g, ' ')}
                    <button onClick={() => removeTag(themes, setThemes, t)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addThemeTag() } }}
                    placeholder="+ theme"
                    className="h-6 w-24 text-[10px]"
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Produits</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {products.map(t => (
                  <Badge key={t} variant="outline" className="gap-1 text-[10px]">
                    {t.replace(/_/g, ' ')}
                    <button onClick={() => removeTag(products, setProducts, t)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Stages pipeline</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {pipelineStages.map(t => (
                  <Badge key={t} variant="outline" className="gap-1 text-[10px]">
                    {t.replace(/_/g, ' ')}
                    <button onClick={() => removeTag(pipelineStages, setPipelineStages, t)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">Secteurs cibles</Label>
              <div className="mt-1 flex flex-wrap gap-1">
                {targetSectors.map(t => (
                  <Badge key={t} variant="outline" className="gap-1 text-[10px]">
                    {t.replace(/_/g, ' ')}
                    <button onClick={() => removeTag(targetSectors, setTargetSectors, t)}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={!title || saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Mettre a jour' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
