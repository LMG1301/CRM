'use client'

import { useEffect, useState } from 'react'
import { BUDGET_CONFIG } from '@/lib/ai-models'
import { AlertTriangle } from 'lucide-react'

export function BudgetBar() {
  const [spend, setSpend] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/ai/usage')
      .then((r) => r.json())
      .then((data) => setSpend(data.budget?.current ?? data.month?.cost_usd ?? 0))
      .catch(() => {})
  }, [])

  if (spend === null) return null

  const pct = (spend / BUDGET_CONFIG.monthlyBudgetUsd) * 100
  const isWarning = spend >= BUDGET_CONFIG.warningThresholdUsd
  const isBlocked = spend >= BUDGET_CONFIG.hardStopThresholdUsd

  return (
    <div className="space-y-2 rounded-md border border-white/10 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Budget mensuel IA</span>
        <span className={isWarning ? 'font-medium text-orange-400' : ''}>
          ${spend.toFixed(2)} / ${BUDGET_CONFIG.monthlyBudgetUsd.toFixed(2)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full transition-all ${
            isBlocked
              ? 'bg-red-500'
              : isWarning
                ? 'bg-orange-400'
                : 'bg-brand-accent'
          }`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {isWarning && !isBlocked && (
        <div className="flex items-center gap-1.5 text-[10px] text-orange-400">
          <AlertTriangle className="size-3" />
          Attention : proche du plafond mensuel
        </div>
      )}
      {isBlocked && (
        <div className="flex items-center gap-1.5 text-[10px] text-red-400">
          <AlertTriangle className="size-3" />
          Budget atteint — fonctions IA desactivees
        </div>
      )}
    </div>
  )
}
