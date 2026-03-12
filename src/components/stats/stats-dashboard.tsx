'use client'

import { useState, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
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
  pipelineActif: number
  enClosing: number
  clients: number
  totalMachines: number
  currentStock: Record<string, number>
  stages: StageInfo[]
}

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
  stats?: unknown
  stages?: unknown
  contents?: unknown
}

// ─── Main component ───

export function StatsDashboard({ machineStats }: StatsDashboardProps) {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch('/api/stats')
      .then(res => res.json().then(json => {
        if (!res.ok) {
          setError(json.error || `Erreur ${res.status}`)
          return
        }
        setData(json)
      }))
      .catch(err => {
        console.error('Error fetching stats:', err)
        setError((err as Error).message)
      })
      .finally(() => setLoading(false))
  }, [])

  // Build funnel data (stock only)
  const funnelData = useMemo(() => {
    if (!data) return []
    return data.stages
      .filter(s => !s.is_terminal || s.slug === 'client')
      .sort((a, b) => a.position - b.position)
      .map(s => ({
        ...s,
        count: data.currentStock[s.slug] || 0,
        icon: STAGE_ICONS[s.slug] || '\u{1F4CA}',
      }))
  }, [data])

  const maxCount = Math.max(...(funnelData.map(f => f.count)), 1)

  // KPIs
  const kpis = data ? [
    { label: 'Pipeline actif', value: String(data.pipelineActif), sub: 'prospects en discussion', color: '#1863DC', icon: '\u{1F4E4}' },
    { label: 'En closing', value: String(data.enClosing), sub: 'devis + closing', color: '#f59e0b', icon: '\u{1F525}' },
    { label: 'Clients', value: String(data.clients), sub: 'signes', color: '#22c55e', icon: '\u2705' },
    { label: 'Machines signees', value: String(data.totalMachines), sub: 'total installe', color: '#10b981', icon: '\u{1F4E6}' },
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
          onClick={() => window.location.reload()}
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
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Statistiques</h1>
        <p className="mt-1 text-sm text-white/40">Vue d&apos;ensemble de votre pipeline commercial</p>
      </div>

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

      {/* Main grid: Funnel + Machines */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Funnel (stock only) */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
          <h3 className="mb-5 text-sm font-bold uppercase tracking-wider text-white/40">
            Entonnoir
          </h3>

          <div className="space-y-1">
            {funnelData.map(f => {
              const pct = (f.count / maxCount) * 100

              return (
                <div key={f.slug}>
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

          {/* Total footer */}
          <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3">
            <span className="text-xs font-semibold text-emerald-400">Total pipeline</span>
            <span className="text-lg font-bold text-emerald-400">
              {funnelData.reduce((s, f) => s + f.count, 0)} prospects
            </span>
          </div>
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

      {/* Forecast */}
      <ForecastStats />
    </div>
  )
}
