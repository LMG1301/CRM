'use client'

import { useState, useMemo } from 'react'
import type { PipelineStage, Content, MachineType } from '@/lib/types'
import { MACHINE_TYPE_LABELS } from '@/lib/types'
import type { MachineStats } from '@/lib/actions/machines'

// ─── Types ───

interface DashboardStats {
  total: number
  clients: number
  discussions: number
  replied: number
  tauxReponse: number
  prospectsActifs: number
  conversionRate: number
  byStage: Record<string, number>
  byCategorie: Record<string, number>
  weeklyActivity: Record<string, number>
  blockers?: Array<{
    name: string
    stage: string
    days: number
    reason: string
  }>
}

interface StatsDashboardProps {
  stats: DashboardStats
  stages: PipelineStage[]
  machineStats: MachineStats
  contents: Content[]
}

// ─── Funnel stage icons ───

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

// ─── Funnel tag component ───

function FunnelTag({ level }: { level: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    tofu: { bg: 'bg-brand-accent/15', text: 'text-brand-accent', label: 'TOP' },
    mofu: { bg: 'bg-amber-500/15', text: 'text-amber-500', label: 'MID' },
    bofu: { bg: 'bg-emerald-500/15', text: 'text-emerald-500', label: 'BOT' },
  }
  const c = config[level] || { bg: 'bg-white/5', text: 'text-white/40', label: '\u2014' }
  return (
    <span className={`rounded px-2.5 py-0.5 text-[10px] font-bold tracking-wider ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  )
}

// ─── Main component ───

export function StatsDashboard({ stats, stages, machineStats, contents }: StatsDashboardProps) {
  const [view, setView] = useState<'pilotage' | 'reporting'>('reporting')
  const [funnelFilter, setFunnelFilter] = useState<'all' | 'tofu' | 'mofu' | 'bofu'>('all')
  const isReporting = view === 'reporting'

  // Build funnel data from stages
  const funnelData = useMemo(() => {
    return stages
      .filter(s => !s.is_terminal || s.slug === 'client')
      .sort((a, b) => a.position - b.position)
      .map(stage => ({
        slug: stage.slug,
        name: stage.name,
        count: stats.byStage[stage.slug] || 0,
        color: stage.color || '#3b82f6',
        icon: STAGE_ICONS[stage.slug] || '\u{1F4CA}',
      }))
  }, [stages, stats.byStage])

  const maxCount = Math.max(...funnelData.map(f => f.count), 1)

  // Compute contact-based conversion
  const totalContacted = useMemo(() => {
    return funnelData.reduce((s, f) => f.slug !== 'ciblage' ? s + f.count : s, 0)
  }, [funnelData])

  const clientCount = stats.byStage['client'] || 0
  const convGlobal = totalContacted > 0 ? ((clientCount / totalContacted) * 100).toFixed(1) : '0'

  // Response rate
  const contactedCount = stats.byStage['contacte'] || 0
  const postContactStages = funnelData
    .filter(f => !['ciblage', 'contacte'].includes(f.slug))
    .reduce((s, f) => s + f.count, 0)
  const responseRate = (contactedCount + postContactStages) > 0
    ? Math.round(postContactStages / (contactedCount + postContactStages) * 100)
    : 0

  // Group blockers by stage
  const blockersByStage = useMemo(() => {
    const map: Record<string, typeof stats.blockers> = {}
    for (const b of stats.blockers || []) {
      if (!map[b.stage]) map[b.stage] = []
      map[b.stage]!.push(b)
    }
    return map
  }, [stats.blockers])
  const totalBlockers = (stats.blockers || []).length

  // Quick stats insights
  const quickStats = useMemo(() => {
    const items: Array<{ label: string; value: string; color: string; icon: string }> = []

    // Worst conversion step
    let worstDrop = 0
    let worstLabel = ''
    for (let i = 1; i < funnelData.length; i++) {
      const prev = funnelData[i - 1].count
      const curr = funnelData[i].count
      if (prev > 0) {
        const drop = ((prev - curr) / prev) * 100
        if (drop > worstDrop) {
          worstDrop = drop
          worstLabel = `${funnelData[i - 1].name} \u2192 ${funnelData[i].name} (${drop.toFixed(0)}% de perte)`
        }
      }
    }
    if (worstLabel) {
      items.push({ label: 'Point de friction', value: worstLabel, color: 'text-red-400', icon: '\u{1F534}' })
    }

    // Best conversion step
    let bestConv = 0
    let bestLabel = ''
    for (let i = 1; i < funnelData.length; i++) {
      const prev = funnelData[i - 1].count
      const curr = funnelData[i].count
      if (prev > 0) {
        const conv = (curr / prev) * 100
        if (conv > bestConv && conv < 100) {
          bestConv = conv
          bestLabel = `${funnelData[i - 1].name} \u2192 ${funnelData[i].name} (${conv.toFixed(0)}%)`
        }
      }
    }
    if (bestLabel) {
      items.push({ label: 'Meilleure conversion', value: bestLabel, color: 'text-emerald-400', icon: '\u{1F7E2}' })
    }

    items.push({ label: 'Pipeline actif', value: `${totalContacted} prospects en discussion`, color: 'text-amber-400', icon: '\u{1F525}' })

    return items
  }, [funnelData, totalContacted])

  // Filter contents by funnel level
  const filteredContents = useMemo(() => {
    if (funnelFilter === 'all') return contents
    return contents.filter(c => c.funnel_level === funnelFilter)
  }, [contents, funnelFilter])

  // KPI cards
  const kpis = [
    { label: 'Contactes', value: String(totalContacted), sub: 'total pipeline', color: '#1863DC', icon: '\u{1F4E4}' },
    { label: 'Taux de reponse', value: `${responseRate}%`, sub: `${postContactStages} / ${contactedCount + postContactStages}`, color: '#fbbf24', icon: '\u{1F4AC}' },
    { label: 'Conversion globale', value: `${convGlobal}%`, sub: 'Contactes \u2192 Client', color: '#22c55e', icon: '\u{1F4C8}' },
    { label: 'Machines signees', value: String(machineStats.totalMachines), sub: `${machineStats.clients.length} client${machineStats.clients.length > 1 ? 's' : ''}`, color: '#10b981', icon: '\u2705' },
    ...(isReporting ? [{
      label: 'Deals bloques', value: String(totalBlockers), sub: `prospects en stagnation`, color: '#ef4444', icon: '\u26A0\uFE0F',
    }] : []),
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Statistiques</h1>
          <p className="mt-1 text-sm text-white/40">Analyse de votre pipeline commercial</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {([['pilotage', 'Mon pilotage'], ['reporting', 'Reporting']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-all ${
                view === key
                  ? 'bg-brand-accent text-white'
                  : 'text-white/40 hover:text-white/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className={`grid gap-3 ${isReporting ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'}`}>
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

      {/* Main grid: Funnel (left) + Right column */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Funnel */}
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">
              Entonnoir de conversion
            </h3>
            {isReporting && totalBlockers > 0 && (
              <span className="text-[11px] font-semibold text-amber-400">
                \u26A0 {totalBlockers} blocage{totalBlockers > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="space-y-1">
            {funnelData.map((f, i) => {
              const pct = (f.count / maxCount) * 100
              const prevCount = i > 0 ? funnelData[i - 1].count : 0
              const drop = i > 0 && prevCount > 0 ? ((prevCount - f.count) / prevCount * 100).toFixed(0) : null
              const dropNum = drop ? parseFloat(drop) : 0
              const dropColor = dropNum > 60 ? 'text-red-400' : dropNum > 40 ? 'text-amber-400' : 'text-emerald-400'
              const stageBlockers = blockersByStage[f.slug] || []

              return (
                <div key={f.slug} className={stageBlockers.length > 0 && isReporting ? 'mb-2' : ''}>
                  {/* Drop indicator */}
                  {i > 0 && (
                    <div className="ml-[42px] mb-1 flex items-center gap-2">
                      <div className="h-4 w-px bg-white/10" />
                      {drop && (
                        <span className={`text-[11px] font-semibold ${dropColor}`}>
                          \u2193 -{drop}%
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

                  {/* Blockers (reporting mode only) */}
                  {isReporting && stageBlockers.length > 0 && (
                    <div className="ml-[42px] mt-2 space-y-1.5">
                      {stageBlockers.map(b => (
                        <div
                          key={b.name}
                          className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2.5"
                        >
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-semibold">{b.name}</span>
                            <span
                              className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                b.days > 30
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-amber-400/20 text-amber-400'
                              }`}
                            >
                              {b.days}j
                            </span>
                          </div>
                          <p className="text-[11px] text-white/50">{b.reason}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Global conversion footer */}
          <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3">
            <span className="text-xs font-semibold text-emerald-400">Conversion globale</span>
            <span className="text-lg font-bold text-emerald-400">{convGlobal}%</span>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-5">
          {/* Quick stats / Points cles */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wider text-white/40">
              Points cles
            </h3>
            <div className="space-y-3">
              {quickStats.map(s => (
                <div key={s.label} className="flex items-start gap-2.5 rounded-lg bg-white/[0.02] p-3">
                  <span className="shrink-0 text-sm">{s.icon}</span>
                  <div>
                    <div className="mb-0.5 text-[11px] font-semibold text-white/40">{s.label}</div>
                    <div className={`text-[13px] font-medium ${s.color}`}>{s.value}</div>
                  </div>
                </div>
              ))}
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

                {/* Total */}
                <div className="mt-3 flex items-center justify-between rounded-lg bg-emerald-500/[0.06] px-3 py-2">
                  <span className="text-xs font-semibold text-emerald-400">Total</span>
                  <span className="text-sm font-bold text-emerald-400">
                    {machineStats.totalMachines} machine{machineStats.totalMachines > 1 ? 's' : ''}
                  </span>
                </div>

                {/* By type breakdown */}
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

      {/* Contents by funnel level */}
      {contents.length > 0 && (
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">
              Contenus par niveau funnel
            </h3>
            <div className="flex gap-1">
              {([
                { key: 'all' as const, label: 'Tous' },
                { key: 'tofu' as const, label: 'Top' },
                { key: 'mofu' as const, label: 'Middle' },
                { key: 'bofu' as const, label: 'Bottom' },
              ]).map(f => (
                <button
                  key={f.key}
                  onClick={() => setFunnelFilter(f.key)}
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-all ${
                    funnelFilter === f.key
                      ? f.key === 'all'
                        ? 'border-brand-accent bg-brand-accent/20 text-white'
                        : 'border-white/20 bg-white/10 text-white'
                      : 'border-white/[0.08] text-white/40 hover:text-white/60'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredContents.length === 0 ? (
            <p className="py-4 text-center text-xs text-white/30">
              Aucun contenu pour ce filtre
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {filteredContents.map(c => (
                <div
                  key={c.id}
                  className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5"
                >
                  <FunnelTag level={c.funnel_level || ''} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{c.title}</div>
                    <div className="text-[10px] text-white/40">
                      {c.content_type === 'post_linkedin' ? 'Post LinkedIn' :
                       c.content_type === 'case_study' ? 'Cas client' :
                       c.content_type === 'article' ? 'Article' :
                       c.content_type === 'video' ? 'Video' :
                       c.content_type === 'infographie' ? 'Infographie' :
                       c.content_type === 'temoignage' ? 'Temoignage' :
                       c.content_type}
                    </div>
                  </div>
                  {c.url && (
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[10px] text-brand-accent hover:underline"
                    >
                      Voir
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
