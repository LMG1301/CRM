'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import type { ProspectForecast, ForecastProductType } from '@/lib/types'
import { FORECAST_PRODUCT_LABELS, FORECAST_PROBABILITY_OPTIONS } from '@/lib/types'

// ─── Constants ───

const FRENCH_MONTHS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

const PRODUCT_FILTERS: Array<{ value: ForecastProductType | 'all'; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'screenkit', label: 'ScreenKit' },
  { value: 'smart_fridge', label: 'Smart Fridge' },
  { value: 'smart_freezer', label: 'Smart Freezer' },
  { value: 'autre', label: 'Autre' },
]

type PeriodFilter = 'month' | 'quarter' | '6months' | '12months'

const PERIOD_FILTERS: Array<{ value: PeriodFilter; label: string }> = [
  { value: 'month', label: 'Ce mois' },
  { value: 'quarter', label: 'Prochain trimestre' },
  { value: '6months', label: '6 mois' },
  { value: '12months', label: '12 mois' },
]

const currencyFmt = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number)
  return `${FRENCH_MONTHS[month - 1]} ${year}`
}

function getPeriodEnd(period: PeriodFilter): Date {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  switch (period) {
    case 'month':
      end.setMonth(end.getMonth() + 1)
      break
    case 'quarter':
      end.setMonth(end.getMonth() + 3)
      break
    case '6months':
      end.setMonth(end.getMonth() + 6)
      break
    case '12months':
      end.setMonth(end.getMonth() + 12)
      break
  }
  return end
}

function getPeriodStart(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

function isInPeriod(monthStr: string, period: PeriodFilter): boolean {
  const [year, month] = monthStr.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  const start = getPeriodStart()
  const end = getPeriodEnd(period)
  return date >= start && date < end
}

// ─── Component ───

export function ForecastStats() {
  const [forecasts, setForecasts] = useState<ProspectForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [productFilter, setProductFilter] = useState<ForecastProductType | 'all'>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('quarter')
  const [viewMode, setViewMode] = useState<'deal' | 'month'>('deal')

  useEffect(() => {
    fetch('/api/forecasts')
      .then(res => res.json())
      .then(data => {
        setForecasts(data.forecasts || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Filtered data
  const filtered = useMemo(() => {
    return forecasts.filter(f => {
      if (productFilter !== 'all' && f.product_type !== productFilter) return false
      if (!isInPeriod(f.expected_month, periodFilter)) return false
      return true
    })
  }, [forecasts, productFilter, periodFilter])

  // Summary stats
  const totalBrut = useMemo(() => filtered.reduce((s, f) => s + f.total_amount, 0), [filtered])
  const totalPondere = useMemo(
    () => filtered.reduce((s, f) => s + Math.round(f.total_amount * f.probability / 100), 0),
    [filtered],
  )
  const dealCount = filtered.length

  // Monthly grouped data
  const monthlyData = useMemo(() => {
    const grouped: Record<string, { month: string; deals: number; totalBrut: number; totalPondere: number }> = {}
    for (const f of filtered) {
      if (!grouped[f.expected_month]) {
        grouped[f.expected_month] = { month: f.expected_month, deals: 0, totalBrut: 0, totalPondere: 0 }
      }
      grouped[f.expected_month].deals++
      grouped[f.expected_month].totalBrut += f.total_amount
      grouped[f.expected_month].totalPondere += Math.round(f.total_amount * f.probability / 100)
    }
    return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month))
  }, [filtered])

  const maxMonthlyPondere = useMemo(
    () => Math.max(...monthlyData.map(m => m.totalPondere), 1),
    [monthlyData],
  )

  function getProbaOption(probability: number) {
    return FORECAST_PROBABILITY_OPTIONS.find(o => o.value === probability) || FORECAST_PROBABILITY_OPTIONS[0]
  }

  function getMonthBorderColor(pondere: number): string {
    const ratio = pondere / maxMonthlyPondere
    const r = Math.round(59 + (34 - 59) * ratio)
    const g = Math.round(130 + (197 - 130) * ratio)
    const b = Math.round(246 + (94 - 246) * ratio)
    return `rgb(${r}, ${g}, ${b})`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">
          Forecast — Pipeline commercial
        </h3>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Product filter */}
        <div className="flex flex-wrap gap-1.5">
          {PRODUCT_FILTERS.map(pf => (
            <button
              key={pf.value}
              onClick={() => setProductFilter(pf.value)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                productFilter === pf.value
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
              }`}
            >
              {pf.label}
            </button>
          ))}
        </div>

        {/* Period filter */}
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_FILTERS.map(pf => (
            <button
              key={pf.value}
              onClick={() => setPeriodFilter(pf.value)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                periodFilter === pf.value
                  ? 'bg-white/10 text-white'
                  : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
              }`}
            >
              {pf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">
            Pipeline brut
          </div>
          <div className="text-2xl font-bold">{currencyFmt.format(totalBrut)}</div>
          <div className="mt-0.5 text-[11px] text-white/30">Total non pondere</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">
            Pipeline pondere
          </div>
          <div className="text-2xl font-bold">{currencyFmt.format(totalPondere)}</div>
          <div className="mt-0.5 text-[11px] text-white/30">Ajuste par probabilite</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">
            Deals
          </div>
          <div className="text-2xl font-bold">{dealCount} deals actifs</div>
          <div className="mt-0.5 text-[11px] text-white/30">En forecast</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setViewMode('deal')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            viewMode === 'deal'
              ? 'bg-white/10 text-white'
              : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
          }`}
        >
          Vue par deal
        </button>
        <button
          onClick={() => setViewMode('month')}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
            viewMode === 'month'
              ? 'bg-white/10 text-white'
              : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
          }`}
        >
          Vue par mois
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-x-auto">
        {viewMode === 'deal' ? (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Prospect</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Entreprise</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Produit</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Qty</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Prix unit.</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Proba</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Mois</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Weighted</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-xs text-white/30">
                    Aucun forecast pour cette periode
                  </td>
                </tr>
              ) : (
                <>
                  {filtered.map(f => {
                    const proba = getProbaOption(f.probability)
                    const weighted = Math.round(f.total_amount * f.probability / 100)
                    return (
                      <tr key={f.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-[13px] font-medium">
                          {f.prospect ? `${f.prospect.prenom} ${f.prospect.nom}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-white/60">
                          {f.prospect?.entreprise || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[13px]">
                          {FORECAST_PRODUCT_LABELS[f.product_type] || f.product_type}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-right">{f.quantity}</td>
                        <td className="px-4 py-2.5 text-[13px] text-right">
                          {currencyFmt.format(f.unit_price)}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-right font-medium">
                          {currencyFmt.format(f.total_amount)}
                        </td>
                        <td className="px-4 py-2.5 text-[13px]">
                          <span style={{ color: proba.color }}>
                            {proba.emoji} {f.probability}% {proba.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-white/60">
                          {formatMonth(f.expected_month)}
                        </td>
                        <td className="px-4 py-2.5 text-[13px] text-right font-medium">
                          {currencyFmt.format(weighted)}
                        </td>
                      </tr>
                    )
                  })}
                  {/* Totals row */}
                  <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                    <td colSpan={5} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Total
                    </td>
                    <td className="px-4 py-3 text-[13px] text-right font-bold">
                      {currencyFmt.format(totalBrut)}
                    </td>
                    <td colSpan={2} />
                    <td className="px-4 py-3 text-[13px] text-right font-bold">
                      {currencyFmt.format(totalPondere)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Mois</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Nb deals</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total brut</th>
                <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total pondere</th>
              </tr>
            </thead>
            <tbody>
              {monthlyData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-xs text-white/30">
                    Aucun forecast pour cette periode
                  </td>
                </tr>
              ) : (
                <>
                  {monthlyData.map(m => (
                    <tr
                      key={m.month}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02]"
                      style={{ borderLeftWidth: 3, borderLeftColor: getMonthBorderColor(m.totalPondere) }}
                    >
                      <td className="px-4 py-2.5 text-[13px] font-medium">{formatMonth(m.month)}</td>
                      <td className="px-4 py-2.5 text-[13px] text-right">{m.deals}</td>
                      <td className="px-4 py-2.5 text-[13px] text-right font-medium">
                        {currencyFmt.format(m.totalBrut)}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-right font-medium">
                        {currencyFmt.format(m.totalPondere)}
                      </td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  <tr className="border-t border-white/[0.08] bg-white/[0.02]">
                    <td className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                      Total
                    </td>
                    <td className="px-4 py-3 text-[13px] text-right font-bold">
                      {filtered.length}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-right font-bold">
                      {currencyFmt.format(totalBrut)}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-right font-bold">
                      {currencyFmt.format(totalPondere)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
