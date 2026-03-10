'use client'

import { useState, useEffect } from 'react'
import { Mail, Calendar, BrainCircuit, Loader2, RefreshCw, Unlink, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface GmailStatus {
  connected: boolean
  email: string | null
  lastSync: string | null
  emailCount: number
}

interface CalendarStatus {
  connected: boolean
}

interface AIStatus {
  connected: boolean
  apiKeySet: boolean
  defaultModel: string | null
  monthCalls: number
  monthTokens: number
  monthCost: number
  budget?: { limit: number; warning: number; current: number } | null
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMinutes < 1) return "A l'instant"
  if (diffMinutes < 60) return `Il y a ${diffMinutes} min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  if (diffDays < 7) return `Il y a ${diffDays}j`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function ConnectionsPanel() {
  const [gmail, setGmail] = useState<GmailStatus | null>(null)
  const [calendar, setCalendar] = useState<CalendarStatus | null>(null)
  const [ai, setAI] = useState<AIStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/gmail/status').then(r => r.json()).catch(() => ({ connected: false, email: null, lastSync: null, emailCount: 0 })),
      fetch('/api/calendar/status').then(r => r.json()).catch(() => ({ connected: false })),
      fetch('/api/ai/status').then(r => r.json()).catch(() => ({ connected: false, apiKeySet: false, defaultModel: null, monthCalls: 0, monthTokens: 0, monthCost: 0 })),
    ]).then(([g, c, a]) => {
      setGmail(g)
      setCalendar(c)
      setAI(a)
    }).finally(() => setLoading(false))
  }, [])

  const handleResync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/gmail/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ after: getSevenDaysAgo(), max_results: 500 }),
      })
      const data = await res.json()
      if (res.ok) {
        setSyncResult(`${data.emails_stored || 0} emails importes, ${data.emails_linked || 0} lies`)
        // Refresh gmail status
        const g = await fetch('/api/gmail/status').then(r => r.json()).catch(() => gmail)
        setGmail(g)
      } else {
        setSyncResult(data.error || 'Erreur de synchronisation')
      }
    } catch {
      setSyncResult('Erreur reseau')
    }
    setSyncing(false)
    setTimeout(() => setSyncResult(null), 5000)
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/gmail/disconnect', { method: 'POST' })
      setGmail({ connected: false, email: null, lastSync: null, emailCount: 0 })
      setCalendar({ connected: false })
    } catch { /* ignore */ }
    setDisconnecting(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Gmail */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <Mail className="size-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Gmail</h3>
                <StatusDot connected={gmail?.connected || false} />
              </div>

              {gmail?.connected ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    {gmail.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {gmail.lastSync
                      ? `Derniere sync : ${formatRelativeTime(gmail.lastSync)}`
                      : 'Jamais synchronise'}
                    {' · '}
                    {gmail.emailCount.toLocaleString('fr-FR')} emails importes
                  </p>
                  {syncResult && (
                    <p className="text-xs text-emerald-400">{syncResult}</p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connectez Gmail pour envoyer des emails, synchroniser vos conversations et activer les sequences.
                </p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {gmail?.connected ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResync}
                    disabled={syncing}
                    className="h-8 gap-1.5 text-xs"
                  >
                    {syncing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Re-synchroniser
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-red-400"
                  >
                    {disconnecting ? <Loader2 className="size-3.5 animate-spin" /> : <Unlink className="size-3.5" />}
                    Deconnecter
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => window.location.href = '/api/gmail/oauth/authorize'}
                  className="h-8 gap-1.5"
                >
                  <ExternalLink className="size-3.5" />
                  Connecter Gmail
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Google Calendar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Calendar className="size-5 text-blue-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Google Calendar</h3>
                <StatusDot connected={calendar?.connected || false} />
              </div>
              {calendar?.connected ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Connecte via le meme compte Google que Gmail
                </p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  {gmail?.connected
                    ? 'Scope Calendar non autorise. Reconnectez Gmail pour activer.'
                    : 'Connectez Gmail pour activer le calendrier (meme authentification).'}
                </p>
              )}
            </div>
            {!calendar?.connected && gmail?.connected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.location.href = '/api/gmail/oauth/authorize'}
                className="h-8 gap-1.5 text-xs shrink-0"
              >
                <ExternalLink className="size-3.5" />
                Reconnecter
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* API Anthropic */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-accent/10">
              <BrainCircuit className="size-5 text-brand-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">API Anthropic</h3>
                <StatusDot connected={ai?.connected || false} />
              </div>
              {ai?.connected ? (
                <div className="mt-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    Modele par defaut : {ai.defaultModel}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Ce mois : {ai.monthCalls} appels · {ai.monthTokens.toLocaleString('fr-FR')} tokens · ~${ai.monthCost.toFixed(2)}
                  </p>
                  {ai.budget && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                        <span>Budget</span>
                        <span>${ai.budget.current.toFixed(2)} / ${ai.budget.limit.toFixed(2)}</span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            ai.budget.current >= ai.budget.limit
                              ? 'bg-red-500'
                              : ai.budget.current >= ai.budget.warning
                                ? 'bg-orange-500'
                                : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.min(100, (ai.budget.current / ai.budget.limit) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  ANTHROPIC_API_KEY non configuree. Ajoutez-la dans les variables d&apos;environnement.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
      connected
        ? 'bg-emerald-500/15 text-emerald-400'
        : 'bg-white/10 text-muted-foreground'
    }`}>
      <span className={`size-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
      {connected ? 'Connecte' : 'Non connecte'}
    </span>
  )
}

function getSevenDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
