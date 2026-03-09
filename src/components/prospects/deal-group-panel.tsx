'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Handshake, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Prospect } from '@/lib/types'
import { getDealGroupMembers } from '@/lib/actions'

interface DealGroupPanelProps {
  prospect: Prospect
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

export function DealGroupPanel({ prospect }: DealGroupPanelProps) {
  const [members, setMembers] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!prospect.deal_group) {
      setLoading(false)
      return
    }

    getDealGroupMembers(prospect.deal_group, prospect.id)
      .then(setMembers)
      .catch(() => setMembers([]))
      .finally(() => setLoading(false))
  }, [prospect.deal_group, prospect.id])

  if (!prospect.deal_group || (!loading && members.length === 0)) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Handshake className="size-4" />
          Meme opportunite
          <Badge variant="secondary" className="ml-auto text-xs bg-amber-500/10 text-amber-400 border-0">
            {prospect.deal_group}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <div className="space-y-3">
            {members.map((m) => (
              <Link
                key={m.id}
                href={`/prospects/${m.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] p-2.5 transition-colors hover:border-amber-500/20 hover:bg-amber-500/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {[m.prenom, m.nom].filter(Boolean).join(' ') || 'Sans nom'}
                  </p>
                  {m.entreprise && (
                    <p className="truncate text-xs text-muted-foreground">
                      {m.entreprise}
                      {m.fonction ? ` — ${m.fonction}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5"
                  >
                    {m.pipeline_stage.replace(/_/g, ' ')}
                  </Badge>
                  {m.date_dernier_contact && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="size-2.5" />
                      {formatDate(m.date_dernier_contact)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
