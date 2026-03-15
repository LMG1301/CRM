'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, Save, Loader2, Building2, Package, Target, Palette, Mail, Linkedin, FileText, Upload, ExternalLink, FileSpreadsheet, Presentation, File, BrainCircuit, Search, ChevronLeft, ChevronRight, ChevronDown, Trash2, RefreshCw, Zap, BookOpen, X, Link2, Layers, MessageSquare } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { BusinessContext } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { ConnectionsPanel } from '@/components/settings/connections-panel'

interface SyncedDocument {
  id: string
  drive_file_id: string | null
  name: string
  mime_type: string | null
  folder_path: string | null
  url: string | null
  last_modified: string | null
  synced_at: string | null
  source?: string | null
  file_size?: number | null
}

interface UsagePeriod {
  calls: number
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
}

interface UsageStats {
  today: UsagePeriod | null
  week: UsagePeriod | null
  month: UsagePeriod | null
  byModel: Record<string, { calls: number; cost: number }>
  byEndpoint: Record<string, { calls: number; cost: number }>
  budget: { limit: number; warning: number; current: number } | null
  error: string | null
}

// ─── Accordion Section ───

function AccordionSection({
  title,
  icon,
  preview,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ReactNode
  preview?: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
      >
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />
        <span className="flex items-center gap-2 text-sm font-medium">
          {icon}
          {title}
        </span>
        {!open && preview && (
          <span className="ml-auto truncate text-xs text-muted-foreground max-w-[50%]">
            {preview}
          </span>
        )}
      </button>
      {open && <div className="border-t px-4 py-4 space-y-4">{children}</div>}
    </div>
  )
}

// ─── Field Component ───

function FieldRow({
  label,
  description,
  value,
  onChange,
  type,
  placeholder,
  rows = 3,
}: {
  label: string
  description?: string
  value: string
  onChange: (v: string) => void
  type: 'input' | 'textarea'
  placeholder: string
  rows?: number
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {description && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}
      {type === 'input' ? (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="resize-y"
        />
      )}
    </div>
  )
}

// ─── Main Page ───

export default function SettingsPage() {
  const [context, setContext] = useState<Partial<BusinessContext>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [documents, setDocuments] = useState<SyncedDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docSearch, setDocSearch] = useState('')
  const [docType, setDocType] = useState('')
  const [docPage, setDocPage] = useState(0)
  const [docTotal, setDocTotal] = useState(0)
  const DOC_LIMIT = 20
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)

  const loadDocuments = useCallback((search = '', type = '', offset = 0) => {
    setDocsLoading(true)
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (type) params.set('type', type)
    params.set('limit', String(DOC_LIMIT))
    params.set('offset', String(offset))
    fetch(`/api/knowledge?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.documents) setDocuments(data.documents)
        if (typeof data?.total === 'number') setDocTotal(data.total)
      })
      .catch(() => {})
      .finally(() => setDocsLoading(false))
  }, [])

  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [indexing, setIndexing] = useState(false)

  // Upload state
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const replaceInputRef = useRef<HTMLInputElement | null>(null)
  const [replacingId, setReplacingId] = useState<string | null>(null)

  // Duplicate conflict modal
  const [duplicateConflict, setDuplicateConflict] = useState<{
    file: File
    existing_id: string
    name: string
  } | null>(null)

  const handleDeleteDoc = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/knowledge?id=${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        loadDocuments(docSearch, docType, docPage * DOC_LIMIT)
      }
    } catch { /* ignore */ }
    setDeletingId(null)
  }

  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length === 0) return

    setUploading(true)
    setUploadProgress(`Upload de ${fileArray.length} fichier${fileArray.length > 1 ? 's' : ''}...`)

    try {
      const formData = new FormData()
      for (const f of fileArray) {
        formData.append('files', f)
      }

      const res = await fetch('/api/knowledge/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (res.status === 409 && data.error === 'duplicate') {
        setDuplicateConflict({
          file: fileArray[0],
          existing_id: data.existing_id,
          name: data.name,
        })
      } else if (data.created > 0) {
        setUploadProgress(`${data.created} document${data.created > 1 ? 's' : ''} ajoute${data.created > 1 ? 's' : ''}`)
        loadDocuments(docSearch, docType, 0)
        setDocPage(0)
        setTimeout(() => setUploadProgress(null), 3000)
      } else if (data.errors?.length > 0) {
        setUploadProgress(`Erreur: ${data.errors[0]}`)
        setTimeout(() => setUploadProgress(null), 5000)
      }
    } catch {
      setUploadProgress('Erreur lors de l\'upload')
      setTimeout(() => setUploadProgress(null), 3000)
    }

    setUploading(false)
  }

  const handleReplaceDocument = async (file: File, docId: string) => {
    setReplacingId(docId)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('id', docId)

      const res = await fetch('/api/knowledge/upload/replace', {
        method: 'PUT',
        body: formData,
      })

      if (res.ok) {
        loadDocuments(docSearch, docType, docPage * DOC_LIMIT)
        setUploadProgress('Document remplace')
        setTimeout(() => setUploadProgress(null), 3000)
      } else {
        const data = await res.json()
        setUploadProgress(`Erreur: ${data.error}`)
        setTimeout(() => setUploadProgress(null), 5000)
      }
    } catch {
      setUploadProgress('Erreur lors du remplacement')
      setTimeout(() => setUploadProgress(null), 3000)
    }
    setReplacingId(null)
    setDuplicateConflict(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleUploadFiles(e.dataTransfer.files)
    }
  }

  const handleReindex = async () => {
    setIndexing(true)
    try {
      const res = await fetch('/api/knowledge/index', { method: 'POST' })
      const data = await res.json()
      if (data.indexed > 0) {
        setUploadProgress(`${data.indexed} document${data.indexed > 1 ? 's' : ''} indexe${data.indexed > 1 ? 's' : ''}`)
      } else {
        setUploadProgress(data.message || 'Tous les documents sont deja indexes')
      }
      setTimeout(() => setUploadProgress(null), 3000)
    } catch {
      setUploadProgress('Erreur lors de l\'indexation')
      setTimeout(() => setUploadProgress(null), 3000)
    }
    setIndexing(false)
  }

  useEffect(() => {
    fetch('/api/business-context')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) setContext(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    loadDocuments('', '', 0)

    // Load API usage stats
    fetch('/api/ai/usage')
      .then(res => res.json())
      .then(data => setUsage(data))
      .catch(() => {})
      .finally(() => setUsageLoading(false))
  }, [loadDocuments])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch('/api/business-context', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(context),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch {
      // Silent fail
    } finally {
      setSaving(false)
    }
  }

  const updateField = (key: keyof BusinessContext, value: string) => {
    setContext((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Settings className="size-6" />
          Parametres
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configurez le contexte de votre entreprise pour que l&apos;assistant IA
          genere des messages pertinents et personnalises.
        </p>
      </div>

      <div className="space-y-6">
        {/* ─── Section 1: Connexions (always visible) ─── */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Link2 className="size-5" />
            Connexions
          </h2>
          <ConnectionsPanel />
        </div>

        {/* ─── Section 2: Mon entreprise (accordion) ─── */}
        <AccordionSection
          title="Mon entreprise"
          icon={<Building2 className="size-4" />}
          preview={context.company_name ? `${context.company_name}${context.company_description ? ' — ' + context.company_description.slice(0, 60) + '...' : ''}` : undefined}
        >
          <FieldRow
            label="Nom de l'entreprise"
            value={(context.company_name as string) || ''}
            onChange={(v) => updateField('company_name', v)}
            type="input"
            placeholder="Boost Inc."
          />
          <FieldRow
            label="Description"
            description="Decrivez votre activite, votre marche cible et votre proposition de valeur."
            value={(context.company_description as string) || ''}
            onChange={(v) => updateField('company_description', v)}
            type="textarea"
            placeholder="Entreprise specialisee dans la distribution automatique..."
            rows={3}
          />
          <FieldRow
            label="Produits / Services"
            description="Listez vos produits et services principaux."
            value={(context.products as string) || ''}
            onChange={(v) => updateField('products', v)}
            type="textarea"
            placeholder="ScreenKit - Ecran interactif pour machines de distribution automatique..."
            rows={2}
          />
        </AccordionSection>

        {/* ─── Section 3: Methode commerciale (accordion) ─── */}
        <AccordionSection
          title="Methode commerciale"
          icon={<Target className="size-4" />}
          preview={context.sales_methodology ? context.sales_methodology.slice(0, 80) + '...' : undefined}
        >
          <FieldRow
            label="Methode commerciale"
            description="Decrivez votre process de vente etape par etape."
            value={(context.sales_methodology as string) || ''}
            onChange={(v) => updateField('sales_methodology', v)}
            type="textarea"
            placeholder="Touch 1 (J0) : Premier message LinkedIn ou email..."
            rows={3}
          />
        </AccordionSection>

        {/* ─── Section 4: Ton et style (accordion) ─── */}
        <AccordionSection
          title="Ton et style"
          icon={<Palette className="size-4" />}
          preview={context.tone_and_style ? context.tone_and_style.slice(0, 80) + '...' : undefined}
        >
          <FieldRow
            label="Ton et style"
            description="Comment l'IA doit ecrire : ton, longueur des messages, regles de redaction."
            value={(context.tone_and_style as string) || ''}
            onChange={(v) => updateField('tone_and_style', v)}
            type="textarea"
            placeholder="Professionnel mais humain. Messages courts (5-8 lignes max)..."
            rows={2}
          />
        </AccordionSection>

        {/* ===== SECTION OBLIGATOIRE : Templates email (NE PAS SUPPRIMER) ===== */}
        <AccordionSection
          title="Templates email"
          icon={<Mail className="size-4" />}
          preview={context.email_templates ? context.email_templates.slice(0, 80) + '...' : undefined}
        >
          <FieldRow
            label="Exemples de style email"
            description="Exemples de mails qui marchent bien. L'IA s'en inspirera."
            value={(context.email_templates as string) || ''}
            onChange={(v) => updateField('email_templates', v)}
            type="textarea"
            placeholder="Touch 1 type : Objet : [Entreprise] x Boost Inc...."
            rows={3}
          />
          <div className="pt-2">
            <a
              href="/settings/templates"
              className="flex items-center justify-between rounded-lg border p-3 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Mail className="size-4 text-brand-accent" />
                <span className="text-sm font-medium">Gerer les templates email</span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </a>
          </div>
        </AccordionSection>

        {/* ===== SECTION OBLIGATOIRE : Templates LinkedIn (NE PAS SUPPRIMER) ===== */}
        <AccordionSection
          title="Templates LinkedIn"
          icon={<Linkedin className="size-4" />}
          preview={context.linkedin_templates ? context.linkedin_templates.slice(0, 80) + '...' : undefined}
        >
          <FieldRow
            label="Exemples de style LinkedIn"
            description="Exemples de messages LinkedIn (demande de connexion, InMail, etc.)."
            value={(context.linkedin_templates as string) || ''}
            onChange={(v) => updateField('linkedin_templates', v)}
            type="textarea"
            placeholder="Message de connexion : Bonjour [Prenom], je suis..."
            rows={3}
          />
        </AccordionSection>

        {/* ===== SECTION OBLIGATOIRE : Sequences email (NE PAS SUPPRIMER) ===== */}
        <AccordionSection
          title="Sequences email"
          icon={<Zap className="size-4" />}
          preview="Configurez vos sequences d'emails automatisees"
        >
          <a
            href="/settings/sequences"
            className="flex items-center justify-between rounded-lg border p-3 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Zap className="size-4 text-brand-accent" />
              <span className="text-sm font-medium">Gerer les sequences</span>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </a>
        </AccordionSection>

        {/* ─── Section 5: Signature email (accordion) ─── */}
        <AccordionSection
          title="Signature email"
          icon={<MessageSquare className="size-4" />}
          preview={context.email_signature ? context.email_signature.split('\n')[0] : undefined}
        >
          <FieldRow
            label="Signature"
            description="Ajoutee automatiquement a chaque email envoye via le CRM."
            value={(context.email_signature as string) || ''}
            onChange={(v) => updateField('email_signature', v)}
            type="textarea"
            placeholder="Louis Matar&#10;Business Development Manager&#10;Boost Inc. | +33 6 XX XX XX XX&#10;louis.matar@boostinc.com"
            rows={4}
          />
        </AccordionSection>

        {/* ─── Section 6: Contexte additionnel (accordion) ─── */}
        <AccordionSection
          title="Contexte additionnel"
          icon={<FileText className="size-4" />}
          preview={context.additional_context ? context.additional_context.slice(0, 80) + '...' : undefined}
        >
          <FieldRow
            label="Informations complementaires"
            description="Concurrents, objections frequentes, cas clients, etc."
            value={(context.additional_context as string) || ''}
            onChange={(v) => updateField('additional_context', v)}
            type="textarea"
            placeholder="Objections frequentes :&#10;- &quot;On a deja un fournisseur&quot; → ...&#10;- &quot;Le budget est serre&quot; → ..."
            rows={3}
          />
        </AccordionSection>

        {/* Hidden file inputs (must be in parent scope for handlers) */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.md,.csv,.json"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleUploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,.json"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0] && replacingId) {
              handleReplaceDocument(e.target.files[0], replacingId)
            }
            e.target.value = ''
          }}
        />

        {/* ─── Section 7: Base de connaissances (collapsible) ─── */}
        <KnowledgeBaseSection
          documents={documents}
          docTotal={docTotal}
          docsLoading={docsLoading}
          docSearch={docSearch}
          setDocSearch={(v: string) => {
            setDocSearch(v)
            if (searchTimeout.current) clearTimeout(searchTimeout.current)
            searchTimeout.current = setTimeout(() => {
              setDocPage(0)
              loadDocuments(v, docType, 0)
            }, 300)
          }}
          docType={docType}
          setDocType={(v: string) => {
            setDocType(v)
            setDocPage(0)
            loadDocuments(docSearch, v, 0)
          }}
          docPage={docPage}
          setDocPage={setDocPage}
          DOC_LIMIT={DOC_LIMIT}
          loadDocuments={loadDocuments}
          handleDeleteDoc={handleDeleteDoc}
          deletingId={deletingId}
          handleUploadFiles={handleUploadFiles}
          uploading={uploading}
          uploadProgress={uploadProgress}
          setUploadProgress={setUploadProgress}
          dragOver={dragOver}
          setDragOver={setDragOver}
          handleDrop={handleDrop}
          fileInputRef={fileInputRef}
          replaceInputRef={replaceInputRef}
          replacingId={replacingId}
          setReplacingId={setReplacingId}
          handleReindex={handleReindex}
          indexing={indexing}
        />

        {/* ─── Section 8: Pipeline (always visible) ─── */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <Layers className="size-5" />
            Pipeline
          </h2>
          <a
            href="/settings/pipeline"
            className="flex items-center justify-between rounded-lg border p-4 hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Layers className="size-5 text-brand-accent" />
              <div>
                <p className="text-sm font-medium">Etapes du pipeline</p>
                <p className="text-xs text-muted-foreground">
                  Configurez et reordonnez les etapes du pipeline commercial
                </p>
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </a>
        </div>

        {/* ─── API Usage ─── */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <BrainCircuit className="size-5" />
            Consommation API (IA)
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Suivi de l&apos;utilisation des API Anthropic Claude. Budget mensuel : $10.
          </p>

          {usageLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : usage?.error ? (
            <Card>
              <CardContent className="pt-6">
                <div className="py-8 text-center">
                  <BrainCircuit className="mx-auto mb-3 size-10 text-muted-foreground/50" />
                  <p className="text-sm font-medium text-muted-foreground">Table api_usage non configuree</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    Executez le SQL suivant dans Supabase pour activer le suivi :
                  </p>
                  <pre className="mt-3 text-left text-xs bg-white/5 rounded-md p-3 overflow-x-auto">
{`CREATE TABLE IF NOT EXISTS api_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint text NOT NULL,
  model text NOT NULL,
  input_tokens integer DEFAULT 0,
  output_tokens integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_api_usage_created
  ON api_usage (created_at DESC);`}
                  </pre>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Budget bar */}
              {usage?.budget && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Budget mensuel</span>
                      <span className="text-sm font-mono">
                        ${usage.budget.current.toFixed(2)} / ${usage.budget.limit.toFixed(2)}
                      </span>
                    </div>
                    <div className="h-3 w-full rounded-full bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          usage.budget.current >= usage.budget.limit
                            ? 'bg-red-500'
                            : usage.budget.current >= usage.budget.warning
                              ? 'bg-orange-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, (usage.budget.current / usage.budget.limit) * 100)}%` }}
                      />
                    </div>
                    {usage.budget.current >= usage.budget.limit && (
                      <p className="mt-2 text-xs text-red-400">Budget atteint — fonctions IA desactivees jusqu&apos;au 1er du mois prochain.</p>
                    )}
                    {usage.budget.current >= usage.budget.warning && usage.budget.current < usage.budget.limit && (
                      <p className="mt-2 text-xs text-orange-400">Proche du plafond — ${(usage.budget.limit - usage.budget.current).toFixed(2)} restants.</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Period cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UsageCard label="Aujourd'hui" data={usage?.today} />
                <UsageCard label="7 derniers jours" data={usage?.week} />
                <UsageCard label="Ce mois" data={usage?.month} />
              </div>

              {/* By model breakdown */}
              {usage?.byModel && Object.keys(usage.byModel).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Par modele</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(usage.byModel)
                        .sort(([, a], [, b]) => b.cost - a.cost)
                        .map(([model, stats]) => (
                          <div key={model} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-mono">{model}</span>
                            <div className="flex items-center gap-4">
                              <span>{stats.calls} appels</span>
                              <span className="text-brand-accent font-medium">${stats.cost.toFixed(4)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* By endpoint breakdown */}
              {usage?.byEndpoint && Object.keys(usage.byEndpoint).length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Par fonctionnalite</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {Object.entries(usage.byEndpoint)
                        .sort(([, a], [, b]) => b.cost - a.cost)
                        .map(([endpoint, stats]) => (
                          <div key={endpoint} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{endpoint}</span>
                            <div className="flex items-center gap-4">
                              <span>{stats.calls} appels</span>
                              <span className="text-brand-accent font-medium">${stats.cost.toFixed(4)}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Duplicate conflict modal */}
      {duplicateConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border bg-background p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Document existant</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Un document nomme <span className="font-medium text-foreground">&quot;{duplicateConflict.name}&quot;</span> existe deja dans la base de connaissances.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Voulez-vous le remplacer ?</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setDuplicateConflict(null)}
              >
                Annuler
              </Button>
              <Button
                onClick={() => handleReplaceDocument(duplicateConflict.file, duplicateConflict.existing_id)}
                disabled={replacingId === duplicateConflict.existing_id}
              >
                {replacingId === duplicateConflict.existing_id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Remplacer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sticky Save Button ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-3xl items-center justify-end px-4 py-3 sm:px-6 lg:px-8">
          <Button onClick={handleSave} disabled={saving} size="lg">
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {saved ? 'Sauvegarde !' : 'Sauvegarder'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Knowledge Base Section (collapsible) ───

function KnowledgeBaseSection({
  documents,
  docTotal,
  docsLoading,
  docSearch,
  setDocSearch,
  docType,
  setDocType,
  docPage,
  setDocPage,
  DOC_LIMIT,
  loadDocuments,
  handleDeleteDoc,
  deletingId,
  handleUploadFiles,
  uploading,
  uploadProgress,
  setUploadProgress,
  dragOver,
  setDragOver,
  handleDrop,
  fileInputRef,
  replaceInputRef,
  replacingId,
  setReplacingId,
  handleReindex,
  indexing,
}: {
  documents: SyncedDocument[]
  docTotal: number
  docsLoading: boolean
  docSearch: string
  setDocSearch: (v: string) => void
  docType: string
  setDocType: (v: string) => void
  docPage: number
  setDocPage: (v: number) => void
  DOC_LIMIT: number
  loadDocuments: (search: string, type: string, offset: number) => void
  handleDeleteDoc: (id: string) => void
  deletingId: string | null
  handleUploadFiles: (files: FileList | File[]) => void
  uploading: boolean
  uploadProgress: string | null
  setUploadProgress: (v: string | null) => void
  dragOver: boolean
  setDragOver: (v: boolean) => void
  handleDrop: (e: React.DragEvent) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  replaceInputRef: React.RefObject<HTMLInputElement | null>
  replacingId: string | null
  setReplacingId: (v: string | null) => void
  handleReindex: () => void
  indexing: boolean
}) {
  const [listExpanded, setListExpanded] = useState(false)

  const getDocIcon = (doc: SyncedDocument) => {
    if (doc.mime_type?.includes('pdf')) return <File className="size-4 shrink-0 text-red-500" />
    if (doc.mime_type?.includes('presentation')) return <Presentation className="size-4 shrink-0 text-yellow-500" />
    if (doc.mime_type?.includes('spreadsheet') || doc.mime_type?.includes('csv')) return <FileSpreadsheet className="size-4 shrink-0 text-green-500" />
    if (doc.mime_type?.includes('word') || doc.name?.endsWith('.docx')) return <FileSpreadsheet className="size-4 shrink-0 text-blue-500" />
    return <FileText className="size-4 shrink-0 text-blue-500" />
  }

  const formatSize = (size: number) => {
    if (size < 1024) return `${size} o`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} Ko`
    return `${(size / (1024 * 1024)).toFixed(1)} Mo`
  }

  return (
    <div>
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
        <BookOpen className="size-5" />
        Base de connaissances
      </h2>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors ${
          dragOver
            ? 'border-brand-accent bg-brand-accent/10'
            : 'border-border hover:border-brand-accent/50 hover:bg-white/5'
        }`}
      >
        <Upload className={`mb-2 size-8 ${dragOver ? 'text-brand-accent' : 'text-muted-foreground'}`} />
        <p className="text-sm font-medium text-foreground">
          {uploading ? uploadProgress : 'Glissez vos fichiers ici ou cliquez pour choisir'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Formats recommandes : .md, .txt (meilleure qualite)
        </p>
        <p className="text-xs text-muted-foreground">
          Aussi acceptes : .pdf, .docx, .csv (conversion automatique)
        </p>
        {uploading && (
          <Loader2 className="mt-2 size-5 animate-spin text-brand-accent" />
        )}
      </div>
      {/* Upload progress toast */}
      {uploadProgress && !uploading && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          <BookOpen className="size-4 shrink-0" />
          {uploadProgress}
          <button onClick={() => setUploadProgress(null)} className="ml-auto">
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {/* Collapsible document list */}
      <div className="rounded-lg border bg-card">
        <button
          onClick={() => setListExpanded(!listExpanded)}
          className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors"
        >
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform ${
              listExpanded ? '' : '-rotate-90'
            }`}
          />
          <span className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="size-4" />
            Base de connaissances ({docTotal} document{docTotal !== 1 ? 's' : ''})
          </span>
        </button>

        {listExpanded && (
          <div className="border-t px-4 py-4 space-y-3">
            {/* Search + type filters */}
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un document..."
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Tous', value: '' },
                  { label: 'Docs', value: 'docs' },
                  { label: 'Sheets', value: 'sheets' },
                  { label: 'PDF', value: 'pdf' },
                  { label: 'Slides', value: 'slides' },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setDocType(f.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      docType === f.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions bar */}
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReindex}
                disabled={indexing}
                title="Generer les resumes IA pour les documents non indexes"
              >
                {indexing ? <Loader2 className="size-3.5 animate-spin" /> : <BrainCircuit className="size-3.5" />}
                Re-indexer
              </Button>
              <Button variant="ghost" size="sm" onClick={() => loadDocuments(docSearch, docType, docPage * DOC_LIMIT)}>
                <RefreshCw className="size-3.5" />
                Rafraichir
              </Button>
            </div>

            {docsLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {docSearch || docType ? 'Aucun document trouve' : 'Aucun document dans la base'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/5 transition-colors"
                  >
                    {getDocIcon(doc)}
                    <span className="truncate text-sm font-medium min-w-0 flex-1">{doc.name}</span>
                    {doc.file_size && (
                      <span className="shrink-0 text-xs text-muted-foreground">{formatSize(doc.file_size)}</span>
                    )}
                    {doc.source === 'upload' ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                        Upload
                      </span>
                    ) : doc.source === 'drive' || doc.drive_file_id ? (
                      <span className="shrink-0 rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                        Drive
                      </span>
                    ) : null}
                    <button
                      onClick={() => handleDeleteDoc(doc.id)}
                      disabled={deletingId === doc.id}
                      className="shrink-0 text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Supprimer"
                    >
                      {deletingId === doc.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5" />
                      )}
                    </button>
                  </div>
                ))}

                {/* Pagination */}
                {docTotal > DOC_LIMIT && (
                  <div className="flex items-center justify-between pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">
                      {docPage * DOC_LIMIT + 1}-{Math.min((docPage + 1) * DOC_LIMIT, docTotal)} sur {docTotal}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={docPage === 0}
                        onClick={() => {
                          const p = docPage - 1
                          setDocPage(p)
                          loadDocuments(docSearch, docType, p * DOC_LIMIT)
                        }}
                      >
                        <ChevronLeft className="size-4" />
                        Precedent
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={(docPage + 1) * DOC_LIMIT >= docTotal}
                        onClick={() => {
                          const p = docPage + 1
                          setDocPage(p)
                          loadDocuments(docSearch, docType, p * DOC_LIMIT)
                        }}
                      >
                        Suivant
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function UsageCard({ label, data }: { label: string; data: UsagePeriod | null | undefined }) {
  if (!data) return (
    <div className="rounded-lg border p-4 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold">—</p>
    </div>
  )

  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      <p className="text-2xl font-bold text-foreground">{data.calls} <span className="text-sm font-normal text-muted-foreground">appels</span></p>
      <div className="mt-2 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Tokens entree</span>
          <span>{data.input_tokens.toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Tokens sortie</span>
          <span>{data.output_tokens.toLocaleString('fr-FR')}</span>
        </div>
        <div className="flex justify-between text-xs font-medium pt-1 border-t border-white/10">
          <span className="text-muted-foreground">Cout estime</span>
          <span className="text-brand-accent">${data.cost_usd.toFixed(4)}</span>
        </div>
      </div>
    </div>
  )
}
