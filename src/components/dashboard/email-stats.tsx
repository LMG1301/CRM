'use client'

import { Mail, Send, MailOpen, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface EmailStatsProps {
  total: number
  sent: number
  received: number
  thisWeek: number
}

export function EmailStats({ total, sent, received, thisWeek }: EmailStatsProps) {
  if (total === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="size-5 text-[#EA4335]" />
          Activite email
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-brand-accent">
              <Send className="h-4 w-4" />
              <span className="text-2xl font-bold">{sent}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Envoyes</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-indigo-400">
              <MailOpen className="h-4 w-4" />
              <span className="text-2xl font-bold">{received}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Recus</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 text-emerald-400">
              <TrendingUp className="h-4 w-4" />
              <span className="text-2xl font-bold">{thisWeek}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Cette semaine</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
