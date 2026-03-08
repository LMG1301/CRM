'use client'

import { useState, useEffect } from 'react'
import { Loader2, RefreshCw, Send, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ComposeEmailDialog } from '@/components/emails/compose-email-dialog'
import type { ContentSuggestion } from '@/lib/types'
import { CONTENT_TYPES, type ContentType } from '@/lib/types'

interface SuggestedContentsProps {
  prospectId: string
  prospectEmail: string
}

export function SuggestedContents({ prospectId, prospectEmail }: SuggestedContentsProps) {
  const [suggestions, setSuggestions] = useState<ContentSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [composeOpen, setComposeOpen] = useState(false)
  const [selectedContentId, setSelectedContentId] = useState<string | null>(null)

  const fetchSuggestions = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/match-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospect_id: prospectId }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Erreur')
        return
      }
      const data = await res.json()
      setSuggestions(data.suggestions || [])
    } catch {
      setError('Erreur de connexion')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSuggestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospectId])

  const handleSendEmail = (contentId: string) => {
    setSelectedContentId(contentId)
    setComposeOpen(true)
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-white/[0.06] p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Recherche de contenus pertinents...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-white/[0.06] p-4">
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs" onClick={fetchSuggestions}>
          Reessayer
        </Button>
      </div>
    )
  }

  if (suggestions.length === 0) {
    return null // Don't show section if no suggestions
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Contenus suggeres</h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
            onClick={fetchSuggestions}
            disabled={loading}
          >
            <RefreshCw className="h-3 w-3" />
            Rafraichir
          </Button>
        </div>

        <div className="space-y-2">
          {suggestions.map(s => (
            <Card key={s.content.id} className="border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {s.content.title}
                    </span>
                    {s.content.url && (
                      <a
                        href={s.content.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {CONTENT_TYPES[s.content.content_type as ContentType] || s.content.content_type}
                    </Badge>
                    <span className="text-[10px] text-brand-accent font-medium">
                      {s.relevance_score}% pertinent
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                    {s.reason}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1 text-xs"
                  onClick={() => handleSendEmail(s.content.id)}
                  disabled={!prospectEmail}
                >
                  <Send className="h-3 w-3" />
                  Email
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <ComposeEmailDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        prospectId={prospectId}
        prospectEmail={prospectEmail}
        contentId={selectedContentId}
      />
    </>
  )
}
