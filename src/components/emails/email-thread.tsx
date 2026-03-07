'use client'

import { useState } from 'react'
import { Mail, MailOpen, Send, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Email } from '@/lib/types'

interface EmailThreadProps {
  emails: Email[]
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
      className="group rounded-lg border border-white/5 p-3 transition-colors hover:bg-white/5 cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isSent ? 'bg-brand-accent/10 text-brand-accent' : 'bg-indigo-500/10 text-indigo-400'
        }`}>
          {isSent ? <Send className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {isSent ? 'Envoye' : 'Recu'}
            </Badge>
            <span className="text-xs text-muted-foreground truncate">
              {isSent ? email.to_email : email.from_email}
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {formatEmailDate(email.gmail_date)}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-foreground truncate">
            {email.subject || '(Sans objet)'}
          </p>
          {!expanded && email.body_preview && (
            <p className="mt-0.5 text-xs text-muted-foreground truncate">
              {email.body_preview}
            </p>
          )}
        </div>
        <div className="shrink-0 pt-1">
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 ml-11 rounded-md border border-white/10 bg-white/5 p-3">
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

export function EmailThread({ emails }: EmailThreadProps) {
  const [showAll, setShowAll] = useState(false)
  const displayEmails = showAll ? emails : emails.slice(0, 5)
  const hasMore = emails.length > 5

  if (emails.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4 text-[#EA4335]" />
            Emails
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="py-6 text-center">
            <Mail className="mx-auto size-8 text-muted-foreground/30" />
            <p className="mt-2 text-sm text-muted-foreground">
              Aucun email synchronise.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connectez Gmail via n8n pour synchroniser les emails.
            </p>
          </div>
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
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>{sentCount} envoyes</span>
            <span>&middot;</span>
            <span>{receivedCount} recus</span>
          </div>
        </div>
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
