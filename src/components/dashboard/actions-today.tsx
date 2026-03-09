'use client'

import Link from 'next/link'
import { CalendarClock, Building2, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Prospect } from '@/lib/types'

interface ActionsTodayProps {
  prospects: Prospect[]
}

const STAGE_LABELS: Record<string, string> = {
  ciblage: 'Ciblage',
  touch_1: 'Contacte',
  repondu: 'Repondu',
  devis: 'Devis',
  onboarding: 'Onboarding',
  client: 'Client',
  a_recontacter: 'A recontacter',
  refuse: 'Perdu',
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const diff = Date.now() - new Date(dateStr).getTime()
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)))
}

export function ActionsToday({ prospects }: ActionsTodayProps) {
  if (prospects.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-amber-600" />
            Actions du jour
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Aucune action prevue pour aujourd&apos;hui. Beau travail !
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarClock className="h-5 w-5 text-amber-600" />
          Actions du jour
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            {prospects.length} action{prospects.length > 1 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {prospects.map((prospect) => {
          const days = daysSince(prospect.date_dernier_contact)
          const fullName = `${prospect.prenom} ${prospect.nom}`.trim()
          const stageLabel = STAGE_LABELS[prospect.pipeline_stage] || prospect.pipeline_stage

          return (
            <Link
              key={prospect.id}
              href={`/prospects/${prospect.id}`}
              className="group flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-sm font-semibold text-amber-700">
                {(prospect.prenom?.[0] || '').toUpperCase()}
                {(prospect.nom?.[0] || '').toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{fullName}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {prospect.entreprise && (
                    <>
                      <Building2 className="h-3 w-3" />
                      <span className="truncate">{prospect.entreprise}</span>
                      <span className="text-border">|</span>
                    </>
                  )}
                  <span>{stageLabel}</span>
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                {days > 0 && (
                  <span className={`text-xs font-medium ${days >= 7 ? 'text-red-600' : days >= 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {days}j sans contact
                  </span>
                )}
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
            </Link>
          )
        })}
      </CardContent>
    </Card>
  )
}
