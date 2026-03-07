'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, MailOpen, Send, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Email } from '@/lib/types'

interface EmailThreadProps {
  emails: Email[]
  prospectId?: string
}

function formatEmailDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  }
  if (diffDays === 1) return 'Hier'
  if (diffDays < 7) return `Il y a ${diffDays}j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function EmailRow({ email }: { email: Email }) {
  const [expanded, setExpanded] = useState(false)
  const isSent = email.direction === 'sent'

  return (
    <div
      className={`group rounded-lg border p-3 transition-colors hover:bg-white/5 cursor-pointer ${
        isSent
          ? 'border-brand-accent/20 bg-brand-accent/5 ml-6'
          : 'border-indigo-400/20 bg-indigo-500/5 mr-6'
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isSent ? 'bg-brand-accent/20 text-brand-accent' : 'bg-indigo-500/20 text-indigo-400'
        }`}>
          {isSent ? <Send className="h-3 w-3" /> : <MailOpen className="h-3 w-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-wide ${
              isSent ? 'text-brand-accent' : 'text-indigo-400'
            }`}>
              {isSent ? 'Envoye' : 'Recu'}
            </span>
            <span className="text-[10px] text-muted-foreground truncate">
              {isSent ? `→ ${email.to_email}` : `← ${email.from_email}`}
            </span>
            <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
              {formatEmailDate(email.gmail_date)}
            </span>
            {expanded ? (
              <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </div>
          <p className="mt-0.5 text-sm font-medium text-foreground truncate">
            {email.subject || '(Sans objet)'}
          </p>
          {!expanded && email.body_preview && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
              {email.body_preview}
            </p>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-3">
          {email.body_html ? (
            <div
              className="text-sm text-muted-foreground leading-relaxed prose prose-invert prose-sm max-w-none [&_a]:text-brand-accent [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: email.body_html }}
            />
          ) : email.body_text ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {email.body_text}
            </p>
          ) : email.body_preview ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {email.body_preview}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">Contenu non disponible</p>
          )}
        </div>
      )}
    </div>
  )
}

export function EmailThread({ emails, prospectId }: EmailThreadProps) {
  const router = useRouter()
  const [showAll, setShowAll] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const displayEmails = showAll ? emails : emails.slice(0, 5)
  const hasMore = emails.length > 5

  const handleSync = async () => {
    if (!prospectId || syncing) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch(`/api/prospects/${prospectId}/sync-emails`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        const parts: string[] = []
        if (data.emails_linked > 0) parts.push(`${data.emails_linked} emails lies`)
        if (data.activities_created > 0) parts.push(`${data.activities_created} activites creees`)
        if (data.stage_updated) parts.push(`Stage → ${data.new_stage}`)
        setSyncResult(parts.length > 0 ? parts.join(', ') : 'Deja a jour')
        if (data.emails_linked > 0 || data.activities_created > 0 || data.stage_updated) {
          router.refresh()
        }
      } else {
        setSyncResult(data.error || 'Erreur')
      }
    } catch {
      setSyncResult('Erreur de connexion')
    } finally {
      setSyncing(false)
    }
  }

  if (emails.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="size-4 text-[#EA4335]" />
              Emails
            </CardTitle>
            {prospectId && (
              <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sync...' : 'Sync emails'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="py-6 text-center">
            <Mail className="mx-auto size-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              Aucun email synchronise.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cliquez sur &quot;Sync emails&quot; pour lier les emails existants.
            </p>
          </div>
          {syncResult && (
            <p className="mt-2 text-center text-xs text-muted-foreground">{syncResult}</p>
          )}
        </CardContent>
      </Card>
    )
  }

  const sentCount = emails.filter(e => e.direction === 'sent').length
  const receivedCount = emails.filter(e => e.direction === 'received').length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-[#EA4335]" />
            Emails
            <Badge variant="secondary" className="text-xs">
              {emails.length}
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-3">
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>{sentCount} envoyes</span>
              <span>&middot;</span>
              <span>{receivedCount} recus</span>
            </div>
            {prospectId && (
              <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                <RefreshCw className={`size-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Sync...' : 'Sync'}
              </Button>
            )}
          </div>
        </div>
        {syncResult && (
          <p className="text-xs text-muted-foreground">{syncResult}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {displayEmails.map((email) => (
          <EmailRow key={email.id} email={email} />
        ))}
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? 'Voir moins' : `Voir les ${emails.length - 5} emails restants`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
