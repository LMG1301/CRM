'use client'

import { useState, useCallback, useEffect } from 'react'
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
  ClipboardPaste,
  CalendarClock,
  Pencil,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  SkipForward,
  ListTodo,
  Zap,
  Square,
  Loader2,
  MoreHorizontal,
  Mic,
  Trash2,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Prospect, Activity, PipelineStage, Email, SequenceEnrollment } from '@/lib/types'
import { updateProspect, createActivity } from '@/lib/actions'
import { ActivityTimeline } from './activity-timeline'
import { AddActivityDialog } from './add-activity-dialog'
import { ScheduleAction } from './schedule-action'
import { AIProspectPanel } from '@/components/ai/ai-prospect-panel'
import { EmailThread } from '@/components/emails/email-thread'
import { EditProspectDialog } from './edit-prospect-dialog'
import { VoiceRecorder } from './voice-recorder'
import { CompanyContextPanel } from './company-context-panel'
import { DealGroupPanel } from './deal-group-panel'
import { MachinesParcPanel } from './machines-parc-panel'
import { ProspectMeetings } from './prospect-meetings'
import { EnrollSequenceDialog } from '@/components/sequences/enroll-sequence-dialog'
import { EditSequenceEmailDialog } from '@/components/sequences/edit-sequence-email-dialog'

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
  const [voiceRecorderOpen, setVoiceRecorderOpen] = useState(false)
  const [notesExpanded, setNotesExpanded] = useState(!!initialProspect.notes)
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; due_date: string; status: string }>>([])
  const [tasksLoading, setTasksLoading] = useState(true)
  const [sequenceDialogOpen, setSequenceDialogOpen] = useState(false)
  const [enrollments, setEnrollments] = useState<SequenceEnrollment[]>([])
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true)
  const [unenrolling, setUnenrolling] = useState<string | null>(null)
  const [showSeqHistory, setShowSeqHistory] = useState(false)
  const [deletingEnrollment, setDeletingEnrollment] = useState<string | null>(null)
  const [editingSeqEnrollment, setEditingSeqEnrollment] = useState<SequenceEnrollment | null>(null)
  const [approvingSeq, setApprovingSeq] = useState<string | null>(null)

  // Load tasks for this prospect
  useEffect(() => {
    fetch(`/api/tasks?prospect_id=${initialProspect.id}`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setTasks(data) })
      .catch(() => {})
      .finally(() => setTasksLoading(false))
  }, [initialProspect.id])

  // Load sequence enrollments for this prospect
  const loadEnrollments = useCallback(() => {
    setEnrollmentsLoading(true)
    fetch(`/api/sequences/enroll?prospect_id=${initialProspect.id}`)
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setEnrollments(data) })
      .catch(() => {})
      .finally(() => setEnrollmentsLoading(false))
  }, [initialProspect.id])

  useEffect(() => { loadEnrollments() }, [loadEnrollments])

  const handleUnenroll = async (enrollmentId: string) => {
    setUnenrolling(enrollmentId)
    try {
      await fetch('/api/sequences/unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId }),
      })
      loadEnrollments()
    } catch { /* ignore */ }
    setUnenrolling(null)
  }

  const handleDeleteEnrollment = async (enrollmentId: string, isActive: boolean) => {
    if (isActive) {
      const ok = window.confirm('Arreter et supprimer cette sequence ?')
      if (!ok) return
    }
    setDeletingEnrollment(enrollmentId)
    try {
      await fetch(`/api/sequences/enrollment/${enrollmentId}`, { method: 'DELETE' })
      loadEnrollments()
    } catch { /* ignore */ }
    setDeletingEnrollment(null)
  }

  const handleApproveSequenceEmail = async (enrollmentId: string) => {
    setApprovingSeq(enrollmentId)
    try {
      const res = await fetch('/api/sequences/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enrollment_id: enrollmentId }),
      })
      if (res.ok) {
        loadEnrollments()
      } else {
        const data = await res.json()
        alert(`Erreur: ${data.error || 'Erreur inconnue'}`)
      }
    } catch (err) {
      alert(`Erreur reseau: ${(err as Error).message}`)
    }
    setApprovingSeq(null)
  }

  const handleTaskAction = async (taskId: string, status: 'done' | 'skipped') => {
    try {
      await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status }),
      })
      setTasks(prev => prev.filter(t => t.id !== taskId))
    } catch { /* ignore */ }
  }

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

  const fullName = [prospect.prenom, prospect.nom].filter(Boolean).join(' ')

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            className="mb-4 -ml-2 text-muted-foreground"
            onClick={() => router.back()}
          >
            <ArrowLeft className="size-4" />
            Retour
          </Button>

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
          <CardContent>
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
              <Mail className="size-4" />
              Logger email
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
              onClick={() => setVoiceRecorderOpen(true)}
            >
              <Mic className="size-4" />
              Note vocale
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDialogType('transcription')}>
                  <ClipboardPaste className="size-4" />
                  Coller transcription
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
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
                  prospectName={[prospect.prenom, prospect.nom].filter(Boolean).join(' ')}
                  prospectEmail={prospect.email || prospect.email_pro || undefined}
                  currentDate={prospect.date_prochaine_action}
                  currentType={prospect.type_prochaine_action}
                  currentDescription={prospect.description_prochaine_action}
                  onSaved={(updated) => setProspect(updated)}
                />
              </CardContent>
            </Card>

            {/* Tasks */}
            {!tasksLoading && tasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ListTodo className="size-4" />
                    Taches
                    <Badge variant="secondary" className="text-xs">{tasks.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tasks.map(task => {
                    const due = new Date(task.due_date)
                    const now = new Date()
                    const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    const isOverdue = diffDays < 0
                    const dueLabel = isOverdue
                      ? `En retard (${Math.abs(diffDays)}j)`
                      : diffDays === 0
                        ? "Aujourd'hui"
                        : `Dans ${diffDays}j`
                    return (
                      <div key={task.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{task.title}</p>
                          <p className={cn('text-xs', isOverdue ? 'text-red-400' : 'text-muted-foreground')}>
                            {dueLabel}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-green-500 hover:text-green-400"
                            onClick={() => handleTaskAction(task.id, 'done')}
                            title="Marquer comme fait"
                          >
                            <CheckCircle2 className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => handleTaskAction(task.id, 'skipped')}
                            title="Passer"
                          >
                            <SkipForward className="size-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

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
            <AIProspectPanel prospect={prospect} onEnrolled={loadEnrollments} />
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

            {/* Sequence enrollment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Zap className="size-4" />
                  Sequences
                  {enrollments.filter(e => e.status === 'active').length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {enrollments.filter(e => e.status === 'active').length} active{enrollments.filter(e => e.status === 'active').length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {enrollmentsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (() => {
                  const activeEnrollments = enrollments.filter(e => e.status === 'active')
                  const pastEnrollments = enrollments.filter(e => e.status !== 'active')

                  return (
                    <div className="space-y-3">
                      {/* Active sequences */}
                      {activeEnrollments.length > 0 ? (
                        activeEnrollments.map(enrollment => {
                          const seq = enrollment.sequence
                          const totalSteps = seq?.steps?.length || 0
                          const currentStep = Math.min(enrollment.current_step, totalSteps)
                          const pendingEmail = enrollment.pending_email as { subject?: string; body_text?: string; step_position?: number } | null

                          return (
                            <div key={enrollment.id} className="rounded-lg border border-brand-accent/20 bg-brand-accent/5 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium truncate">{seq?.name || 'Sequence'}</p>
                                    <Badge variant="secondary" className="text-[10px] shrink-0 border-0 text-brand-accent bg-brand-accent/10">
                                      Active
                                    </Badge>
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Etape {currentStep + 1}/{totalSteps}
                                    {enrollment.send_mode === 'auto' && ' — Auto'}
                                    {enrollment.next_step_date && (
                                      <> — Prochain envoi : {new Date(enrollment.next_step_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</>
                                    )}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 px-2 text-xs text-red-400 hover:text-red-300 shrink-0"
                                  onClick={() => handleUnenroll(enrollment.id)}
                                  disabled={unenrolling === enrollment.id}
                                >
                                  {unenrolling === enrollment.id ? (
                                    <Loader2 className="size-3 animate-spin" />
                                  ) : (
                                    <Square className="size-3" />
                                  )}
                                  Retirer
                                </Button>
                              </div>

                              {/* Step progress bar */}
                              {totalSteps > 0 && (
                                <div className="mt-2 flex gap-1">
                                  {Array.from({ length: totalSteps }).map((_, i) => {
                                    const done = i < currentStep
                                    const current = i === currentStep
                                    return (
                                      <div
                                        key={i}
                                        className={cn(
                                          'h-1.5 flex-1 rounded-full transition-colors',
                                          done ? 'bg-green-500' :
                                          current ? 'bg-amber-400' :
                                          'bg-white/[0.08]'
                                        )}
                                        title={`Etape ${i + 1}${done ? ' — Envoyee' : current ? ' — En cours' : ''}`}
                                      />
                                    )
                                  })}
                                </div>
                              )}

                              {/* Pending email preview + actions */}
                              {pendingEmail && (
                                <div className="mt-2 rounded-md border border-amber-400/20 bg-amber-400/5 px-2.5 py-2">
                                  <div className="flex items-center gap-1.5 mb-1">
                                    <Mail className="size-3 text-amber-400" />
                                    <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wide">
                                      Email en attente
                                    </span>
                                  </div>
                                  <p className="text-xs font-medium text-foreground truncate">
                                    {pendingEmail.subject || '(Sans objet)'}
                                  </p>
                                  {pendingEmail.body_text && (
                                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
                                      {pendingEmail.body_text.slice(0, 150)}
                                    </p>
                                  )}
                                  <div className="mt-2 flex items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      className="h-6 gap-1 bg-emerald-600 px-2 text-[11px] hover:bg-emerald-500"
                                      onClick={() => handleApproveSequenceEmail(enrollment.id)}
                                      disabled={approvingSeq === enrollment.id}
                                    >
                                      {approvingSeq === enrollment.id ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        <Check className="size-3" />
                                      )}
                                      Approuver
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 gap-1 px-2 text-[11px]"
                                      onClick={() => setEditingSeqEnrollment(enrollment)}
                                    >
                                      <Pencil className="size-3" />
                                      Modifier
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      ) : (
                        <div className="text-center py-3">
                          <p className="text-xs text-muted-foreground">Aucune sequence active</p>
                        </div>
                      )}

                      {/* History toggle */}
                      {pastEnrollments.length > 0 && (
                        <>
                          <button
                            className="flex w-full items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1"
                            onClick={() => setShowSeqHistory(!showSeqHistory)}
                          >
                            {showSeqHistory ? (
                              <ChevronUp className="size-3" />
                            ) : (
                              <ChevronDown className="size-3" />
                            )}
                            {showSeqHistory ? 'Masquer l\'historique' : `Voir l'historique (${pastEnrollments.length} terminee${pastEnrollments.length > 1 ? 's' : ''})`}
                          </button>

                          {showSeqHistory && (
                            <div className="space-y-2">
                              {pastEnrollments.map(enrollment => {
                                const seq = enrollment.sequence
                                const isCompleted = enrollment.status === 'completed'
                                const statusLabel = isCompleted ? 'Terminee' :
                                  enrollment.status === 'stopped_reply' ? 'Repondu' :
                                  'Arretee'
                                const statusColor = isCompleted ? 'text-green-400 bg-green-400/10' :
                                  enrollment.status === 'stopped_reply' ? 'text-blue-400 bg-blue-400/10' :
                                  'text-muted-foreground bg-white/[0.06]'
                                const dateStr = enrollment.completed_at || enrollment.stopped_at || enrollment.updated_at

                                return (
                                  <div key={enrollment.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                                    <div className="min-w-0 flex items-center gap-2">
                                      <p className="text-xs text-muted-foreground truncate">{seq?.name || 'Sequence'}</p>
                                      <Badge variant="secondary" className={cn('text-[10px] shrink-0 border-0', statusColor)}>
                                        {statusLabel}
                                      </Badge>
                                      {dateStr && (
                                        <span className="text-[10px] text-muted-foreground/50 shrink-0">
                                          {new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                                        </span>
                                      )}
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 text-red-400/50 hover:text-red-400 shrink-0"
                                      onClick={() => handleDeleteEnrollment(enrollment.id, false)}
                                      disabled={deletingEnrollment === enrollment.id}
                                    >
                                      {deletingEnrollment === enrollment.id ? (
                                        <Loader2 className="size-3 animate-spin" />
                                      ) : (
                                        <Trash2 className="size-3" />
                                      )}
                                    </Button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })()}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3"
                  onClick={() => setSequenceDialogOpen(true)}
                >
                  <Zap className="size-4" />
                  Inscrire dans une sequence
                </Button>
              </CardContent>
            </Card>

            {/* Calendar meetings with this prospect */}
            <ProspectMeetings
              prospectName={[prospect.prenom, prospect.nom].filter(Boolean).join(' ')}
              prospectEmail={prospect.email || prospect.email_pro || undefined}
            />

            {/* Company context — other contacts from same company */}
            <CompanyContextPanel prospect={prospect} />

            {/* Deal group — other prospects on same opportunity */}
            <DealGroupPanel prospect={prospect} />

            {/* Parc machines — only for onboarding/client stages */}
            {['onboarding', 'client'].includes(prospect.pipeline_stage) && (
              <MachinesParcPanel prospectId={prospect.id} entreprise={prospect.entreprise} />
            )}

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

      {/* Voice recorder dialog */}
      <VoiceRecorder
        prospectId={prospect.id}
        open={voiceRecorderOpen}
        onOpenChange={setVoiceRecorderOpen}
        onSave={() => {
          setVoiceRecorderOpen(false)
          handleActivitySaved()
        }}
      />

      {/* Sequence enrollment dialog */}
      <EnrollSequenceDialog
        open={sequenceDialogOpen}
        onOpenChange={setSequenceDialogOpen}
        prospectIds={[prospect.id]}
        prospectName={fullName}
        onEnrolled={loadEnrollments}
      />

      {/* Edit sequence email dialog */}
      {editingSeqEnrollment && (
        <EditSequenceEmailDialog
          open={!!editingSeqEnrollment}
          onOpenChange={(open) => { if (!open) setEditingSeqEnrollment(null) }}
          enrollment={editingSeqEnrollment}
          onSaved={() => {
            setEditingSeqEnrollment(null)
            loadEnrollments()
          }}
        />
      )}

    </div>
  )
}
