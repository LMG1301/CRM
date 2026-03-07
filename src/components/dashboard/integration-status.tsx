'use client'

import { CheckCircle, XCircle, AlertTriangle, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Integration } from '@/lib/types'
import { INTEGRATION_LABELS, INTEGRATION_ICONS } from '@/lib/types'

interface IntegrationStatusProps {
  integrations: Integration[]
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'connected':
      return <CheckCircle className="h-4 w-4 text-emerald-500" />
    case 'error':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />
    default:
      return <XCircle className="h-4 w-4 text-white/20" />
  }
}

function formatLastSync(dateStr: string | null): string {
  if (!dateStr) return 'Jamais'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMinutes / 60)

  if (diffMinutes < 1) return 'A l\'instant'
  if (diffMinutes < 60) return `Il y a ${diffMinutes}min`
  if (diffHours < 24) return `Il y a ${diffHours}h`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function IntegrationStatus({ integrations }: IntegrationStatusProps) {
  const connectedCount = integrations.filter(i => i.status === 'connected').length

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="size-5 text-brand-accent" />
            Integrations
          </CardTitle>
          <Badge variant={connectedCount > 0 ? 'default' : 'secondary'} className="text-xs">
            {connectedCount}/{integrations.length} actives
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {integrations.map((integration) => {
            const label = INTEGRATION_LABELS[integration.service] || integration.service
            const icon = INTEGRATION_ICONS[integration.service] || '🔗'

            return (
              <div
                key={integration.id}
                className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{icon}</span>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    {integration.status === 'connected' && (
                      <p className="text-xs text-muted-foreground">
                        Derniere sync : {formatLastSync(integration.last_sync)}
                        {integration.sync_count > 0 && ` · ${integration.sync_count} elements`}
                      </p>
                    )}
                    {integration.status === 'error' && integration.error_message && (
                      <p className="text-xs text-amber-500">{integration.error_message}</p>
                    )}
                    {integration.status === 'disconnected' && (
                      <p className="text-xs text-muted-foreground">Non connecte</p>
                    )}
                  </div>
                </div>
                <StatusIcon status={integration.status} />
              </div>
            )
          })}
        </div>

        {connectedCount === 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Configurez n8n pour connecter vos services.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
