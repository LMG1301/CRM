'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, Calendar, Mail, Inbox, Users } from 'lucide-react'
import type { MachineType } from '@/lib/types'
import { MACHINE_TYPE_LABELS } from '@/lib/types'
import type { MachineStats } from '@/lib/actions/machines'
import { ForecastStats } from './forecast-stats'

// ─── Types ───

interface StageInfo {
  slug: string
  name: string
  color: string
  position: number
  is_terminal: boolean
  is_default: boolean
}

interface StatsData {
  contacted: number
  responded: number
  responseRate: number
  closed: number
  conversionRate: number
  machinesSigned: number
  currentStock: Record<string, number>
  periodFlow: Record<string, number>
  emailsSent: number
  emailsReceived: number
  meetingsHeld: number
  emailResponseRate: number
  avgConversionDays: number | null
  dealsMovedThisWeek: number
  statsStartDate: string
  stages: StageInfo[]
}

type PeriodKey = 'week' | 'month' | 'quarter' | 'year'

interface Period {
  key: PeriodKey
  label: string
  getRange: () => { start: string; end: string }
}

// ─── Period helpers ───

function getMonday(): Date {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

const PERIODS: Period[] = [
  {
    key: 'week',
    label: 'Semaine',
    getRange: () => {
      const start = getMonday()
      const end = new Date(start)
      end.setDate(end.getDate() + 6)
      end.setHours(23, 59, 59, 999)
      return { start: start.toISOString(), end: end.toISOString() }
    },
  },
  {
    key: 'month',
    label: 'Mois',
    getRange: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return { start: start.toISOString(), end: end.toISOString() }
    },
  },
  {
    key: 'quarter',
    label: 'Trimestre',
    getRange: () => {
      const now = new Date()
      const qStart = Math.floor(now.getMonth() / 3) * 3
      const start = new Date(now.getFullYear(), qStart, 1)
      const end = new Date(now.getFullYear(), qStart + 3, 0, 23, 59, 59, 999)
      return { start: start.toISOString(), end: end.toISOString() }
    },
  },
  {
    key: 'year',
    label: 'Annee',
    getRange: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      return { start: start.toISOString(), end: end.toISOString() }
    },
  },
]

// ─── Stage icons ───

const STAGE_ICONS: Record<string, string> = {
  ciblage: '\u{1F3AF}',
  contacte: '\u{1F4E4}',
  repondu: '\u{1F4AC}',
  a_recontacter: '\u{1F504}',
  call_planifie: '\u{1F4DE}',
  devis: '\u{1F4C4}',
  onboarding: '\u{1F680}',
  client: '\u2705',
  refuse: '\u274C',
}

// ─── Props ───

interface StatsDashboardProps {
  machineStats: MachineStats
  // Legacy props kept for compatibility but not used
  stats?: unknown
  stages?: unknown
  contents?: unknown
}

// ─── Main component ───

export function StatsDashboard({ machineStats }: StatsDashboardProps) {
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [funnelMode, setFunnelMode] = useState<'stock' | 'flow'>('stock')

  const fetchStats = useCallback(async (periodKey: PeriodKey) => {
    setLoading(true)
    setError(null)
    try {
      const p = PERIODS.find(x => x.key === periodKey)!
      const { start, end } = p.getRange()
      const res = await fetch(`/api/stats?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`)
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || `Erreur ${res.status}`)
        return
      }
      setData(json)
    } catch (err) {
      console.error('Error fetching stats:', err)
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats(period)
  }, [period, fetchStats])

  // Build funnel data
  const funnelStages = useMemo(() => {
    if (!data) return []
    return data.stages
      .filter(s => !s.is_terminal || s.slug === 'client')
      .sort((a, b) => a.position - b.position)
  }, [data])

  const stockData = useMemo(() => {
    if (!data) return []
    return funnelStages.map(s => ({
      ...s,
      count: data.currentStock[s.slug] || 0,
      icon: STAGE_ICONS[s.slug] || '\u{1F4CA}',
    }))
  }, [data, funnelStages])

  const flowData = useMemo(() => {
    if (!data) return []
    return funnelStages
      .filter(s => !s.is_default)
      .map(s => ({
        ...s,
        count: data.periodFlow[s.slug] || 0,
        icon: STAGE_ICONS[s.slug] || '\u{1F4CA}',
      }))
  }, [data, funnelStages])

  const activeFunnel = funnelMode === 'stock' ? stockData : flowData
  const maxCount = Math.max(...activeFunnel.map(f => f.count), 1)

  // KPIs
  const kpis = data ? [
    { label: 'Contactes', value: String(data.contacted), sub: 'sur la periode', color: '#1863DC', icon: '\u{1F4E4}' },
    { label: 'Taux de reponse', value: `${data.emailResponseRate}%`, sub: `${data.emailsReceived} recus / ${data.emailsSent} envoyes`, color: '#fbbf24', icon: '\u{1F4AC}' },
    { label: 'Conversion globale', value: `${data.conversionRate}%`, sub: `${data.closed} client${data.closed > 1 ? 's' : ''} signes`, color: '#22c55e', icon: '\u{1F4C8}' },
    { label: 'Machines signees', value: String(data.machinesSigned), sub: 'sur la periode', color: '#10b981', icon: '\u2705' },
  ] : []

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-white/30" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm text-red-400">Erreur : {error}</p>
        <button
          onClick={() => fetchStats(period)}
          className="mt-3 rounded-md bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/15"
        >
          Reessayer
        </button>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6">
      {/* Header + Period selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Statistiques</h1>
          <p className="mt-1 text-sm text-white/40">Analyse de votre pipeline commercial</p>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-1">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                period === p.key
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {p.key === period && <Calendar className="size-3" />}
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Loader2 className="size-3 animate-spin" />
          Chargement...
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpis.map(k => (
          <div
            key={k.label}
            className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4"
            style={{ borderLeftColor: k.color, borderLeftWidth: 3 }}
          >
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-sm">{k.icon}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
                {k.label}
              </span>
            </div>
            <div className="text-2xl font-bold">{k.value}</div>
            <div className="mt-0.5 text-[11px] text-white/30">{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Main grid: Funnel + Right column */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">
              Entonnoir de conversion
            </h3>
            <div className="flex gap-1">
              <button
                onClick={() => setFunnelMode('stock')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  funnelMode === 'stock'
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Stock actuel
              </button>
              <button
                onClick={() => setFunnelMode('flow')}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  funnelMode === 'flow'
                    ? 'bg-white/10 text-white'
                    : 'text-white/40 hover:text-white/60'
                }`}
              >
                Flux periode
              </button>
            </div>
          </div>

          <div className="space-y-1">
            {activeFunnel.map((f, i) => {
              const pct = (f.count / maxCount) * 100
              const prevCount = i > 0 ? activeFunnel[i - 1].count : 0
              const convRate = funnelMode === 'flow' && i > 0 && prevCount > 0
                ? Math.round(f.count / prevCount * 100)
                : null

              return (
                <div key={f.slug}>
                  {/* Conversion between steps (only in flow mode) */}
                  {funnelMode === 'flow' && i > 0 && (
                    <div className="ml-[42px] mb-1 flex items-center gap-2">
                      <div className="h-4 w-px bg-white/10" />
                      {convRate !== null && (
                        <span className={`text-[11px] font-semibold ${
                          convRate >= 60 ? 'text-emerald-400' : convRate >= 40 ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {convRate}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Stage bar */}
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-base"
                      style={{ backgroundColor: f.color + '20' }}
                    >
                      {f.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[13px] font-semibold">{f.name}</span>
                        <span className="text-sm font-bold">{f.count}</span>
                      </div>
                      <div className="h-6 w-full overflow-hidden rounded-md bg-white/5">
                        <div
                          className="h-full rounded-md transition-all duration-700"
                          style={{
                            width: `${Math.max(pct, 3)}%`,
                            background: `linear-gradient(90deg, ${f.color}99, ${f.color})`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Global conversion footer */}
          <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3">
            <span className="text-xs font-semibold text-emerald-400">
              {funnelMode === 'stock' ? 'Total pipeline' : 'Conversion globale'}
            </span>
            <span className="text-lg font-bold text-emerald-400">
              {funnelMode === 'stock'
                ? `${activeFunnel.reduce((s, f) => s + f.count, 0)} prospects`
                : `${data.conversionRate}%`}
            </span>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Activite sur la periode */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/40">
              Activite sur la periode
            </h3>
            {(() => {
              const activityBars = [
                { label: 'Emails envoyes', value: data.emailsSent, icon: <Mail className="size-4 text-blue-400" />, color: '#3b82f6' },
                { label: 'Emails recus', value: data.emailsReceived, icon: <Inbox className="size-4 text-amber-400" />, color: '#f59e0b' },
                { label: 'Meetings', value: data.meetingsHeld, icon: <Users className="size-4 text-purple-400" />, color: '#a855f7' },
              ]
              const maxActivity = Math.max(...activityBars.map(b => b.value), 1)
              return (
                <div className="space-y-3">
                  {activityBars.map(bar => (
                    <div key={bar.label} className="flex items-center gap-3">
                      <div className="flex w-[110px] shrink-0 items-center gap-2">
                        {bar.icon}
                        <span className="text-[12px] text-white/50">{bar.label}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="h-6 w-full overflow-hidden rounded-md bg-white/5">
                          <div
                            className="h-full rounded-md transition-all duration-700"
                            style={{
                              width: `${Math.max((bar.value / maxActivity) * 100, 3)}%`,
                              backgroundColor: bar.color,
                              opacity: 0.7,
                            }}
                          />
                        </div>
                      </div>
                      <span className="w-8 shrink-0 text-right text-sm font-bold">{bar.value}</span>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* Machines signees */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/40">
              Machines signees
            </h3>

            {machineStats.clients.length === 0 ? (
              <p className="py-4 text-center text-xs text-white/30">
                Aucune machine enregistree
              </p>
            ) : (
              <div className="space-y-0">
                {machineStats.clients.map(client => {
                  const machinesList = client.machines
                    .map(m => `${MACHINE_TYPE_LABELS[m.machine_type as MachineType] || m.machine_type} x${m.quantity}`)
                    .join(', ')
                  const dateStr = client.machines[0]?.installed_at
                    ? new Date(client.machines[0].installed_at).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })
                    : null

                  return (
                    <div
                      key={client.prospect_id}
                      className="flex items-center justify-between border-b border-white/[0.06] py-2.5 last:border-0"
                    >
                      <div>
                        <div className="text-[13px] font-semibold">
                          {client.entreprise || `${client.prenom} ${client.nom}`}
                        </div>
                        <div className="text-[11px] text-white/40">
                          {machinesList}{dateStr ? ` \u2014 ${dateStr}` : ''}
                        </div>
                      </div>
                      <div className="text-[13px] font-bold text-emerald-400">
                        {client.totalQuantity} machine{client.totalQuantity > 1 ? 's' : ''}
                      </div>
                    </div>
                  )
                })}

                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-500/[0.06] px-3 py-2">
                  <span className="text-xs font-semibold text-emerald-400">Total</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {machineStats.totalMachines} machine{machineStats.totalMachines > 1 ? 's' : ''}
                  </span>
                </div>

                {Object.keys(machineStats.byType).length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.entries(machineStats.byType).map(([type, count]) => (
                      <span key={type} className="rounded-md bg-white/5 px-2 py-1 text-[10px] text-white/50">
                        {MACHINE_TYPE_LABELS[type as MachineType] || type}: {count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Forecast */}
      <ForecastStats />
    </div>
  )
}
