'use client'

import Link from 'next/link'
import { Flame, Building2, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Prospect, PipelineStage } from '@/lib/types'

interface HotProspectsProps {
  prospects: Prospect[]
  stages: PipelineStage[]
}

export function HotProspects({ prospects, stages }: HotProspectsProps) {
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
          const stageLabel = stages.find(s => s.slug === prospect.pipeline_stage)?.name || prospect.pipeline_stage
          const stageColor = stages.find(s => s.slug === prospect.pipeline_stage)?.color || '#6b7280'

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
                <Badge variant="outline" className="text-xs" style={{
                  backgroundColor: stageColor + '20',
                  color: stageColor,
                  borderColor: stageColor + '33',
                }}>
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
