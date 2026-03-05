'use client'

import { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { Users, MessageSquare, Trophy, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PipelineStage } from '@/lib/types'

// ─── Types ───

interface DashboardStats {
  total: number
  clients: number
  discussions: number
  replied: number
  tauxReponse: number
  byStage: Record<string, number>
  bySource: Record<string, number>
  byCategorie: Record<string, number>
}

interface StatsDashboardProps {
  stats: DashboardStats
  stages: PipelineStage[]
}

// ─── Palette professionnelle pour les camemberts ───

const PIE_COLORS = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#f97316', // orange-500
  '#14b8a6', // teal-500
  '#6366f1', // indigo-500
  '#84cc16', // lime-500
  '#a855f7', // purple-500
]

// ─── Tooltip personnalise (dark) ───

function DarkTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; name?: string; payload?: Record<string, unknown> }>
  label?: string
}) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-white/10 bg-[#0f172a] px-4 py-3 shadow-xl">
      {label && (
        <p className="mb-1 text-sm font-medium text-slate-300">{label}</p>
      )}
      {payload.map((entry, i) => (
        <p key={i} className="text-sm text-white">
          {entry.name ? `${entry.name}: ` : ''}
          <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  )
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; payload?: { percent?: number } }>
}) {
  if (!active || !payload?.length) return null

  const entry = payload[0]
  const percent = entry.payload?.percent
    ? `${(entry.payload.percent * 100).toFixed(1)}%`
    : ''

  return (
    <div className="rounded-lg border border-white/10 bg-[#0f172a] px-4 py-3 shadow-xl">
      <p className="text-sm text-slate-300">{entry.name}</p>
      <p className="text-sm font-semibold text-white">
        {entry.value} {percent && <span className="text-slate-400">({percent})</span>}
      </p>
    </div>
  )
}

// ─── Legende personnalisee ───

function DarkLegend({
  payload,
}: {
  payload?: Array<{ value: string; color: string }>
}) {
  if (!payload?.length) return null

  return (
    <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-xs text-slate-400">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Composant principal ───

export function StatsDashboard({ stats, stages }: StatsDashboardProps) {
  // Construire les donnees du funnel a partir des stages (ordonnees par position)
  const funnelData = useMemo(() => {
    return stages
      .sort((a, b) => a.position - b.position)
      .map((stage) => ({
        name: stage.name,
        count: stats.byStage[stage.slug] || 0,
        color: stage.color || '#3b82f6',
      }))
  }, [stages, stats.byStage])

  // Donnees pour le camembert des sources
  const sourceData = useMemo(() => {
    return Object.entries(stats.bySource)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [stats.bySource])

  // Donnees pour le camembert des categories
  const categorieData = useMemo(() => {
    return Object.entries(stats.byCategorie)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [stats.byCategorie])

  // KPIs
  const kpis = [
    {
      label: 'Total prospects',
      value: stats.total,
      icon: Users,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      display: String(stats.total),
    },
    {
      label: 'Clients',
      value: stats.clients,
      icon: Trophy,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-500/10',
      display: String(stats.clients),
    },
    {
      label: 'Discussions actives',
      value: stats.discussions,
      icon: MessageSquare,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      display: String(stats.discussions),
    },
    {
      label: 'Taux de reponse',
      value: stats.tauxReponse,
      icon: TrendingUp,
      color: 'text-violet-500',
      bgColor: 'bg-violet-500/10',
      display: `${stats.tauxReponse}%`,
    },
  ]

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <Card key={kpi.label} className="py-5">
              <CardContent className="flex items-center gap-4">
                <div
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${kpi.bgColor}`}
                >
                  <Icon className={`h-6 w-6 ${kpi.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p className="text-2xl font-bold tracking-tight">
                    {kpi.display}
                  </p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funnel de conversion */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Funnel de conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={funnelData}
                  margin={{ top: 8, right: 24, left: 0, bottom: 48 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1e293b"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                    angle={-35}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                    tickLine={false}
                    axisLine={{ stroke: '#1e293b' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={<DarkTooltip />}
                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  />
                  <Bar dataKey="count" name="Prospects" radius={[6, 6, 0, 0]}>
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Repartition par source */}
        <Card>
          <CardHeader>
            <CardTitle>Repartition par source</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceData.length === 0 ? (
              <div className="flex h-[320px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Aucune donnee disponible
                </p>
              </div>
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={sourceData}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {sourceData.map((_entry, index) => (
                        <Cell
                          key={`source-${index}`}
                          fill={PIE_COLORS[index % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend content={<DarkLegend />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Repartition par categorie */}
        <Card>
          <CardHeader>
            <CardTitle>Repartition par categorie</CardTitle>
          </CardHeader>
          <CardContent>
            {categorieData.length === 0 ? (
              <div className="flex h-[320px] items-center justify-center">
                <p className="text-sm text-muted-foreground">
                  Aucune donnee disponible
                </p>
              </div>
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categorieData}
                      cx="50%"
                      cy="45%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      strokeWidth={0}
                    >
                      {categorieData.map((_entry, index) => (
                        <Cell
                          key={`cat-${index}`}
                          fill={PIE_COLORS[(index + 4) % PIE_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                    <Legend content={<DarkLegend />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
