'use client'

import { useCallback, useRef, useState } from 'react'
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { bulkImportProspects } from '@/lib/actions'
import type { Prospect } from '@/lib/types'

// ─── CSV Parser ───

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',' || char === ';') {
        row.push(current.trim())
        current = ''
      } else if (char === '\n' || (char === '\r' && next === '\n')) {
        row.push(current.trim())
        current = ''
        if (row.some((cell) => cell !== '')) {
          rows.push(row)
        }
        row = []
        if (char === '\r') i++
      } else {
        current += char
      }
    }
  }

  if (current !== '' || row.length > 0) {
    row.push(current.trim())
    if (row.some((cell) => cell !== '')) {
      rows.push(row)
    }
  }

  return rows
}

// ─── Field definitions ───

const PROSPECT_FIELDS = [
  { key: 'skip', label: '-- Ignorer --' },
  { key: 'prenom', label: 'Prenom' },
  { key: 'nom', label: 'Nom' },
  { key: 'entreprise', label: 'Entreprise' },
  { key: 'fonction', label: 'Fonction' },
  { key: 'email', label: 'Email' },
  { key: 'email_pro', label: 'Email Pro' },
  { key: 'telephone', label: 'Telephone' },
  { key: 'localisation', label: 'Localisation' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'pays', label: 'Pays' },
  { key: 'source', label: 'Source' },
  { key: 'statut_commercial', label: 'Statut Commercial' },
  { key: 'categorie', label: 'Categorie' },
] as const

type ProspectFieldKey = (typeof PROSPECT_FIELDS)[number]['key']

// ─── Auto-mapping from CSV headers ───

const HEADER_AUTO_MAP: Record<string, ProspectFieldKey> = {
  'prénom': 'prenom',
  'prenom': 'prenom',
  'first name': 'prenom',
  'firstname': 'prenom',
  'nom': 'nom',
  'last name': 'nom',
  'lastname': 'nom',
  'entreprise': 'entreprise',
  'company': 'entreprise',
  'société': 'entreprise',
  'societe': 'entreprise',
  'fonction': 'fonction',
  'title': 'fonction',
  'job title': 'fonction',
  'poste': 'fonction',
  'email': 'email',
  'e-mail': 'email',
  'mail': 'email',
  'email pro': 'email_pro',
  'email professionnel': 'email_pro',
  'professional email': 'email_pro',
  'work email': 'email_pro',
  'téléphone': 'telephone',
  'telephone': 'telephone',
  'phone': 'telephone',
  'tel': 'telephone',
  'mobile': 'telephone',
  'localisation': 'localisation',
  'location': 'localisation',
  'ville': 'localisation',
  'city': 'localisation',
  'linkedin url': 'linkedin_url',
  'linkedin': 'linkedin_url',
  'linkedinurl': 'linkedin_url',
  'linkedin_url': 'linkedin_url',
  'profil linkedin': 'linkedin_url',
  'pays': 'pays',
  'country': 'pays',
  'source': 'source',
  'origine': 'source',
  'statut commercial': 'statut_commercial',
  'statut_commercial': 'statut_commercial',
  'statut': 'statut_commercial',
  'catégorie': 'categorie',
  'categorie': 'categorie',
  'category': 'categorie',
}

// ─── Pipeline stage mapping ───

function mapCategorieToPipelineStage(categorie: string): string {
  const normalized = categorie.trim()
  const map: Record<string, string> = {
    'Client': 'client',
    'Client / Discussion active': 'devis',
    'A répondu': 'repondu',
    'Sans réponse': 'a_recontacter',
    'Bounced / Email invalide': 'refuse',
    'Refusé / Hors zone': 'refuse',
    'Contact secondaire': 'ciblage',
    'Prescripteur / Réseau': 'repondu',
  }
  return map[normalized] ?? 'ciblage'
}

// ─── Import Steps ───

type ImportStep = 'upload' | 'mapping' | 'importing' | 'done'

export default function ImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<ImportStep>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [columnMapping, setColumnMapping] = useState<ProspectFieldKey[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [parseError, setParseError] = useState('')

  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<{
    inserted: number
    errors: string[]
  } | null>(null)

  // ─── File Handling ───

  const processFile = useCallback((file: File) => {
    setParseError('')

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setParseError('Veuillez selectionner un fichier CSV.')
      return
    }

    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string
        const parsed = parseCSV(text)

        if (parsed.length < 2) {
          setParseError(
            'Le fichier CSV doit contenir au moins un en-tete et une ligne de donnees.'
          )
          return
        }

        const csvHeaders = parsed[0]
        const csvRows = parsed.slice(1)

        setHeaders(csvHeaders)
        setRows(csvRows)

        const autoMapping: ProspectFieldKey[] = csvHeaders.map((header) => {
          const normalized = header.toLowerCase().trim()
          return HEADER_AUTO_MAP[normalized] ?? 'skip'
        })

        setColumnMapping(autoMapping)
        setStep('mapping')
      } catch {
        setParseError(
          'Erreur lors de la lecture du fichier CSV. Verifiez le format.'
        )
      }
    }
    reader.onerror = () => {
      setParseError('Erreur lors de la lecture du fichier.')
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  // ─── Column Mapping ───

  const updateMapping = (index: number, value: ProspectFieldKey) => {
    setColumnMapping((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const mappedFieldsCount = columnMapping.filter((m) => m !== 'skip').length

  // ─── Build Prospects ───

  function buildProspects(): Partial<Prospect>[] {
    return rows.map((row) => {
      const prospect: Record<string, string> = {}

      columnMapping.forEach((field, colIndex) => {
        if (field !== 'skip' && row[colIndex] !== undefined) {
          prospect[field] = row[colIndex]
        }
      })

      if (prospect.categorie) {
        prospect.pipeline_stage = mapCategorieToPipelineStage(prospect.categorie)
      } else {
        prospect.pipeline_stage = 'ciblage'
      }

      return prospect as Partial<Prospect>
    })
  }

  // ─── Import ───

  const handleImport = async () => {
    setStep('importing')
    setImportProgress(0)
    setImportResult(null)

    const prospects = buildProspects()

    const progressInterval = setInterval(() => {
      setImportProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval)
          return 90
        }
        return prev + Math.random() * 15
      })
    }, 200)

    try {
      const result = await bulkImportProspects(prospects)
      clearInterval(progressInterval)
      setImportProgress(100)
      setImportResult(result)
      setStep('done')
    } catch (err) {
      clearInterval(progressInterval)
      setImportProgress(100)
      setImportResult({
        inserted: 0,
        errors: [
          err instanceof Error
            ? err.message
            : "Une erreur inattendue s'est produite.",
        ],
      })
      setStep('done')
    }
  }

  // ─── Reset ───

  const handleReset = () => {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setRows([])
    setColumnMapping([])
    setParseError('')
    setImportProgress(0)
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const previewRows = rows.slice(0, 10)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">
            Importer
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Importez vos prospects ou synchronisez vos emails Gmail
          </p>
        </div>

        {/* Gmail Import Section */}
        <GmailImportSection />

        <div className="my-8 flex items-center gap-4">
          <div className="flex-1 border-t border-border/50" />
          <span className="text-xs text-muted-foreground">ou importez un CSV</span>
          <div className="flex-1 border-t border-border/50" />
        </div>

        {/* Step indicator */}
        <div className="mb-8 flex items-center gap-3">
          <StepBadge
            number={1}
            label="Fichier"
            active={step === 'upload'}
            completed={step !== 'upload'}
          />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <StepBadge
            number={2}
            label="Mapping"
            active={step === 'mapping'}
            completed={step === 'importing' || step === 'done'}
          />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <StepBadge
            number={3}
            label="Import"
            active={step === 'importing' || step === 'done'}
            completed={step === 'done'}
          />
        </div>

        {/* ─── STEP 1: Upload ─── */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Charger un fichier CSV</CardTitle>
              <CardDescription>
                Glissez-deposez votre fichier CSV ou cliquez pour le
                selectionner. Le fichier doit contenir une ligne
                d&apos;en-tete.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors ${
                  isDragOver
                    ? 'border-brand-accent bg-brand-accent/10'
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/50'
                }`}
              >
                <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
                <p className="mb-1 text-sm font-medium">
                  Glissez votre fichier CSV ici
                </p>
                <p className="text-xs text-muted-foreground">
                  ou cliquez pour parcourir vos fichiers
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>

              {parseError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {parseError}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ─── STEP 2: Mapping ─── */}
        {step === 'mapping' && (
          <div className="space-y-6">
            {/* File info */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-brand-accent" />
                    <div>
                      <p className="text-sm font-medium">{fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {rows.length} ligne{rows.length > 1 ? 's' : ''}{' '}
                        detectee{rows.length > 1 ? 's' : ''} &middot;{' '}
                        {headers.length} colonne
                        {headers.length > 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <X className="mr-1 h-4 w-4" />
                    Changer de fichier
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Column Mapping */}
            <Card>
              <CardHeader>
                <CardTitle>Correspondance des colonnes</CardTitle>
                <CardDescription>
                  Associez chaque colonne du CSV au champ prospect correspondant.
                  Les colonnes reconnues sont pre-remplies automatiquement.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {headers.map((header, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-4 rounded-lg border border-border/50 bg-muted/30 p-3"
                    >
                      <div className="w-48 shrink-0">
                        <p
                          className="text-sm font-medium truncate"
                          title={header}
                        >
                          {header}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          ex: {previewRows[0]?.[index] ?? '\u2014'}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Select
                        value={columnMapping[index]}
                        onValueChange={(value: string) =>
                          updateMapping(index, value as ProspectFieldKey)
                        }
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue placeholder="Selectionner un champ" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROSPECT_FIELDS.map((field) => (
                            <SelectItem key={field.key} value={field.key}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {columnMapping[index] !== 'skip' && (
                        <Badge
                          variant="secondary"
                          className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        >
                          Mappe
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 text-sm text-muted-foreground">
                  {mappedFieldsCount} champ{mappedFieldsCount > 1 ? 's' : ''}{' '}
                  mappe{mappedFieldsCount > 1 ? 's' : ''} sur{' '}
                  {headers.length} colonne{headers.length > 1 ? 's' : ''}
                </div>
              </CardContent>
            </Card>

            {/* Preview Table */}
            <Card>
              <CardHeader>
                <CardTitle>Apercu des donnees</CardTitle>
                <CardDescription>
                  Voici les {Math.min(10, rows.length)} premieres lignes de votre
                  fichier (sur {rows.length} au total).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {headers.map((header, i) => {
                          const mapping = columnMapping[i]
                          const mappedField = PROSPECT_FIELDS.find(
                            (f) => f.key === mapping
                          )
                          return (
                            <TableHead key={i}>
                              <div>
                                <span className="text-xs text-muted-foreground">
                                  {header}
                                </span>
                                {mapping !== 'skip' && mappedField && (
                                  <span className="ml-1 text-xs text-emerald-400">
                                    &rarr; {mappedField.label}
                                  </span>
                                )}
                              </div>
                            </TableHead>
                          )
                        })}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                          {headers.map((_, colIndex) => (
                            <TableCell
                              key={colIndex}
                              className={
                                columnMapping[colIndex] === 'skip'
                                  ? 'text-muted-foreground/50'
                                  : ''
                              }
                            >
                              <span className="block max-w-48 truncate text-xs">
                                {row[colIndex] ?? ''}
                              </span>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Import Button */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/30 p-4">
              <div>
                <p className="text-sm font-medium">
                  Pret a importer {rows.length} prospect
                  {rows.length > 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {mappedFieldsCount} champ{mappedFieldsCount > 1 ? 's' : ''}{' '}
                  seront importes. Le stage pipeline sera deduit
                  automatiquement de la categorie.
                </p>
              </div>
              <Button
                onClick={handleImport}
                disabled={mappedFieldsCount === 0}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                Lancer l&apos;import
              </Button>
            </div>
          </div>
        )}

        {/* ─── STEP 3: Importing / Done ─── */}
        {(step === 'importing' || step === 'done') && (
          <Card>
            <CardHeader>
              <CardTitle>
                {step === 'importing'
                  ? 'Import en cours...'
                  : 'Import termine'}
              </CardTitle>
              <CardDescription>
                {step === 'importing'
                  ? `Envoi de ${rows.length} prospect${rows.length > 1 ? 's' : ''} vers la base de donnees...`
                  : 'Voici le resultat de votre import.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Progress bar */}
              <div className="mb-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Progression</span>
                  <span className="font-medium">
                    {Math.round(importProgress)}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${
                      step === 'done' &&
                      importResult &&
                      importResult.errors.length > 0 &&
                      importResult.inserted === 0
                        ? 'bg-red-500'
                        : step === 'done' &&
                            importResult &&
                            importResult.errors.length > 0
                          ? 'bg-amber-500'
                          : 'bg-brand-accent'
                    }`}
                    style={{ width: `${Math.min(importProgress, 100)}%` }}
                  />
                </div>
              </div>

              {step === 'importing' && (
                <div className="flex items-center justify-center gap-3 py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-brand-accent" />
                  <p className="text-sm text-muted-foreground">
                    Veuillez patienter...
                  </p>
                </div>
              )}

              {step === 'done' && importResult && (
                <div className="space-y-4">
                  {importResult.inserted > 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                      <div>
                        <p className="text-sm font-medium text-emerald-300">
                          {importResult.inserted} prospect
                          {importResult.inserted > 1 ? 's' : ''} importe
                          {importResult.inserted > 1 ? 's' : ''} avec succes
                        </p>
                        <p className="mt-1 text-xs text-emerald-400/70">
                          Les prospects ont ete ajoutes a votre base de donnees
                          et sont disponibles dans le pipeline.
                        </p>
                      </div>
                    </div>
                  )}

                  {importResult.errors.length > 0 && (
                    <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
                      <div>
                        <p className="text-sm font-medium text-red-300">
                          {importResult.errors.length} erreur
                          {importResult.errors.length > 1 ? 's' : ''}{' '}
                          rencontree
                          {importResult.errors.length > 1 ? 's' : ''}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {importResult.errors.map((err, i) => (
                            <li key={i} className="text-xs text-red-400/80">
                              {err}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}

                  {importResult.inserted === 0 &&
                    importResult.errors.length === 0 && (
                      <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
                        <div>
                          <p className="text-sm font-medium text-amber-300">
                            Aucun prospect n&apos;a ete importe
                          </p>
                          <p className="mt-1 text-xs text-amber-400/70">
                            Le fichier ne contenait aucune donnee valide a
                            importer.
                          </p>
                        </div>
                      </div>
                    )}

                  <div className="flex gap-3 pt-2">
                    <Button onClick={handleReset} variant="outline">
                      Nouvel import
                    </Button>
                    <Button asChild>
                      <a href="/prospects">Voir les prospects</a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ─── Gmail Import Section ───

function GmailImportSection() {
  const [afterDate, setAfterDate] = useState('2023/01/01')
  const [beforeDate, setBeforeDate] = useState('')
  const [maxResults, setMaxResults] = useState('500')
  const [importing, setImporting] = useState(false)
  const [gmailResult, setGmailResult] = useState<Record<string, unknown> | null>(null)
  const [gmailError, setGmailError] = useState('')
  const [needOAuth, setNeedOAuth] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const [manualToken, setManualToken] = useState('')

  const handleGmailImport = async (manualAccessToken?: string) => {
    setImporting(true)
    setGmailResult(null)
    setGmailError('')
    setNeedOAuth(false)

    try {
      const body: Record<string, unknown> = {
        after: afterDate || undefined,
        before: beforeDate || undefined,
        max_results: parseInt(maxResults) || 500,
      }
      if (manualAccessToken) {
        body.access_token = manualAccessToken
      }

      const res = await fetch('/api/gmail/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()
      if (!res.ok) {
        if (data.need_oauth) {
          setNeedOAuth(true)
          setGmailError('Gmail non connecte. Cliquez sur "Connecter Gmail" ou collez un token manuellement.')
        } else {
          setGmailError(data.error + (data.hint ? `\n${data.hint}` : ''))
        }
        return
      }

      setGmailResult(data)
    } catch (err) {
      setGmailError((err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Synchroniser les emails Gmail
        </CardTitle>
        <CardDescription>
          Importez vos emails directement depuis Gmail. Ils seront automatiquement lies aux prospects existants.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Date filters */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Emails depuis</label>
            <input
              type="text"
              value={afterDate}
              onChange={(e) => setAfterDate(e.target.value)}
              placeholder="2023/01/01"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Jusqu&apos;au (optionnel)</label>
            <input
              type="text"
              value={beforeDate}
              onChange={(e) => setBeforeDate(e.target.value)}
              placeholder="2025/12/31"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">Nombre max</label>
            <Select value={maxResults} onValueChange={setMaxResults}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="250">250</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1 000</SelectItem>
                <SelectItem value="2000">2 000</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Main action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            onClick={() => handleGmailImport()}
            disabled={importing}
            className="flex-1 gap-2"
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Import en cours... (quelques minutes)
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Lancer la synchronisation
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.href = '/api/gmail/oauth/authorize'}
            className="gap-2"
          >
            Connecter Gmail
          </Button>
        </div>

        {/* Manual token fallback */}
        {(needOAuth || showManual) && (
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-blue-400">Token manuel (si OAuth non configure)</p>
              {!needOAuth && (
                <button onClick={() => setShowManual(false)} className="text-xs text-muted-foreground hover:text-foreground">
                  Fermer
                </button>
              )}
            </div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
              <li>Allez sur <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">OAuth Playground</a></li>
              <li>Selectionnez <strong>Gmail API v1</strong> → <code className="bg-muted px-1 rounded text-[11px]">gmail.readonly</code></li>
              <li>Authorize → Exchange → Copiez le <strong>Access token</strong></li>
            </ol>
            <div className="flex gap-2">
              <input
                type="password"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="ya29.a0AfH6SM..."
                className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                size="sm"
                onClick={() => handleGmailImport(manualToken.trim())}
                disabled={importing || !manualToken.trim()}
              >
                Importer
              </Button>
            </div>
          </div>
        )}

        {!showManual && !needOAuth && (
          <button
            onClick={() => setShowManual(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Utiliser un token manuel
          </button>
        )}

        {/* Error */}
        {gmailError && !needOAuth && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="whitespace-pre-wrap">{gmailError}</p>
          </div>
        )}

        {/* Results */}
        {gmailResult && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <p className="text-sm font-medium text-emerald-300">
                {String(gmailResult.message || 'Import termine')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-emerald-400/80 sm:grid-cols-4">
              <div>Emails trouves: <strong>{String(gmailResult.total_fetched || 0)}</strong></div>
              <div>Stockes: <strong>{String(gmailResult.emails_stored || 0)}</strong></div>
              <div>Lies a prospects: <strong>{String(gmailResult.emails_linked || 0)}</strong></div>
              <div>Deja importes: <strong>{String(gmailResult.already_exists || 0)}</strong></div>
              <div>Prospects crees: <strong>{String(gmailResult.prospects_created || 0)}</strong></div>
              <div>Activites creees: <strong>{String(gmailResult.activities_created || 0)}</strong></div>
              <div>Stages changes: <strong>{String(gmailResult.stage_changes || 0)}</strong></div>
              <div>Ignores: <strong>{String(gmailResult.skipped || 0)}</strong></div>
            </div>
            {Array.isArray(gmailResult.errors) && (gmailResult.errors as string[]).length > 0 && (
              <div className="mt-2 text-xs text-amber-400">
                {(gmailResult.errors as string[]).length} erreur(s) — {(gmailResult.errors as string[]).slice(0, 5).join(', ')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Step Badge ───

function StepBadge({
  number,
  label,
  active,
  completed,
}: {
  number: number
  label: string
  active: boolean
  completed: boolean
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          completed
            ? 'bg-emerald-500 text-white'
            : active
              ? 'bg-brand-accent text-white'
              : 'bg-muted text-muted-foreground'
        }`}
      >
        {completed ? <CheckCircle2 className="h-4 w-4" /> : number}
      </div>
      <span
        className={`text-sm font-medium ${
          active ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
    </div>
  )
}
