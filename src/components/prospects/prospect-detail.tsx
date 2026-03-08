'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Mail,
  Phone,
  Linkedin,
  MapPin,
  Globe,
  Copy,
  Check,
  StickyNote,
  PhoneCall,
  Send,
  ClipboardPaste,
  CalendarClock,
  Pencil,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  BrainCircuit,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Prospect, Activity, PipelineStage, Email } from '@/lib/types'
import { updateProspect, createActivity } from '@/lib/actions'
import { ActivityTimeline } from './activity-timeline'
import { AddActivityDialog } from './add-activity-dialog'
import { ScheduleAction } from './schedule-action'
import { AIProspectPanel } from '@/components/ai/ai-prospect-panel'
import { EmailThread } from '@/components/emails/email-thread'
import { EditProspectDialog } from './edit-prospect-dialog'
import { CompanyContextPanel } from './company-context-panel'

interface ProspectDetailProps {
  prospect: Prospect
  activities: Activity[]
  stages: PipelineStage[]
  emails?: Email[]
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [value])

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      onClick={handleCopy}
      className="shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </Button>
  )
}

function ContactRow({
  icon: Icon,
  label,
  value,
  href,
  external,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
  href?: string
  external?: boolean
}) {
  if (!value) return null

  return (
    <div className="flex items-center justify-between gap-2 py-2">
      <div className="flex items-center gap-3 min-w-0">
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {href ? (
            <a
              href={href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="text-sm font-medium text-brand-accent hover:underline truncate block"
            >
              {value}
            </a>
          ) : (
            <p className="text-sm font-medium truncate">{value}</p>
          )}
        </div>
      </div>
      <CopyButton value={value} />
    </div>
  )
}

export function ProspectDetail({
  prospect: initialProspect,
  activities,
  stages,
  emails = [],
}: ProspectDetailProps) {
  const router = useRouter()
  const [prospect, setProspect] = useState(initialProspect)
  const [notes, setNotes] = useState(prospect.notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [changingStage, setChangingStage] = useState(false)
  const [dialogType, setDialogType] = useState<
    'note' | 'call' | 'email_sent' | 'email_received' | 'transcription' | 'linkedin_interaction' | null
  >(null)
  const [editOpen, setEditOpen] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(!!initialProspect.notes)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<string | null>(null)

  const currentStage = stages.find((s) => s.slug === prospect.pipeline_stage)

  const handleStageChange = async (newStageSlug: string) => {
    if (newStageSlug === prospect.pipeline_stage) return
    setChangingStage(true)
    try {
      const oldStage = stages.find((s) => s.slug === prospect.pipeline_stage)
      const newStage = stages.find((s) => s.slug === newStageSlug)
      const updated = await updateProspect(prospect.id, {
        pipeline_stage: newStageSlug,
      })
      setProspect(updated)
      await createActivity({
        prospect_id: prospect.id,
        type: 'status_change',
        content: `Pipeline : ${oldStage?.name || prospect.pipeline_stage} \u2192 ${newStage?.name || newStageSlug}`,
        metadata: {
          from: prospect.pipeline_stage,
          to: newStageSlug,
        },
      })
      router.refresh()
    } catch (error) {
      console.error('Erreur changement de stage:', error)
    } finally {
      setChangingStage(false)
    }
  }

  const handleNotesBlur = async () => {
    if (notes === (prospect.notes || '')) return
    setSavingNotes(true)
    try {
      const updated = await updateProspect(prospect.id, { notes })
      setProspect(updated)
    } catch (error) {
      console.error('Erreur sauvegarde notes:', error)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleActivitySaved = () => {
    setDialogType(null)
    router.refresh()
  }

  const handleAnalyzeIA = async () => {
    setAnalyzing(true)
    setAnalysisResult(null)
    try {
      const res = await fetch('/api/ai/analyze-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal': 'true' },
        body: JSON.stringify({ prospect_id: prospect.id }),
      })
      const data = await res.json()
      if (data.results?.[0]) {
        const r = data.results[0]
        if (r.old_stage !== r.new_stage) {
          setAnalysisResult(`${r.old_stage} → ${r.new_stage} : ${r.reason}`)
          const newStage = stages.find(s => s.slug === r.new_stage)
          if (newStage) setProspect(prev => ({ ...prev, pipeline_stage: r.new_stage }))
          router.refresh()
        } else {
          setAnalysisResult(`Stage confirme (${r.new_stage}) : ${r.reason}`)
        }
      } else {
        setAnalysisResult('Analyse terminee — aucun changement suggere')
      }
      setTimeout(() => setAnalysisResult(null), 8000)
    } catch {
      setAnalysisResult('Erreur — verifiez vos credits API')
      setTimeout(() => setAnalysisResult(null), 5000)
    } finally {
      setAnalyzing(false)
    }
  }

  const fullName = [prospect.prenom, prospect.nom].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Link href="/prospects">
            <Button variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
              <ArrowLeft className="size-4" />
              Retour aux prospects
            </Button>
          </Link>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {fullName || 'Sans nom'}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
                {prospect.entreprise && (
                  <span className="text-sm font-medium text-muted-foreground">
                    {prospect.entreprise}
                  </span>
                )}
                {prospect.entreprise && prospect.fonction && (
                  <span className="text-white/20">&middot;</span>
                )}
                {prospect.fonction && (
                  <span className="text-sm text-muted-foreground">
                    {prospect.fonction}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="size-4" />
                Modifier
              </Button>
              {prospect.linkedin_url && (
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                >
                  <a
                    href={prospect.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Linkedin className="size-4" />
                    Profil LinkedIn
                    <ExternalLink className="size-3" />
                  </a>
                </Button>
              )}
              <Select
                value={prospect.pipeline_stage}
                onValueChange={handleStageChange}
                disabled={changingStage}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Stage pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.slug}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block size-2 rounded-full"
                          style={{ backgroundColor: stage.color }}
                        />
                        {stage.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Statut commercial + categorie */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          {prospect.statut_commercial && (
            <Badge variant="outline" className="text-sm px-3 py-1">
              {prospect.statut_commercial}
            </Badge>
          )}
          {prospect.categorie && (
            <Badge
              variant="secondary"
              className={cn(
                'text-sm px-3 py-1 border-0',
                prospect.categorie === 'Partenaire' && 'bg-violet-500/20 text-violet-400',
                prospect.categorie === 'Prescripteur / Reseau' && 'bg-amber-500/20 text-amber-400',
              )}
            >
              {prospect.categorie}
            </Badge>
          )}
          {currentStage && (
            <Badge
              className="text-sm px-3 py-1 border-0"
              style={{
                backgroundColor: currentStage.color + '20',
                color: currentStage.color,
              }}
            >
              {currentStage.name}
            </Badge>
          )}
        </div>

        {/* Quick actions bar */}
        <Card className="mb-6 py-3">
          <CardContent className="space-y-2">
            <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogType('note')}
            >
              <StickyNote className="size-4" />
              Ajouter note
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogType('call')}
            >
              <PhoneCall className="size-4" />
              Logger appel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogType('email_sent')}
            >
              <Send className="size-4" />
              Logger email envoye
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogType('email_received')}
            >
              <Mail className="size-4" />
              Logger email recu
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogType('linkedin_interaction')}
            >
              <Linkedin className="size-4" />
              Logger LinkedIn
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDialogType('transcription')}
            >
              <ClipboardPaste className="size-4" />
              Coller transcription
            </Button>
            <Button
              size="sm"
              onClick={handleAnalyzeIA}
              disabled={analyzing}
              className="bg-brand-accent hover:bg-brand-accent/90 text-white ml-auto"
            >
              {analyzing ? <Loader2 className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
              {analyzing ? 'Analyse...' : 'Analyser IA'}
            </Button>
            </div>
            {analysisResult && (
              <div className="rounded-md bg-brand-accent/10 border border-brand-accent/20 px-3 py-2 text-sm text-brand-accent">
                {analysisResult}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left column */}
          <div className="space-y-6 lg:col-span-2">
            {/* Notes section — collapsible */}
            <Card>
              <CardHeader className="cursor-pointer" onClick={() => setNotesExpanded(!notesExpanded)}>
                <CardTitle className="flex items-center gap-2 text-base">
                  {notesExpanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  <StickyNote className="size-4" />
                  Notes
                  {savingNotes && (
                    <span className="text-xs font-normal text-muted-foreground">
                      Sauvegarde...
                    </span>
                  )}
                  {!notesExpanded && notes && (
                    <span className="text-xs font-normal text-muted-foreground truncate max-w-[300px]">
                      — {notes.slice(0, 80)}{notes.length > 80 ? '...' : ''}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              {notesExpanded && (
                <CardContent>
                  <Textarea
                    placeholder="Ajouter des notes sur ce prospect..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    onBlur={handleNotesBlur}
                    className="min-h-[120px] resize-y"
                  />
                </CardContent>
              )}
            </Card>

            {/* Prochaine action */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="size-4" />
                  Prochaine action
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScheduleAction
                  prospectId={prospect.id}
                  currentDate={prospect.date_prochaine_action}
                  currentType={prospect.type_prochaine_action}
                  onSaved={(updated) => setProspect(updated)}
                />
              </CardContent>
            </Card>

            {/* Email thread (from Gmail sync) */}
            <EmailThread emails={emails} prospectId={prospect.id} />

            {/* Activity timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Historique d&apos;activites
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityTimeline activities={activities} />
              </CardContent>
            </Card>

            {/* AI Assistant panel */}
            <AIProspectPanel prospect={prospect} />
          </div>

          {/* Right column - Contact info */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Coordonnees</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <ContactRow
                  icon={Mail}
                  label="Email"
                  value={prospect.email}
                  href={prospect.email ? `mailto:${prospect.email}` : undefined}
                />
                <Separator />
                <ContactRow
                  icon={Mail}
                  label="Email pro"
                  value={prospect.email_pro}
                  href={
                    prospect.email_pro
                      ? `mailto:${prospect.email_pro}`
                      : undefined
                  }
                />
                <Separator />
                <ContactRow
                  icon={Phone}
                  label="Telephone"
                  value={prospect.telephone}
                  href={
                    prospect.telephone
                      ? `tel:${prospect.telephone}`
                      : undefined
                  }
                />
                <Separator />
                <ContactRow
                  icon={Linkedin}
                  label="LinkedIn"
                  value={prospect.linkedin_url}
                  href={prospect.linkedin_url || undefined}
                  external
                />
                <Separator />
                <ContactRow
                  icon={Globe}
                  label="Site web"
                  value={prospect.site_web}
                  href={prospect.site_web || undefined}
                  external
                />
                <Separator />
                <ContactRow
                  icon={MapPin}
                  label="Localisation"
                  value={
                    [prospect.localisation, prospect.pays]
                      .filter(Boolean)
                      .join(', ') || null
                  }
                />
                <Separator />
                <ContactRow
                  icon={Globe}
                  label="Source"
                  value={prospect.source}
                />
              </CardContent>
            </Card>

            {/* Company context — other contacts from same company */}
            <CompanyContextPanel prospect={prospect} />

            {/* Dates */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {prospect.date_premier_contact && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Premier contact
                    </p>
                    <p className="text-sm font-medium">
                      {new Date(
                        prospect.date_premier_contact
                      ).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
                {prospect.date_dernier_contact && (
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Dernier contact
                    </p>
                    <p className="text-sm font-medium">
                      {new Date(
                        prospect.date_dernier_contact
                      ).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">
                    Cree le
                  </p>
                  <p className="text-sm font-medium">
                    {new Date(prospect.created_at).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Activity dialogs */}
      {dialogType && (
        <AddActivityDialog
          prospectId={prospect.id}
          type={dialogType}
          open={!!dialogType}
          onOpenChange={(open) => {
            if (!open) setDialogType(null)
          }}
          onSave={handleActivitySaved}
        />
      )}

      {/* Edit prospect dialog */}
      <EditProspectDialog
        prospect={prospect}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSave={(updated) => {
          setProspect(updated)
          setNotes(updated.notes || '')
          router.refresh()
        }}
      />
    </div>
  )
}
