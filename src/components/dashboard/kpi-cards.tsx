'use client'

import { Users, MessageSquare, Trophy, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface KpiCardsProps {
  total: number
  clients: number
  discussions: number
  tauxReponse: number
}

const kpis = [
  {
    key: 'total' as const,
    label: 'Total prospects',
    icon: Users,
    color: 'text-brand-accent',
    bgColor: 'bg-brand-accent/10',
  },
  {
    key: 'discussions' as const,
    label: 'Discussions actives',
    icon: MessageSquare,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
  },
  {
    key: 'clients' as const,
    label: 'Clients',
    icon: Trophy,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
  },
  {
    key: 'tauxReponse' as const,
    label: 'Taux de reponse',
    icon: TrendingUp,
    color: 'text-violet-400',
    bgColor: 'bg-violet-400/10',
  },
]

export function KpiCards({ total, clients, discussions, tauxReponse }: KpiCardsProps) {
  const values: Record<string, number> = { total, clients, discussions, tauxReponse }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const Icon = kpi.icon
        const value = values[kpi.key]
        const displayValue = kpi.key === 'tauxReponse' ? `${value}%` : value

        return (
          <Card key={kpi.key} className="py-5">
            <CardContent className="flex items-center gap-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${kpi.bgColor}`}>
                <Icon className={`h-6 w-6 ${kpi.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-muted-foreground truncate">
                  {kpi.label}
                </p>
                <p className="text-2xl font-bold tracking-tight">
                  {displayValue}
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
