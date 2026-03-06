'use client'

import Link from 'next/link'
import { Flame, Building2, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Prospect } from '@/lib/types'

interface HotProspectsProps {
  prospects: Prospect[]
}

const STAGE_LABELS: Record<string, string> = {
  repondu: 'Repondu',
  call_decouverte: 'Call decouverte',
  devis: 'Devis',
}

const STAGE_COLORS: Record<string, string> = {
  repondu: 'bg-brand-accent/10 text-brand-accent border-brand-accent/20',
  call_decouverte: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  devis: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
}

export function HotProspects({ prospects }: HotProspectsProps) {
  if (prospects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Flame className="h-5 w-5 text-orange-500" />
            Prospects chauds
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aucun prospect en discussion active.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Flame className="h-5 w-5 text-orange-500" />
          Prospects chauds
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            {prospects.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prospects.map((prospect) => {
          const fullName = `${prospect.prenom} ${prospect.nom}`.trim()
          const stageLabel = STAGE_LABELS[prospect.pipeline_stage] || prospect.pipeline_stage
          const stageColor = STAGE_COLORS[prospect.pipeline_stage] || 'bg-secondary text-secondary-foreground'

          return (
            <Link
              key={prospect.id}
              href={`/prospects/${prospect.id}`}
              className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-accent/10 text-sm font-semibold text-brand-accent">
                {(prospect.prenom?.[0] || '').toUpperCase()}
                {(prospect.nom?.[0] || '').toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{fullName}</p>
                {prospect.entreprise && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3 w-3" />
                    <span className="truncate">{prospect.entreprise}</span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge variant="outline" className={`text-xs ${stageColor}`}>
                  {stageLabel}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
