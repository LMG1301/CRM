'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Mail, Plus, Loader2, ChevronLeft, Pencil, Trash2, Eye, Save, X, BarChart3,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { RichTextEditor } from '@/components/emails/rich-text-editor'
import type { EmailTemplate } from '@/lib/types'

const CATEGORIES = [
  { value: 'prospection', label: 'Prospection' },
  { value: 'relance', label: 'Relance' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'devis', label: 'Devis / Offre' },
  { value: 'general', label: 'General' },
]

const EXAMPLE_VARIABLES: Record<string, string> = {
  prenom: 'Jean',
  nom: 'Dupont',
  entreprise: 'ACME Corp',
  fonction: 'Directeur Commercial',
  produit: 'ScreenKit',
}

function substituteVariables(html: string, vars: Record<string, string>): string {
  let result = html
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), val)
  }
  return result
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [loading, setLoading] = useState(true)

  // Editor state
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<string | null>(null) // null = new template
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyHtml, setBodyHtml] = useState('')
  const [category, setCategory] = useState('general')
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/email-templates')
      const data = await res.json()
      if (Array.isArray(data)) setTemplates(data)
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { loadTemplates() }, [])

  const resetEditor = () => {
    setEditing(false)
    setEditId(null)
    setName('')
    setSubject('')
    setBodyHtml('')
    setCategory('general')
    setPreview(false)
  }

  const openNew = () => {
    resetEditor()
    setEditing(true)
  }

  const openEdit = (t: EmailTemplate) => {
    setEditId(t.id)
    setName(t.name)
    setSubject(t.subject)
    setBodyHtml(t.body_html)
    setCategory(t.category)
    setPreview(false)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!name.trim() || !subject.trim() || !bodyHtml.trim()) return
    setSaving(true)
    try {
      // Extract variables from body and subject
      const allText = subject + ' ' + bodyHtml
      const vars = Array.from(allText.matchAll(/\{(\w+)\}/g)).map(m => m[1])
      const uniqueVars = [...new Set(vars)]

      if (editId) {
        await fetch(`/api/email-templates/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, subject, body_html: bodyHtml, category, variables: uniqueVars }),
        })
      } else {
        await fetch('/api/email-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, subject, body_html: bodyHtml, category, variables: uniqueVars }),
        })
      }
      await loadTemplates()
      resetEditor()
    } catch { /* ignore */ }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    try {
      await fetch(`/api/email-templates/${id}`, { method: 'DELETE' })
      await loadTemplates()
    } catch { /* ignore */ }
    setDeleting(null)
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
              <Mail className="size-6" />
              Templates email
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Creez et gerez vos modeles d&apos;email. Variables disponibles : {'{prenom}'}, {'{nom}'}, {'{entreprise}'}, {'{fonction}'}, {'{produit}'}.
            </p>
          </div>
          {!editing && (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              Nouveau
            </Button>
          )}
        </div>
      </div>

      {/* Editor */}
      {editing && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">
              {editId ? 'Modifier le template' : 'Nouveau template'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tpl-name">Nom du template</Label>
                <Input
                  id="tpl-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Premier contact - DA"
                />
              </div>
              <div>
                <Label htmlFor="tpl-cat">Categorie</Label>
                <select
                  id="tpl-cat"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <Label htmlFor="tpl-subject">Objet</Label>
              <Input
                id="tpl-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="{entreprise} x Boost Inc. - Optimisation de votre parc DA"
              />
            </div>

            <div>
              <Label>Corps du message</Label>
              {preview ? (
                <div className="mt-1">
                  <div className="rounded-md border p-4 text-sm">
                    <p className="mb-2 text-xs text-muted-foreground">
                      Objet : {substituteVariables(subject, EXAMPLE_VARIABLES)}
                    </p>
                    <div
                      className="prose prose-sm max-w-none dark:prose-invert"
                      dangerouslySetInnerHTML={{ __html: substituteVariables(bodyHtml, EXAMPLE_VARIABLES) }}
                    />
                  </div>
                </div>
              ) : (
                <RichTextEditor
                  value={bodyHtml}
                  onChange={setBodyHtml}
                  placeholder="Bonjour {prenom},&#10;&#10;Je me permets de vous contacter..."
                />
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPreview(!preview)}>
                  <Eye className="size-4" />
                  {preview ? 'Editer' : 'Apercu'}
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetEditor}>
                  <X className="size-4" />
                  Annuler
                </Button>
                <Button size="sm" onClick={handleSave} disabled={saving || !name.trim() || !subject.trim()}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Sauvegarder
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Template List */}
      {templates.length === 0 && !editing ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="mx-auto mb-3 size-10 text-muted-foreground/50" />
            <p className="text-sm font-medium text-muted-foreground">Aucun template</p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              Creez votre premier template pour accelerer la redaction de vos emails.
            </p>
            <Button className="mt-4" onClick={openNew}>
              <Plus className="size-4" />
              Creer un template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {templates.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      {CATEGORIES.find(c => c.value === t.category)?.label || t.category}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">
                    Objet : {t.subject}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BarChart3 className="size-3" />
                      {t.usage_count} utilisation{t.usage_count !== 1 ? 's' : ''}
                    </span>
                    {t.variables?.length > 0 && (
                      <span>
                        Variables : {t.variables.map(v => `{${v}}`).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => openEdit(t)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-red-400 hover:text-red-300"
                    onClick={() => handleDelete(t.id)}
                    disabled={deleting === t.id}
                  >
                    {deleting === t.id ? (
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
