'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, Save, Loader2, Building2, Package, Target, Palette, Mail, Linkedin, FileText, FolderSync, ExternalLink, FileSpreadsheet, Presentation, File, BrainCircuit } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import type { BusinessContext } from '@/lib/types'
import { Badge } from '@/components/ui/badge'

interface SyncedDocument {
  id: string
  drive_file_id: string
  name: string
  mime_type: string | null
  folder_path: string | null
  url: string | null
  last_modified: string | null
  synced_at: string | null
}

interface FieldConfig {
  key: keyof BusinessContext
  label: string
  description: string
  icon: React.ReactNode
  type: 'input' | 'textarea'
  placeholder: string
  rows?: number
}

const fields: FieldConfig[] = [
  {
    key: 'company_name',
    label: 'Nom de l\'entreprise',
    description: 'Le nom de votre entreprise tel qu\'il apparaitra dans les communications.',
    icon: <Building2 className="size-4" />,
    type: 'input',
    placeholder: 'Boost Inc.',
  },
  {
    key: 'company_description',
    label: 'Description de l\'entreprise',
    description: 'Decrivez votre activite, votre marche cible et votre proposition de valeur.',
    icon: <FileText className="size-4" />,
    type: 'textarea',
    placeholder: 'Entreprise specialisee dans la distribution automatique...',
    rows: 3,
  },
  {
    key: 'products',
    label: 'Produits / Services',
    description: 'Listez vos produits et services principaux avec une courte description.',
    icon: <Package className="size-4" />,
    type: 'textarea',
    placeholder: 'ScreenKit - Ecran interactif pour machines de distribution automatique\nVendMax Pro - Solution de gestion de parc...',
    rows: 4,
  },
  {
    key: 'sales_methodology',
    label: 'Methode commerciale',
    description: 'Decrivez votre process de vente etape par etape (touches, relances, closing...).',
    icon: <Target className="size-4" />,
    type: 'textarea',
    placeholder: 'Touch 1 (J0) : Premier message LinkedIn ou email...\nTouch 2 (J+3-5) : Relance...',
    rows: 6,
  },
  {
    key: 'tone_and_style',
    label: 'Ton et style',
    description: 'Comment l\'IA doit ecrire : ton, longueur des messages, regles de redaction.',
    icon: <Palette className="size-4" />,
    type: 'textarea',
    placeholder: 'Professionnel mais humain. Messages courts (5-8 lignes max)...',
    rows: 3,
  },
  {
    key: 'email_templates',
    label: 'Templates email',
    description: 'Exemples de mails qui marchent bien. L\'IA s\'en inspirera pour generer du contenu.',
    icon: <Mail className="size-4" />,
    type: 'textarea',
    placeholder: 'Touch 1 type :\nObjet : [Entreprise] x Boost Inc.\nBonjour [Prenom],\n...',
    rows: 6,
  },
  {
    key: 'linkedin_templates',
    label: 'Templates LinkedIn',
    description: 'Exemples de messages LinkedIn (demande de connexion, InMail, etc.).',
    icon: <Linkedin className="size-4" />,
    type: 'textarea',
    placeholder: 'Message de connexion :\nBonjour [Prenom], je suis...',
    rows: 4,
  },
  {
    key: 'additional_context',
    label: 'Contexte additionnel',
    description: 'Toute information utile pour l\'IA : concurrents, objections frequentes, cas clients...',
    icon: <FileText className="size-4" />,
    type: 'textarea',
    placeholder: 'Objections frequentes :\n- "On a deja un fournisseur" → ...\n- "Le budget est serre" → ...',
    rows: 5,
  },
]

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
  error: string | null
}

export default function SettingsPage() {
  const [context, setContext] = useState<Partial<BusinessContext>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [documents, setDocuments] = useState<SyncedDocument[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [usage, setUsage] = useState<UsageStats | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)

  const loadDocuments = useCallback(() => {
    setDocsLoading(true)
    fetch('/api/webhooks/drive-sync', { headers: { 'x-internal': 'true' } })
      .then((res) => res.json())
      .then((data) => {
        if (data?.documents) setDocuments(data.documents)
      })
      .catch(() => {})
      .finally(() => setDocsLoading(false))
  }, [])

  useEffect(() => {
    fetch('/api/business-context')
      .then((res) => res.json())
      .then((data) => {
        if (data && !data.error) setContext(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))

    loadDocuments()

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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Settings className="size-6" />
            Parametres
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configurez le contexte de votre entreprise pour que l&apos;assistant IA
            genere des messages pertinents et personnalises.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saved ? 'Sauvegarde !' : 'Sauvegarder'}
        </Button>
      </div>

      <div className="space-y-4">
        {fields.map((field) => (
          <Card key={field.key}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                {field.icon}
                {field.label}
              </CardTitle>
              <CardDescription className="text-xs">
                {field.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {field.type === 'input' ? (
                <Input
                  value={(context[field.key] as string) || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                />
              ) : (
                <Textarea
                  value={(context[field.key] as string) || ''}
                  onChange={(e) => updateField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  rows={field.rows || 4}
                  className="resize-y"
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          {saved ? 'Sauvegarde !' : 'Sauvegarder'}
        </Button>
      </div>

      {/* Knowledge Base — Synced Documents */}
      <div className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <FolderSync className="size-5" />
          Base de connaissances (Google Drive)
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Documents synchronises depuis Google Drive. L&apos;IA les utilise pour repondre aux questions techniques et personnaliser les messages.
        </p>

        <Card>
          <CardContent className="pt-6">
            {docsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : documents.length === 0 ? (
              <div className="py-8 text-center">
                <FolderSync className="mx-auto mb-3 size-10 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">Aucun document synchronise</p>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  Configurez le script Google Apps Script pour synchroniser vos documents Drive.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mb-3 flex items-center justify-between">
                  <Badge variant="secondary">{documents.length} document{documents.length > 1 ? 's' : ''}</Badge>
                  <Button variant="ghost" size="sm" onClick={loadDocuments}>
                    <FolderSync className="size-3.5" />
                    Rafraichir
                  </Button>
                </div>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {doc.mime_type?.includes('presentation') ? (
                        <Presentation className="size-4 shrink-0 text-yellow-500" />
                      ) : doc.mime_type?.includes('spreadsheet') ? (
                        <FileSpreadsheet className="size-4 shrink-0 text-green-500" />
                      ) : doc.mime_type?.includes('pdf') ? (
                        <File className="size-4 shrink-0 text-red-500" />
                      ) : (
                        <FileText className="size-4 shrink-0 text-blue-500" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{doc.name}</p>
                        {doc.folder_path && (
                          <p className="truncate text-xs text-muted-foreground">{doc.folder_path}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {doc.synced_at && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(doc.synced_at).toLocaleDateString('fr-FR')}
                        </span>
                      )}
                      {doc.url && (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* API Usage Tracking */}
      <div className="mt-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
          <BrainCircuit className="size-5" />
          Consommation API (IA)
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Suivi de l&apos;utilisation de l&apos;API Google Gemini (modele : 2.5 Flash — $0.15 / MTok entree, $0.60 / MTok sortie).
        </p>

        <Card>
          <CardContent className="pt-6">
            {usageLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : usage?.error ? (
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
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <UsageCard label="Aujourd'hui" data={usage?.today} />
                <UsageCard label="7 derniers jours" data={usage?.week} />
                <UsageCard label="Ce mois" data={usage?.month} />
              </div>
            )}
          </CardContent>
        </Card>
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
