'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, Download, FileText } from 'lucide-react'
import type { ProspectForecast, ForecastProductType } from '@/lib/types'
import { FORECAST_PRODUCT_LABELS, FORECAST_PROBABILITY_OPTIONS } from '@/lib/types'
import { SOFTWARE_MRR_PER_UNIT, type ReportPeriod, REPORT_PERIOD_LABELS, getReportPeriodMonths, getReportPeriodLabel } from '@/lib/forecast-config'

// ─── Constants ───

const FRENCH_MONTHS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

const FRENCH_MONTHS_SHORT = [
  'Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun',
  'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec',
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

const numberFmt = new Intl.NumberFormat('fr-FR')

const currencyFmt = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

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
  const start = getPeriodStart()
  const end = getPeriodEnd(period)
  return date >= start && date < end
}

// Generate month keys for current year (YYYY-MM format)
function getCurrentYearMonths(): string[] {
  const year = new Date().getFullYear()
  return Array.from({ length: 12 }, (_, i) => {
    const m = String(i + 1).padStart(2, '0')
    return `${year}-${m}`
  })
}

// ─── Types ───

interface ClientMachineData {
  id: string
  prospect_id: string
  entreprise: string | null
  machine_type: string
  quantity: number
  installed_at: string | null
}

interface ClientAggRow {
  entreprise: string
  months: Record<string, number>
  totalMachines: number
  totalRevenue: number
  deals: ProspectForecast[]
}

interface DeployedClientRow {
  entreprise: string
  months: Record<string, number>
  totalMachines: number
  hardwareRevenue: Record<string, number>
  totalHardware: number
  deals: Array<ProspectForecast & { prospect?: { prenom: string; nom: string; entreprise: string } }>
}

// ─── Main Tabs ───
type ForecastTab = 'forecast' | 'deployed'

// ─── Sub-views for forecast tab ───
type ForecastView = 'deal' | 'month' | 'client'

// ─── Component ───

export function ForecastStats() {
  const [forecasts, setForecasts] = useState<ProspectForecast[]>([])
  const [clientMachines, setClientMachines] = useState<ClientMachineData[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ForecastTab>('forecast')
  const [productFilter, setProductFilter] = useState<ForecastProductType | 'all'>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('12months')
  const [viewMode, setViewMode] = useState<ForecastView>('deal')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/forecasts').then(r => r.json()),
      fetch('/api/client-machines').then(r => r.json()).catch(() => ({ machines: [] })),
    ])
      .then(([forecastData, machineData]) => {
        setForecasts(forecastData.forecasts || [])
        setClientMachines(machineData.machines || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // ─── Filtered forecast data ───

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
  const totalQuantity = useMemo(() => filtered.reduce((s, f) => s + f.quantity, 0), [filtered])
  const dealCount = filtered.length

  // ─── Monthly grouped data (for "Vue par mois" + Total Machines row) ───

  const monthlyData = useMemo(() => {
    const grouped: Record<string, {
      month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number
    }> = {}
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

  const maxMonthlyPondere = useMemo(
    () => Math.max(...monthlyData.map(m => m.totalPondere), 1),
    [monthlyData],
  )

  // ─── Client aggregation data (Feature 2) ───

  const clientData = useMemo<ClientAggRow[]>(() => {
    const map = new Map<string, ClientAggRow>()
    for (const f of filtered) {
      const name = f.prospect?.entreprise || 'Sans entreprise'
      const key = name.toLowerCase().trim()
      if (!map.has(key)) {
        map.set(key, { entreprise: name, months: {}, totalMachines: 0, totalRevenue: 0, deals: [] })
      }
      const row = map.get(key)!
      row.months[f.expected_month] = (row.months[f.expected_month] || 0) + f.quantity
      row.totalMachines += f.quantity
      row.totalRevenue += Math.round(f.total_amount * f.probability / 100)
      row.deals.push(f)
    }
    return Array.from(map.values()).sort((a, b) => b.totalMachines - a.totalMachines)
  }, [filtered])

  // Get all unique months for client view columns
  const clientViewMonths = useMemo(() => {
    const months = new Set<string>()
    for (const c of clientData) {
      for (const m of Object.keys(c.months)) months.add(m)
    }
    return Array.from(months).sort()
  }, [clientData])

  // ─── Deployed data (Feature 3) ───

  const currentYearMonths = useMemo(() => getCurrentYearMonths(), [])
  const currentYear = new Date().getFullYear()

  // Signed deals (probability 100) for the current year
  const signedDeals = useMemo(() => {
    return forecasts.filter(f => {
      if (f.probability !== 100) return false
      const [year] = f.expected_month.split('-').map(Number)
      return year === currentYear
    })
  }, [forecasts, currentYear])

  const deployedClientData = useMemo<DeployedClientRow[]>(() => {
    const map = new Map<string, DeployedClientRow>()
    for (const f of signedDeals) {
      const name = f.prospect?.entreprise || 'Sans entreprise'
      const key = name.toLowerCase().trim()
      if (!map.has(key)) {
        map.set(key, { entreprise: name, months: {}, totalMachines: 0, hardwareRevenue: {}, totalHardware: 0, deals: [] })
      }
      const row = map.get(key)!
      // Use the expected_month (YYYY-MM format) - take first 7 chars
      const monthKey = f.expected_month.substring(0, 7)
      row.months[monthKey] = (row.months[monthKey] || 0) + f.quantity
      row.totalMachines += f.quantity
      row.hardwareRevenue[monthKey] = (row.hardwareRevenue[monthKey] || 0) + f.total_amount
      row.totalHardware += f.total_amount
      row.deals.push(f)
    }
    return Array.from(map.values()).sort((a, b) => b.totalMachines - a.totalMachines)
  }, [signedDeals])

  // Also include client_machines data (already installed machines)
  const installedMachinesByMonth = useMemo(() => {
    const map: Record<string, number> = {}
    for (const m of clientMachines) {
      if (!m.installed_at) continue
      const date = new Date(m.installed_at)
      if (date.getFullYear() !== currentYear) continue
      const monthKey = `${currentYear}-${String(date.getMonth() + 1).padStart(2, '0')}`
      map[monthKey] = (map[monthKey] || 0) + m.quantity
    }
    return map
  }, [clientMachines, currentYear])

  // Deployed summary rows
  const deployedSummary = useMemo(() => {
    const machines: Record<string, number> = {}
    const hardware: Record<string, number> = {}
    const softwareMRR: Record<string, number> = {}

    // Combine signed deals + installed machines
    for (const month of currentYearMonths) {
      const monthKey = month.substring(0, 7)
      let machineCount = 0
      let hardwareRev = 0

      for (const client of deployedClientData) {
        machineCount += client.months[monthKey] || 0
        hardwareRev += client.hardwareRevenue[monthKey] || 0
      }
      // Add installed machines
      machineCount += installedMachinesByMonth[monthKey] || 0

      machines[monthKey] = machineCount
      hardware[monthKey] = hardwareRev
    }

    // Compute cumulative software MRR
    let cumulativeMachines = 0
    for (const month of currentYearMonths) {
      const monthKey = month.substring(0, 7)
      cumulativeMachines += machines[monthKey] || 0
      softwareMRR[monthKey] = cumulativeMachines * SOFTWARE_MRR_PER_UNIT
    }

    return { machines, hardware, softwareMRR, cumulativeMachines }
  }, [currentYearMonths, deployedClientData, installedMachinesByMonth])

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
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // ─── Report Generation (Feature 4) ───

  const generateReport = useCallback(async (period: ReportPeriod) => {
    setGeneratingReport(true)
    try {
      const res = await fetch('/api/forecasts/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period, year: currentYear }),
      })
      if (!res.ok) throw new Error('Erreur generation')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Forecast_${period}_${currentYear}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Report generation error:', err)
      alert('Erreur lors de la generation du rapport')
    } finally {
      setGeneratingReport(false)
      setReportPeriod(null)
    }
  }, [currentYear])

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

        {/* Main tabs: Forecast | Deployed */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setActiveTab('forecast')}
            className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'forecast'
                ? 'bg-white/10 text-white'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            Forecast
          </button>
          <button
            onClick={() => setActiveTab('deployed')}
            className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${
              activeTab === 'deployed'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Deploye
          </button>
        </div>
      </div>

      {activeTab === 'forecast' ? (
        <ForecastTabContent
          filtered={filtered}
          monthlyData={monthlyData}
          clientData={clientData}
          clientViewMonths={clientViewMonths}
          totalBrut={totalBrut}
          totalPondere={totalPondere}
          totalQuantity={totalQuantity}
          dealCount={dealCount}
          maxMonthlyPondere={maxMonthlyPondere}
          productFilter={productFilter}
          setProductFilter={setProductFilter}
          periodFilter={periodFilter}
          setPeriodFilter={setPeriodFilter}
          viewMode={viewMode}
          setViewMode={setViewMode}
          expandedClients={expandedClients}
          toggleClient={toggleClient}
          getProbaOption={getProbaOption}
          getMonthBorderColor={getMonthBorderColor}
          reportPeriod={reportPeriod}
          setReportPeriod={setReportPeriod}
          generatingReport={generatingReport}
          generateReport={generateReport}
          currentYear={currentYear}
        />
      ) : (
        <DeployedTabContent
          deployedClientData={deployedClientData}
          currentYearMonths={currentYearMonths}
          deployedSummary={deployedSummary}
          expandedClients={expandedClients}
          toggleClient={toggleClient}
          currentYear={currentYear}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FORECAST TAB
// ═══════════════════════════════════════════════════════════════

function ForecastTabContent({
  filtered, monthlyData, clientData, clientViewMonths,
  totalBrut, totalPondere, totalQuantity, dealCount,
  maxMonthlyPondere,
  productFilter, setProductFilter,
  periodFilter, setPeriodFilter,
  viewMode, setViewMode,
  expandedClients, toggleClient,
  getProbaOption, getMonthBorderColor,
  reportPeriod, setReportPeriod,
  generatingReport, generateReport,
  currentYear,
}: {
  filtered: ProspectForecast[]
  monthlyData: Array<{ month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number }>
  clientData: ClientAggRow[]
  clientViewMonths: string[]
  totalBrut: number
  totalPondere: number
  totalQuantity: number
  dealCount: number
  maxMonthlyPondere: number
  productFilter: ForecastProductType | 'all'
  setProductFilter: (v: ForecastProductType | 'all') => void
  periodFilter: PeriodFilter
  setPeriodFilter: (v: PeriodFilter) => void
  viewMode: ForecastView
  setViewMode: (v: ForecastView) => void
  expandedClients: Set<string>
  toggleClient: (name: string) => void
  getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string }
  getMonthBorderColor: (p: number) => string
  reportPeriod: ReportPeriod | null
  setReportPeriod: (v: ReportPeriod | null) => void
  generatingReport: boolean
  generateReport: (p: ReportPeriod) => void
  currentYear: number
}) {
  return (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex flex-wrap gap-1.5 items-center">
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

          {/* Report Export Button */}
          <div className="relative ml-2">
            <button
              onClick={() => setReportPeriod(reportPeriod ? null : 'Q1')}
              disabled={generatingReport}
              className="rounded-lg px-3 py-1.5 text-[11px] font-semibold bg-brand-accent/20 text-blue-400 hover:bg-brand-accent/30 transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {generatingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              Exporter le rapport
            </button>
            {reportPeriod !== null && !generatingReport && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-white/[0.08] bg-[#132926] p-3 shadow-xl min-w-[200px]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">Periode</div>
                {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map(p => (
                  <button
                    key={p}
                    onClick={() => generateReport(p)}
                    className="block w-full text-left rounded-lg px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors"
                  >
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
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Pipeline brut</div>
          <div className="text-2xl font-bold">{currencyFmt.format(totalBrut)}</div>
          <div className="mt-0.5 text-[11px] text-white/30">Total non pondere</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Pipeline pondere</div>
          <div className="text-2xl font-bold">{currencyFmt.format(totalPondere)}</div>
          <div className="mt-0.5 text-[11px] text-white/30">Ajuste par probabilite</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Deals</div>
          <div className="text-2xl font-bold">{dealCount}</div>
          <div className="mt-0.5 text-[11px] text-white/30">En forecast</div>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Total Machines</div>
          <div className="text-2xl font-bold">{numberFmt.format(totalQuantity)}</div>
          <div className="mt-0.5 text-[11px] text-white/30">Unites en pipeline</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1.5">
        {[
          { key: 'deal' as const, label: 'Vue par deal' },
          { key: 'month' as const, label: 'Vue par mois' },
          { key: 'client' as const, label: 'Vue par client' },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => setViewMode(v.key)}
            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${
              viewMode === v.key
                ? 'bg-white/10 text-white'
                : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Tables */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-x-auto">
        {viewMode === 'deal' ? (
          <DealTable
            filtered={filtered}
            totalBrut={totalBrut}
            totalPondere={totalPondere}
            totalQuantity={totalQuantity}
            getProbaOption={getProbaOption}
          />
        ) : viewMode === 'month' ? (
          <MonthTable
            monthlyData={monthlyData}
            filtered={filtered}
            totalBrut={totalBrut}
            totalPondere={totalPondere}
            totalQuantity={totalQuantity}
            getMonthBorderColor={getMonthBorderColor}
          />
        ) : (
          <ClientTable
            clientData={clientData}
            clientViewMonths={clientViewMonths}
            expandedClients={expandedClients}
            toggleClient={toggleClient}
            getProbaOption={getProbaOption}
          />
        )}
      </div>
    </>
  )
}

// ─── Deal Table (original + Total Machines row) ───

function DealTable({
  filtered, totalBrut, totalPondere, totalQuantity, getProbaOption,
}: {
  filtered: ProspectForecast[]
  totalBrut: number
  totalPondere: number
  totalQuantity: number
  getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string }
}) {
  return (
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
                  <td className="px-4 py-2.5 text-[13px] text-right">{currencyFmt.format(f.unit_price)}</td>
                  <td className="px-4 py-2.5 text-[13px] text-right font-medium">{currencyFmt.format(f.total_amount)}</td>
                  <td className="px-4 py-2.5 text-[13px]">
                    <span style={{ color: proba.color }}>
                      {proba.emoji} {f.probability}% {proba.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-white/60">{formatMonth(f.expected_month)}</td>
                  <td className="px-4 py-2.5 text-[13px] text-right font-medium">{currencyFmt.format(weighted)}</td>
                </tr>
              )
            })}

            {/* Total Machines Row */}
            <tr className="border-t border-white/[0.12] bg-white/[0.02]">
              <td colSpan={3} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
                Total Machines
              </td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">
                {numberFmt.format(totalQuantity)}
              </td>
              <td colSpan={5} />
            </tr>

            {/* Weighted Revenue Row */}
            <tr className="border-t border-white/[0.08] bg-white/[0.02]">
              <td colSpan={5} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
                Total Revenus
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
  )
}

// ─── Month Table (with Total Machines row — Feature 1) ───

function MonthTable({
  monthlyData, filtered, totalBrut, totalPondere, totalQuantity, getMonthBorderColor,
}: {
  monthlyData: Array<{ month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number }>
  filtered: ProspectForecast[]
  totalBrut: number
  totalPondere: number
  totalQuantity: number
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
          <tr>
            <td colSpan={5} className="px-4 py-8 text-center text-xs text-white/30">
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
                <td className="px-4 py-2.5 text-[13px] text-right font-medium">{numberFmt.format(m.totalMachines)}</td>
                <td className="px-4 py-2.5 text-[13px] text-right font-medium">{currencyFmt.format(m.totalBrut)}</td>
                <td className="px-4 py-2.5 text-[13px] text-right font-medium">{currencyFmt.format(m.totalPondere)}</td>
              </tr>
            ))}

            {/* Total Machines Row */}
            <tr className="border-t border-white/[0.12] bg-white/[0.03]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
                Total Machines
              </td>
              <td />
              <td className="px-4 py-3 text-[13px] text-right font-bold">
                {numberFmt.format(totalQuantity)}
              </td>
              <td />
              <td />
            </tr>

            {/* Total Revenue Row */}
            <tr className="border-t border-white/[0.08] bg-white/[0.02]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">
                Total Revenus
              </td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">{filtered.length}</td>
              <td />
              <td className="px-4 py-3 text-[13px] text-right font-bold">{currencyFmt.format(totalBrut)}</td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">{currencyFmt.format(totalPondere)}</td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  )
}

// ─── Client Aggregation Table (Feature 2) ───

function ClientTable({
  clientData, clientViewMonths, expandedClients, toggleClient, getProbaOption,
}: {
  clientData: ClientAggRow[]
  clientViewMonths: string[]
  expandedClients: Set<string>
  toggleClient: (name: string) => void
  getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string }
}) {
  // Grand totals per month
  const monthTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const c of clientData) {
      for (const [m, qty] of Object.entries(c.months)) {
        totals[m] = (totals[m] || 0) + qty
      }
    }
    return totals
  }, [clientData])

  const grandTotalMachines = clientData.reduce((s, c) => s + c.totalMachines, 0)
  const grandTotalRevenue = clientData.reduce((s, c) => s + c.totalRevenue, 0)

  return (
    <table className="w-full text-left">
      <thead>
        <tr className="border-b border-white/[0.08]">
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-white/[0.03] min-w-[180px]">
            Client
          </th>
          {clientViewMonths.map(m => (
            <th key={m} className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-center min-w-[60px]">
              {formatMonthShort(m)}
            </th>
          ))}
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total</th>
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Rev. pond.</th>
        </tr>
      </thead>
      <tbody>
        {clientData.length === 0 ? (
          <tr>
            <td colSpan={clientViewMonths.length + 3} className="px-4 py-8 text-center text-xs text-white/30">
              Aucun forecast pour cette periode
            </td>
          </tr>
        ) : (
          <>
            {clientData.map(client => {
              const isExpanded = expandedClients.has(client.entreprise)
              return (
                <ClientRow
                  key={client.entreprise}
                  client={client}
                  months={clientViewMonths}
                  isExpanded={isExpanded}
                  onToggle={() => toggleClient(client.entreprise)}
                  getProbaOption={getProbaOption}
                />
              )
            })}

            {/* Grand Total Row */}
            <tr className="border-t-2 border-white/[0.12] bg-white/[0.03]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50 sticky left-0 bg-white/[0.03]">
                Total Machines
              </td>
              {clientViewMonths.map(m => (
                <td key={m} className="px-3 py-3 text-[13px] text-center font-bold">
                  {monthTotals[m] || ''}
                </td>
              ))}
              <td className="px-4 py-3 text-[13px] text-right font-bold">
                {numberFmt.format(grandTotalMachines)}
              </td>
              <td className="px-4 py-3 text-[13px] text-right font-bold">
                {currencyFmt.format(grandTotalRevenue)}
              </td>
            </tr>
          </>
        )}
      </tbody>
    </table>
  )
}

function ClientRow({
  client, months, isExpanded, onToggle, getProbaOption,
}: {
  client: ClientAggRow
  months: string[]
  isExpanded: boolean
  onToggle: () => void
  getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string }
}) {
  return (
    <>
      <tr
        className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 text-[13px] font-semibold sticky left-0 bg-transparent">
          <span className="flex items-center gap-1.5">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-white/40" /> : <ChevronRight className="h-3.5 w-3.5 text-white/40" />}
            {client.entreprise}
            <span className="text-[11px] text-white/30 font-normal">({client.deals.length} deals)</span>
          </span>
        </td>
        {months.map(m => (
          <td key={m} className="px-3 py-2.5 text-[13px] text-center">
            {client.months[m] ? <span className="font-medium">{client.months[m]}</span> : <span className="text-white/10">—</span>}
          </td>
        ))}
        <td className="px-4 py-2.5 text-[13px] text-right font-bold">{numberFmt.format(client.totalMachines)}</td>
        <td className="px-4 py-2.5 text-[13px] text-right font-medium">{currencyFmt.format(client.totalRevenue)}</td>
      </tr>

      {/* Expanded deal rows */}
      {isExpanded && client.deals.map(f => {
        const proba = getProbaOption(f.probability)
        return (
          <tr key={f.id} className="bg-white/[0.01] border-b border-white/[0.02]">
            <td className="pl-10 pr-4 py-2 text-[12px] text-white/50 sticky left-0">
              {f.prospect ? `${f.prospect.prenom} ${f.prospect.nom}` : '—'}
              <span className="ml-2 text-[11px]">
                {FORECAST_PRODUCT_LABELS[f.product_type]} · {f.quantity} u.
              </span>
            </td>
            {months.map(m => (
              <td key={m} className="px-3 py-2 text-[12px] text-center text-white/30">
                {f.expected_month === m ? f.quantity : ''}
              </td>
            ))}
            <td className="px-4 py-2 text-[12px] text-right text-white/40">{currencyFmt.format(f.total_amount)}</td>
            <td className="px-4 py-2 text-[12px] text-right">
              <span style={{ color: proba.color }}>{proba.emoji} {f.probability}%</span>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// DEPLOYED TAB (Feature 3)
// ═══════════════════════════════════════════════════════════════

function DeployedTabContent({
  deployedClientData, currentYearMonths, deployedSummary, expandedClients, toggleClient, currentYear,
}: {
  deployedClientData: DeployedClientRow[]
  currentYearMonths: string[]
  deployedSummary: {
    machines: Record<string, number>
    hardware: Record<string, number>
    softwareMRR: Record<string, number>
    cumulativeMachines: number
  }
  expandedClients: Set<string>
  toggleClient: (name: string) => void
  currentYear: number
}) {
  const ytdMachines = Object.values(deployedSummary.machines).reduce((s, v) => s + v, 0)
  const ytdHardware = Object.values(deployedSummary.hardware).reduce((s, v) => s + v, 0)
  const lastMonthKey = currentYearMonths[currentYearMonths.length - 1]?.substring(0, 7)
  const ytdSoftwareMRR = deployedSummary.softwareMRR[lastMonthKey] || 0

  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 mb-1">Machines deployees</div>
          <div className="text-2xl font-bold text-emerald-400">{numberFmt.format(ytdMachines)}</div>
          <div className="mt-0.5 text-[11px] text-emerald-400/40">YTD {currentYear}</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 mb-1">Revenu Hardware</div>
          <div className="text-2xl font-bold text-emerald-400">{currencyFmt.format(ytdHardware)}</div>
          <div className="mt-0.5 text-[11px] text-emerald-400/40">One-time</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 mb-1">Software MRR</div>
          <div className="text-2xl font-bold text-emerald-400">{currencyFmt.format(ytdSoftwareMRR)}</div>
          <div className="mt-0.5 text-[11px] text-emerald-400/40">{SOFTWARE_MRR_PER_UNIT} EUR/machine/mois</div>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 mb-1">Clients actifs</div>
          <div className="text-2xl font-bold text-emerald-400">{deployedClientData.length}</div>
          <div className="mt-0.5 text-[11px] text-emerald-400/40">Avec machines signees</div>
        </div>
      </div>

      {/* Deployed Grid */}
      <div className="rounded-xl border border-emerald-500/15 bg-white/[0.03] overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-emerald-500/15">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 sticky left-0 bg-white/[0.03] min-w-[180px]">
                Client
              </th>
              {currentYearMonths.map(m => (
                <th key={m} className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 text-center min-w-[65px]">
                  {FRENCH_MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]}
                </th>
              ))}
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 text-right min-w-[70px]">
                YTD
              </th>
            </tr>
          </thead>
          <tbody>
            {deployedClientData.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-xs text-white/30">
                  Aucun deal signe pour {currentYear}
                </td>
              </tr>
            ) : (
              <>
                {/* Client Rows */}
                {deployedClientData.map(client => {
                  const isExpanded = expandedClients.has(client.entreprise)
                  const clientSoftware = client.totalMachines * SOFTWARE_MRR_PER_UNIT
                  return (
                    <DeployedClientRow
                      key={client.entreprise}
                      client={client}
                      months={currentYearMonths}
                      isExpanded={isExpanded}
                      onToggle={() => toggleClient(client.entreprise)}
                      softwareRevenue={clientSoftware}
                    />
                  )
                })}

                {/* ── Summary Section ── */}
                {/* Total Machines */}
                <tr className="border-t-2 border-emerald-500/20 bg-emerald-500/[0.04]">
                  <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-400/70 sticky left-0 bg-emerald-500/[0.04]">
                    Total Machines
                  </td>
                  {currentYearMonths.map(m => {
                    const mk = m.substring(0, 7)
                    return (
                      <td key={m} className="px-3 py-3 text-[13px] text-center font-bold text-emerald-400">
                        {deployedSummary.machines[mk] || ''}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-[13px] text-right font-bold text-emerald-400">
                    {numberFmt.format(ytdMachines)}
                  </td>
                </tr>

                {/* Hardware Revenue */}
                <tr className="bg-emerald-500/[0.02]">
                  <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-emerald-500/[0.02]">
                    Revenu Hardware
                  </td>
                  {currentYearMonths.map(m => {
                    const mk = m.substring(0, 7)
                    const val = deployedSummary.hardware[mk]
                    return (
                      <td key={m} className="px-3 py-2.5 text-[11px] text-center text-white/50">
                        {val ? currencyFmt.format(val) : ''}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-[12px] text-right font-semibold">
                    {currencyFmt.format(ytdHardware)}
                  </td>
                </tr>

                {/* Software MRR (cumulative) */}
                <tr className="bg-emerald-500/[0.02]">
                  <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-emerald-500/[0.02]">
                    Software MRR
                  </td>
                  {currentYearMonths.map(m => {
                    const mk = m.substring(0, 7)
                    const val = deployedSummary.softwareMRR[mk]
                    return (
                      <td key={m} className="px-3 py-2.5 text-[11px] text-center text-blue-400/70">
                        {val ? currencyFmt.format(val) : ''}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2.5 text-[12px] text-right font-semibold text-blue-400">
                    {currencyFmt.format(ytdSoftwareMRR)}
                  </td>
                </tr>

                {/* Total Revenue */}
                <tr className="border-t border-emerald-500/15 bg-emerald-500/[0.06]">
                  <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-400 sticky left-0 bg-emerald-500/[0.06]">
                    Revenu Total
                  </td>
                  {currentYearMonths.map(m => {
                    const mk = m.substring(0, 7)
                    const hw = deployedSummary.hardware[mk] || 0
                    const sw = deployedSummary.softwareMRR[mk] || 0
                    const total = hw + sw
                    return (
                      <td key={m} className="px-3 py-3 text-[11px] text-center font-bold text-emerald-400">
                        {total ? currencyFmt.format(total) : ''}
                      </td>
                    )
                  })}
                  <td className="px-4 py-3 text-[13px] text-right font-bold text-emerald-400">
                    {currencyFmt.format(ytdHardware + ytdSoftwareMRR)}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function DeployedClientRow({
  client, months, isExpanded, onToggle, softwareRevenue,
}: {
  client: DeployedClientRow
  months: string[]
  isExpanded: boolean
  onToggle: () => void
  softwareRevenue: number
}) {
  return (
    <>
      <tr
        className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5 sticky left-0 bg-transparent">
          <span className="flex items-center gap-1.5">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-emerald-400/40" /> : <ChevronRight className="h-3.5 w-3.5 text-emerald-400/40" />}
            <span>
              <span className="text-[13px] font-semibold">{client.entreprise}</span>
              <span className="block text-[10px] text-blue-400/50">
                Software: {currencyFmt.format(softwareRevenue)}/mois
              </span>
            </span>
          </span>
        </td>
        {months.map(m => {
          const mk = m.substring(0, 7)
          const qty = client.months[mk]
          return (
            <td key={m} className="px-3 py-2.5 text-[13px] text-center">
              {qty ? (
                <span className="inline-flex items-center justify-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-[12px] font-semibold text-emerald-400">
                  {qty}
                </span>
              ) : (
                <span className="text-white/10">—</span>
              )}
            </td>
          )
        })}
        <td className="px-4 py-2.5 text-[13px] text-right font-bold text-emerald-400">
          {numberFmt.format(client.totalMachines)}
        </td>
      </tr>

      {/* Expanded deals */}
      {isExpanded && client.deals.map(f => (
        <tr key={f.id} className="bg-white/[0.01] border-b border-white/[0.02]">
          <td className="pl-10 pr-4 py-2 text-[12px] text-white/40 sticky left-0">
            {f.prospect ? `${f.prospect.prenom} ${f.prospect.nom}` : '—'}
            <span className="ml-2 text-[11px] text-white/25">
              {FORECAST_PRODUCT_LABELS[f.product_type]} · {f.quantity} u. · {currencyFmt.format(f.total_amount)}
            </span>
          </td>
          {months.map(m => {
            const mk = m.substring(0, 7)
            const monthKey = f.expected_month.substring(0, 7)
            return (
              <td key={m} className="px-3 py-2 text-[12px] text-center text-emerald-400/30">
                {monthKey === mk ? f.quantity : ''}
              </td>
            )
          })}
          <td className="px-4 py-2 text-[12px] text-right text-white/30">{f.quantity}</td>
        </tr>
      ))}
    </>
  )
}
