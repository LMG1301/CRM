'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, Download, FileText, Plus, X } from 'lucide-react'
import type { ProspectForecast, ForecastProductType } from '@/lib/types'
import { FORECAST_PRODUCT_LABELS, FORECAST_PROBABILITY_OPTIONS } from '@/lib/types'
import { SOFTWARE_MRR_PER_UNIT, type ReportPeriod, REPORT_PERIOD_LABELS } from '@/lib/forecast-config'

// ─── Constants ───

const FRENCH_MONTHS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

const FRENCH_MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec',
]

const PRODUCT_OPTIONS = [
  { value: 'screenkit', label: 'ScreenKit' },
  { value: 'smart_fridge', label: 'Smart Fridge' },
  { value: 'smart_freezer', label: 'Smart Freezer' },
  { value: 'boostbar', label: 'BoostBar' },
  { value: 'autre', label: 'Autre' },
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

// ─── Number formatting (shared utility — FR convention: space as thousand sep) ───

const numberFmt = new Intl.NumberFormat('fr-FR')

const currencyFmt = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

function fmtCur(val: number): string { return currencyFmt.format(val) }
function fmtNum(val: number): string { return numberFmt.format(val) }

// ─── Date helpers ───

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-').map(Number)
  return `${FRENCH_MONTHS[month - 1]} ${year}`
}

function formatMonthShort(monthStr: string): string {
  const [, month] = monthStr.split('-').map(Number)
  return FRENCH_MONTHS_SHORT[month - 1]
}

function getPeriodEnd(period: PeriodFilter): Date {
  const now = new Date()
  const end = new Date(now.getFullYear(), now.getMonth(), 1)
  switch (period) {
    case 'month': end.setMonth(end.getMonth() + 1); break
    case 'quarter': end.setMonth(end.getMonth() + 3); break
    case '6months': end.setMonth(end.getMonth() + 6); break
    case '12months': end.setMonth(end.getMonth() + 12); break
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
  return date >= getPeriodStart() && date < getPeriodEnd(period)
}

function getCurrentYearMonths(): string[] {
  const year = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

// ─── Types ───

interface Deployment {
  id: string
  client_name: string
  prospect_id: string | null
  quantity: number
  product: string
  hardware_revenue: number
  deployment_date: string
  source: 'pipeline' | 'manual'
  forecast_id: string | null
  notes: string | null
  created_at: string
}

interface ClientAggRow {
  entreprise: string
  months: Record<string, number>
  totalMachines: number
  totalRevenue: number
  deals: ProspectForecast[]
}

interface DeployedClientRow {
  clientName: string
  months: Record<string, number>
  totalMachines: number
  hardwareRevenue: Record<string, number>
  totalHardware: number
  deployments: Deployment[]
}

type ForecastTab = 'forecast' | 'deployed'
type ForecastView = 'deal' | 'month' | 'client'

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function ForecastStats() {
  const [forecasts, setForecasts] = useState<ProspectForecast[]>([])
  const [deployments, setDeployments] = useState<Deployment[]>([])
  const [needsMigration, setNeedsMigration] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ForecastTab>('forecast')
  const [productFilter, setProductFilter] = useState<ForecastProductType | 'all'>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('12months')
  const [viewMode, setViewMode] = useState<ForecastView>('deal')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [showAddDeployment, setShowAddDeployment] = useState(false)

  const currentYear = new Date().getFullYear()
  const currentYearMonths = useMemo(() => getCurrentYearMonths(), [])

  // ─── Data fetching ───

  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/forecasts').then(r => r.json()),
      fetch('/api/deployments').then(r => r.json()).catch(() => ({ deployments: [] })),
    ])
      .then(([forecastData, deployData]) => {
        setForecasts(forecastData.forecasts || [])
        setDeployments(deployData.deployments || [])
        if (deployData.needsMigration) setNeedsMigration(true)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-sync pipeline -> deployments on first load
  useEffect(() => {
    if (!needsMigration && deployments !== null) {
      fetch('/api/deployments/sync', { method: 'POST' }).catch(() => {})
    }
  }, [needsMigration]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Filtered forecast data ───

  const filtered = useMemo(() => {
    return forecasts.filter(f => {
      if (productFilter !== 'all' && f.product_type !== productFilter) return false
      if (!isInPeriod(f.expected_month, periodFilter)) return false
      return true
    })
  }, [forecasts, productFilter, periodFilter])

  const totalBrut = useMemo(() => filtered.reduce((s, f) => s + f.total_amount, 0), [filtered])
  const totalPondere = useMemo(
    () => filtered.reduce((s, f) => s + Math.round(f.total_amount * f.probability / 100), 0),
    [filtered],
  )
  const totalQuantity = useMemo(() => filtered.reduce((s, f) => s + f.quantity, 0), [filtered])
  const dealCount = filtered.length

  // ─── Monthly data ───

  const monthlyData = useMemo(() => {
    const grouped: Record<string, { month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number }> = {}
    for (const f of filtered) {
      if (!grouped[f.expected_month]) {
        grouped[f.expected_month] = { month: f.expected_month, deals: 0, totalBrut: 0, totalPondere: 0, totalMachines: 0 }
      }
      grouped[f.expected_month].deals++
      grouped[f.expected_month].totalBrut += f.total_amount
      grouped[f.expected_month].totalPondere += Math.round(f.total_amount * f.probability / 100)
      grouped[f.expected_month].totalMachines += f.quantity
    }
    return Object.values(grouped).sort((a, b) => a.month.localeCompare(b.month))
  }, [filtered])

  const maxMonthlyPondere = useMemo(() => Math.max(...monthlyData.map(m => m.totalPondere), 1), [monthlyData])

  // ─── Client aggregation ───

  const clientData = useMemo<ClientAggRow[]>(() => {
    const map = new Map<string, ClientAggRow>()
    for (const f of filtered) {
      const name = f.prospect?.entreprise || 'Sans entreprise'
      const key = name.toLowerCase().trim()
      if (!map.has(key)) map.set(key, { entreprise: name, months: {}, totalMachines: 0, totalRevenue: 0, deals: [] })
      const row = map.get(key)!
      row.months[f.expected_month] = (row.months[f.expected_month] || 0) + f.quantity
      row.totalMachines += f.quantity
      row.totalRevenue += Math.round(f.total_amount * f.probability / 100)
      row.deals.push(f)
    }
    return Array.from(map.values()).sort((a, b) => b.totalMachines - a.totalMachines)
  }, [filtered])

  const clientViewMonths = useMemo(() => {
    const months = new Set<string>()
    for (const c of clientData) for (const m of Object.keys(c.months)) months.add(m)
    return Array.from(months).sort()
  }, [clientData])

  // ─── Deployed data (from deployments table) ───

  const deployedClientData = useMemo<DeployedClientRow[]>(() => {
    const map = new Map<string, DeployedClientRow>()
    for (const d of deployments) {
      const dateObj = new Date(d.deployment_date)
      if (dateObj.getFullYear() !== currentYear) continue
      const key = d.client_name.toLowerCase().trim()
      if (!map.has(key)) {
        map.set(key, { clientName: d.client_name, months: {}, totalMachines: 0, hardwareRevenue: {}, totalHardware: 0, deployments: [] })
      }
      const row = map.get(key)!
      const mk = `${currentYear}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`
      row.months[mk] = (row.months[mk] || 0) + d.quantity
      row.totalMachines += d.quantity
      row.hardwareRevenue[mk] = (row.hardwareRevenue[mk] || 0) + d.hardware_revenue
      row.totalHardware += d.hardware_revenue
      row.deployments.push(d)
    }
    return Array.from(map.values()).sort((a, b) => b.totalMachines - a.totalMachines)
  }, [deployments, currentYear])

  const deployedSummary = useMemo(() => {
    const machines: Record<string, number> = {}
    const hardware: Record<string, number> = {}
    const softwareMRR: Record<string, number> = {}

    for (const month of currentYearMonths) {
      let machineCount = 0, hardwareRev = 0
      for (const client of deployedClientData) {
        machineCount += client.months[month] || 0
        hardwareRev += client.hardwareRevenue[month] || 0
      }
      machines[month] = machineCount
      hardware[month] = hardwareRev
    }

    let cumulative = 0
    for (const month of currentYearMonths) {
      cumulative += machines[month] || 0
      softwareMRR[month] = cumulative * SOFTWARE_MRR_PER_UNIT
    }

    return { machines, hardware, softwareMRR, cumulativeMachines: cumulative }
  }, [currentYearMonths, deployedClientData])

  // ─── Helpers ───

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

  function toggleClient(name: string) {
    setExpandedClients(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name); else next.add(name)
      return next
    })
  }

  const generateReport = useCallback(async (period: ReportPeriod) => {
    setGeneratingReport(true)
    try {
      const res = await fetch('/api/forecasts/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, year: currentYear }),
      })
      if (!res.ok) throw new Error('Generation error')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Forecast_${period}_${currentYear}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert('Erreur lors de la generation du rapport')
    } finally {
      setGeneratingReport(false)
      setReportPeriod(null)
    }
  }, [currentYear])

  const handleAddDeployment = useCallback(async (form: {
    client_name: string; quantity: number; product: string
    hardware_revenue: number; deployment_date: string; notes: string
  }) => {
    const res = await fetch('/api/deployments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, source: 'manual' }),
    })
    if (res.ok) {
      setShowAddDeployment(false)
      fetchData()
    }
  }, [fetchData])

  // ─── Render ───

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Title + Tab Toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">
          Forecast — Pipeline commercial
        </h3>
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('forecast')}
            className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'forecast' ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Forecast
          </button>
          <button
            onClick={() => setActiveTab('deployed')}
            className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'deployed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Deploye
          </button>
        </div>
      </div>

      {activeTab === 'forecast' ? (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_FILTERS.map(pf => (
                <button key={pf.value} onClick={() => setProductFilter(pf.value)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    productFilter === pf.value ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                  }`}>{pf.label}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {PERIOD_FILTERS.map(pf => (
                <button key={pf.value} onClick={() => setPeriodFilter(pf.value)}
                  className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    periodFilter === pf.value ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                  }`}>{pf.label}</button>
              ))}
              {/* Report Export */}
              <div className="relative ml-2">
                <button onClick={() => setReportPeriod(reportPeriod ? null : 'Q1')} disabled={generatingReport}
                  className="rounded-lg px-3 py-1.5 text-[11px] font-semibold bg-brand-accent/20 text-blue-400 hover:bg-brand-accent/30 transition-colors flex items-center gap-1.5 disabled:opacity-50">
                  {generatingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                  Exporter le rapport
                </button>
                {reportPeriod !== null && !generatingReport && (
                  <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-white/[0.08] bg-[#132926] p-3 shadow-xl min-w-[200px]">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">Periode</div>
                    {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map(p => (
                      <button key={p} onClick={() => generateReport(p)}
                        className="block w-full text-left rounded-lg px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors">
                        {REPORT_PERIOD_LABELS[p]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            <SummaryCard label="Pipeline brut" value={fmtCur(totalBrut)} sub="Total non pondere" />
            <SummaryCard label="Pipeline pondere" value={fmtCur(totalPondere)} sub="Ajuste par probabilite" />
            <SummaryCard label="Deals" value={String(dealCount)} sub="En forecast" />
            <SummaryCard label="Total Machines" value={fmtNum(totalQuantity)} sub="Unites en pipeline" />
          </div>

          {/* View toggle */}
          <div className="flex gap-1.5">
            {([
              { key: 'deal' as const, label: 'Vue par deal' },
              { key: 'month' as const, label: 'Vue par mois' },
              { key: 'client' as const, label: 'Vue par client' },
            ]).map(v => (
              <button key={v.key} onClick={() => setViewMode(v.key)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  viewMode === v.key ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                }`}>{v.label}</button>
            ))}
          </div>

          {/* Tables */}
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-x-auto">
            {viewMode === 'deal' ? (
              <DealTable filtered={filtered} totalBrut={totalBrut} totalPondere={totalPondere} totalQuantity={totalQuantity} getProbaOption={getProbaOption} />
            ) : viewMode === 'month' ? (
              <MonthTable monthlyData={monthlyData} filtered={filtered} totalBrut={totalBrut} totalPondere={totalPondere} totalQuantity={totalQuantity} getMonthBorderColor={getMonthBorderColor} />
            ) : (
              <ClientTable clientData={clientData} clientViewMonths={clientViewMonths} expandedClients={expandedClients} toggleClient={toggleClient} getProbaOption={getProbaOption} />
            )}
          </div>
        </>
      ) : (
        <DeployedTab
          deployedClientData={deployedClientData}
          currentYearMonths={currentYearMonths}
          deployedSummary={deployedSummary}
          expandedClients={expandedClients}
          toggleClient={toggleClient}
          currentYear={currentYear}
          needsMigration={needsMigration}
          showAddDeployment={showAddDeployment}
          setShowAddDeployment={setShowAddDeployment}
          onAddDeployment={handleAddDeployment}
        />
      )}
    </div>
  )
}

// ─── Small reusable ───

function SummaryCard({ label, value, sub, emerald }: { label: string; value: string; sub: string; emerald?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emerald ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-white/[0.08] bg-white/[0.03]'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${emerald ? 'text-emerald-400/60' : 'text-white/40'}`}>{label}</div>
      <div className={`text-2xl font-bold ${emerald ? 'text-emerald-400' : ''}`}>{value}</div>
      <div className={`mt-0.5 text-[11px] ${emerald ? 'text-emerald-400/40' : 'text-white/30'}`}>{sub}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DEAL TABLE
// ═══════════════════════════════════════════════════════════════

function DealTable({ filtered, totalBrut, totalPondere, totalQuantity, getProbaOption }: {
  filtered: ProspectForecast[]; totalBrut: number; totalPondere: number; totalQuantity: number
  getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string }
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-white/[0.08]">
          {['Prospect', 'Entreprise', 'Produit'].map(h => <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{h}</th>)}
          {['Qty', 'Prix unit.', 'Total'].map(h => <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">{h}</th>)}
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Proba</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Mois</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Weighted</th>
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr><td colSpan={9} className="px-4 py-8 text-center text-xs text-white/30">Aucun forecast pour cette periode</td></tr>
        ) : (
          <>
            {filtered.map(f => {
              const proba = getProbaOption(f.probability)
              const weighted = Math.round(f.total_amount * f.probability / 100)
              return (
                <tr key={f.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-[13px] font-medium">{f.prospect ? `${f.prospect.prenom} ${f.prospect.nom}` : '—'}</td>
                  <td className="px-4 py-2.5 text-[13px] text-white/60">{f.prospect?.entreprise || '—'}</td>
                  <td className="px-4 py-2.5 text-[13px]">{FORECAST_PRODUCT_LABELS[f.product_type] || f.product_type}</td>
                  <td className="px-4 py-2.5 text-[13px] text-right">{f.quantity}</td>
                  <td className="px-4 py-2.5 text-[13px] text-right">{fmtCur(f.unit_price)}</td>
                  <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(f.total_amount)}</td>
                  <td className="px-4 py-2.5 text-[13px]"><span style={{ color: proba.color }}>{proba.emoji} {f.probability}% {proba.label}</span></td>
                  <td className="px-4 py-2.5 text-[13px] text-white/60">{formatMonth(f.expected_month)}</td>
                  <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(weighted)}</td>
                </tr>
              )
            })}
            <tr className="border-t border-white/[0.12] bg-white/[0.02]">
              <td colSpan={3} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Machines</td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtNum(totalQuantity)}</td>
              <td colSpan={5} />
            </tr>
            <tr className="border-t border-white/[0.08] bg-white/[0.02]">
              <td colSpan={5} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Revenus</td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalBrut)}</td>
              <td colSpan={2} />
              <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalPondere)}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  )
}

// ═══════════════════════════════════════════════════════════════
// MONTH TABLE
// ═══════════════════════════════════════════════════════════════

function MonthTable({ monthlyData, filtered, totalBrut, totalPondere, totalQuantity, getMonthBorderColor }: {
  monthlyData: Array<{ month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number }>
  filtered: ProspectForecast[]; totalBrut: number; totalPondere: number; totalQuantity: number
  getMonthBorderColor: (p: number) => string
}) {
  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-white/[0.08]">
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Mois</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Nb deals</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Machines</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total brut</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total pondere</th>
        </tr>
      </thead>
      <tbody>
        {monthlyData.length === 0 ? (
          <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-white/30">Aucun forecast pour cette periode</td></tr>
        ) : (
          <>
            {monthlyData.map(m => (
              <tr key={m.month} className="border-b border-white/[0.04] hover:bg-white/[0.02]" style={{ borderLeftWidth: 3, borderLeftColor: getMonthBorderColor(m.totalPondere) }}>
                <td className="px-4 py-2.5 text-[13px] font-medium">{formatMonth(m.month)}</td>
                <td className="px-4 py-2.5 text-[13px] text-right">{m.deals}</td>
                <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtNum(m.totalMachines)}</td>
                <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(m.totalBrut)}</td>
                <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(m.totalPondere)}</td>
              </tr>
            ))}
            <tr className="border-t border-white/[0.12] bg-white/[0.03]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Machines</td>
              <td /><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtNum(totalQuantity)}</td><td /><td />
            </tr>
            <tr className="border-t border-white/[0.08] bg-white/[0.02]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Revenus</td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">{filtered.length}</td><td />
              <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalBrut)}</td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalPondere)}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  )
}

// ═══════════════════════════════════════════════════════════════
// CLIENT TABLE (Feature 2)
// ═══════════════════════════════════════════════════════════════

function ClientTable({ clientData, clientViewMonths, expandedClients, toggleClient, getProbaOption }: {
  clientData: ClientAggRow[]; clientViewMonths: string[]; expandedClients: Set<string>
  toggleClient: (name: string) => void; getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string }
}) {
  const monthTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const c of clientData) for (const [m, qty] of Object.entries(c.months)) totals[m] = (totals[m] || 0) + qty
    return totals
  }, [clientData])
  const grandTotalMachines = clientData.reduce((s, c) => s + c.totalMachines, 0)
  const grandTotalRevenue = clientData.reduce((s, c) => s + c.totalRevenue, 0)

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-white/[0.08]">
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-white/[0.03] min-w-[180px]">Client</th>
          {clientViewMonths.map(m => <th key={m} className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-center min-w-[60px]">{formatMonthShort(m)}</th>)}
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Rev. pond.</th>
        </tr>
      </thead>
      <tbody>
        {clientData.length === 0 ? (
          <tr><td colSpan={clientViewMonths.length + 3} className="px-4 py-8 text-center text-xs text-white/30">Aucun forecast pour cette periode</td></tr>
        ) : (
          <>
            {clientData.map(client => (
              <Fragment key={client.entreprise}>
                <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer" onClick={() => toggleClient(client.entreprise)}>
                  <td className="px-4 py-2.5 text-[13px] font-semibold sticky left-0 bg-transparent">
                    <span className="flex items-center gap-1.5">
                      {expandedClients.has(client.entreprise) ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
                      {client.entreprise}
                      <span className="text-[11px] text-white/30 font-normal">({client.deals.length} deals)</span>
                    </span>
                  </td>
                  {clientViewMonths.map(m => (
                    <td key={m} className="px-3 py-2.5 text-[13px] text-center">
                      {client.months[m] ? <span className="font-medium">{client.months[m]}</span> : <span className="text-white/10">—</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-[13px] text-right font-bold">{fmtNum(client.totalMachines)}</td>
                  <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(client.totalRevenue)}</td>
                </tr>
                {expandedClients.has(client.entreprise) && client.deals.map(f => {
                  const proba = getProbaOption(f.probability)
                  return (
                    <tr key={f.id} className="bg-white/[0.01] border-b border-white/[0.02]">
                      <td className="pl-10 pr-4 py-2 text-[12px] text-white/50 sticky left-0">
                        {f.prospect ? `${f.prospect.prenom} ${f.prospect.nom}` : '—'}
                        <span className="ml-2 text-[11px]">{FORECAST_PRODUCT_LABELS[f.product_type]} · {f.quantity} u.</span>
                      </td>
                      {clientViewMonths.map(m => <td key={m} className="px-3 py-2 text-[12px] text-center text-white/30">{f.expected_month === m ? f.quantity : ''}</td>)}
                      <td className="px-4 py-2 text-[12px] text-right text-white/40">{fmtCur(f.total_amount)}</td>
                      <td className="px-4 py-2 text-[12px] text-right"><span style={{ color: proba.color }}>{proba.emoji} {f.probability}%</span></td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
            <tr className="border-t-2 border-white/[0.12] bg-white/[0.03]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50 sticky left-0 bg-white/[0.03]">Total Machines</td>
              {clientViewMonths.map(m => <td key={m} className="px-3 py-3 text-[13px] text-center font-bold">{monthTotals[m] || ''}</td>)}
              <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtNum(grandTotalMachines)}</td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(grandTotalRevenue)}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  )
}

// ═══════════════════════════════════════════════════════════════
// DEPLOYED TAB (Feature 3) - reads from deployments table
// ═══════════════════════════════════════════════════════════════

function DeployedTab({ deployedClientData, currentYearMonths, deployedSummary, expandedClients, toggleClient, currentYear, needsMigration, showAddDeployment, setShowAddDeployment, onAddDeployment }: {
  deployedClientData: DeployedClientRow[]; currentYearMonths: string[]
  deployedSummary: { machines: Record<string, number>; hardware: Record<string, number>; softwareMRR: Record<string, number>; cumulativeMachines: number }
  expandedClients: Set<string>; toggleClient: (name: string) => void; currentYear: number; needsMigration: boolean
  showAddDeployment: boolean; setShowAddDeployment: (v: boolean) => void
  onAddDeployment: (form: { client_name: string; quantity: number; product: string; hardware_revenue: number; deployment_date: string; notes: string }) => void
}) {
  const ytdMachines = Object.values(deployedSummary.machines).reduce((s, v) => s + v, 0)
  const ytdHardware = Object.values(deployedSummary.hardware).reduce((s, v) => s + v, 0)
  const lastMonthKey = currentYearMonths[currentYearMonths.length - 1]
  const ytdSoftwareMRR = deployedSummary.softwareMRR[lastMonthKey] || 0

  if (needsMigration) {
    return (
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-6 text-center">
        <p className="text-sm text-amber-400 mb-2">La table &quot;deployments&quot; n&apos;existe pas encore dans Supabase.</p>
        <p className="text-xs text-white/40 mb-4">Allez dans Supabase Dashboard &gt; SQL Editor et executez le SQL de migration.</p>
        <button onClick={() => fetch('/api/deployments/migrate', { method: 'POST' }).then(r => r.json()).then(d => {
          if (d.sql) { navigator.clipboard.writeText(d.sql); alert('SQL copie dans le presse-papier ! Collez-le dans Supabase SQL Editor.') }
        })} className="rounded-lg px-4 py-2 text-[12px] font-semibold bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors">
          Copier le SQL de migration
        </button>
      </div>
    )
  }

  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <SummaryCard emerald label="Machines deployees" value={fmtNum(ytdMachines)} sub={`YTD ${currentYear}`} />
        <SummaryCard emerald label="Revenu Hardware" value={fmtCur(ytdHardware)} sub="One-time" />
        <SummaryCard emerald label="Software MRR" value={fmtCur(ytdSoftwareMRR)} sub={`${SOFTWARE_MRR_PER_UNIT} EUR/machine/mois`} />
        <SummaryCard emerald label="Clients actifs" value={String(deployedClientData.length)} sub="Avec machines deployees" />
      </div>

      {/* Add Deployment Button */}
      <div className="flex justify-end">
        <button onClick={() => setShowAddDeployment(true)}
          className="rounded-lg px-4 py-2 text-[12px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter un deploiement
        </button>
      </div>

      {/* Add Deployment Modal */}
      {showAddDeployment && (
        <AddDeploymentModal onClose={() => setShowAddDeployment(false)} onSubmit={onAddDeployment} />
      )}

      {/* Deployed Grid */}
      <div className="rounded-xl border border-emerald-500/15 bg-white/[0.03] overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-emerald-500/15">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 sticky left-0 bg-white/[0.03] min-w-[180px]">Client</th>
              {currentYearMonths.map(m => (
                <th key={m} className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 text-center min-w-[65px]">
                  {FRENCH_MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]}
                </th>
              ))}
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 text-right min-w-[70px]">YTD</th>
            </tr>
          </thead>
          <tbody>
            {deployedClientData.length === 0 ? (
              <tr><td colSpan={14} className="px-4 py-8 text-center text-xs text-white/30">Aucun deploiement pour {currentYear}</td></tr>
            ) : (
              <>
                {deployedClientData.map(client => (
                  <Fragment key={client.clientName}>
                    <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer" onClick={() => toggleClient(client.clientName)}>
                      <td className="px-4 py-2.5 sticky left-0 bg-transparent">
                        <span className="flex items-center gap-1.5">
                          {expandedClients.has(client.clientName) ? <ChevronDown className="h-3.5 w-3.5 text-emerald-400/40" /> : <ChevronRight className="h-3.5 w-3.5 text-emerald-400/40" />}
                          <span>
                            <span className="text-[13px] font-semibold">{client.clientName}</span>
                            <span className="block text-[10px] text-blue-400/50">Software: {fmtCur(client.totalMachines * SOFTWARE_MRR_PER_UNIT)}/mois</span>
                          </span>
                        </span>
                      </td>
                      {currentYearMonths.map(m => {
                        const qty = client.months[m]
                        return (
                          <td key={m} className="px-3 py-2.5 text-[13px] text-center">
                            {qty ? <span className="inline-flex items-center justify-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-[12px] font-semibold text-emerald-400">{qty}</span> : <span className="text-white/10">—</span>}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2.5 text-[13px] text-right font-bold text-emerald-400">{fmtNum(client.totalMachines)}</td>
                    </tr>
                    {expandedClients.has(client.clientName) && client.deployments.map(d => {
                      const productLabel = PRODUCT_OPTIONS.find(p => p.value === d.product)?.label || d.product
                      const mk = `${new Date(d.deployment_date).getFullYear()}-${String(new Date(d.deployment_date).getMonth() + 1).padStart(2, '0')}`
                      return (
                        <tr key={d.id} className="bg-white/[0.01] border-b border-white/[0.02]">
                          <td className="pl-10 pr-4 py-2 text-[12px] text-white/40 sticky left-0">
                            {productLabel} · {d.quantity} u. · {fmtCur(d.hardware_revenue)}
                            <span className="ml-2 text-[10px] text-white/20">{d.source === 'pipeline' ? '(pipeline)' : '(manuel)'}</span>
                          </td>
                          {currentYearMonths.map(m => <td key={m} className="px-3 py-2 text-[12px] text-center text-emerald-400/30">{mk === m ? d.quantity : ''}</td>)}
                          <td className="px-4 py-2 text-[12px] text-right text-white/30">{d.quantity}</td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}

                {/* Summary rows */}
                <tr className="border-t-2 border-emerald-500/20 bg-emerald-500/[0.04]">
                  <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-400/70 sticky left-0 bg-emerald-500/[0.04]">Total Machines</td>
                  {currentYearMonths.map(m => <td key={m} className="px-3 py-3 text-[13px] text-center font-bold text-emerald-400">{deployedSummary.machines[m] || ''}</td>)}
                  <td className="px-4 py-3 text-[13px] text-right font-bold text-emerald-400">{fmtNum(ytdMachines)}</td>
                </tr>
                <tr className="bg-emerald-500/[0.02]">
                  <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-emerald-500/[0.02]">Revenu Hardware</td>
                  {currentYearMonths.map(m => <td key={m} className="px-3 py-2.5 text-[11px] text-center text-white/50">{deployedSummary.hardware[m] ? fmtCur(deployedSummary.hardware[m]) : ''}</td>)}
                  <td className="px-4 py-2.5 text-[12px] text-right font-semibold">{fmtCur(ytdHardware)}</td>
                </tr>
                <tr className="bg-emerald-500/[0.02]">
                  <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-emerald-500/[0.02]">Software MRR</td>
                  {currentYearMonths.map(m => <td key={m} className="px-3 py-2.5 text-[11px] text-center text-blue-400/70">{deployedSummary.softwareMRR[m] ? fmtCur(deployedSummary.softwareMRR[m]) : ''}</td>)}
                  <td className="px-4 py-2.5 text-[12px] text-right font-semibold text-blue-400">{fmtCur(ytdSoftwareMRR)}</td>
                </tr>
                <tr className="border-t border-emerald-500/15 bg-emerald-500/[0.06]">
                  <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-400 sticky left-0 bg-emerald-500/[0.06]">Revenu Total</td>
                  {currentYearMonths.map(m => {
                    const total = (deployedSummary.hardware[m] || 0) + (deployedSummary.softwareMRR[m] || 0)
                    return <td key={m} className="px-3 py-3 text-[11px] text-center font-bold text-emerald-400">{total ? fmtCur(total) : ''}</td>
                  })}
                  <td className="px-4 py-3 text-[13px] text-right font-bold text-emerald-400">{fmtCur(ytdHardware + ytdSoftwareMRR)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// ADD DEPLOYMENT MODAL
// ═══════════════════════════════════════════════════════════════

function AddDeploymentModal({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: (form: { client_name: string; quantity: number; product: string; hardware_revenue: number; deployment_date: string; notes: string }) => void
}) {
  const [clientName, setClientName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [product, setProduct] = useState('screenkit')
  const [hardwareRevenue, setHardwareRevenue] = useState(0)
  const [deploymentDate, setDeploymentDate] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientName || !deploymentDate) return
    setSubmitting(true)
    await onSubmit({ client_name: clientName, quantity, product, hardware_revenue: hardwareRevenue, deployment_date: deploymentDate, notes })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="rounded-xl border border-white/[0.08] bg-[#132926] p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold">Ajouter un deploiement</h3>
          <button onClick={onClose} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Client *</label>
            <input type="text" required value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nom du client"
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Quantite *</label>
              <input type="number" required min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Produit *</label>
              <select value={product} onChange={e => setProduct(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none">
                {PRODUCT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Revenu hardware (EUR)</label>
              <input type="number" min={0} value={hardwareRevenue} onChange={e => setHardwareRevenue(Number(e.target.value))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Date deploiement *</label>
              <input type="date" required value={deploymentDate} onChange={e => setDeploymentDate(e.target.value)}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Contexte optionnel..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none resize-none" />
          </div>

          <button type="submit" disabled={submitting || !clientName || !deploymentDate}
            className="w-full rounded-lg py-2.5 text-[13px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ajouter
          </button>
        </form>
      </div>
    </div>
  )
}
