'use client'

import { useState, useEffect, useMemo, useCallback, Fragment } from 'react'
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, Download, FileText, Plus, X, Pencil, Trash2 } from 'lucide-react'
import type { ProspectForecast, ForecastProductType } from '@/lib/types'
import { FORECAST_PRODUCT_LABELS, FORECAST_PROBABILITY_OPTIONS } from '@/lib/types'
import { SOFTWARE_MRR_PER_UNIT, PRODUCT_DEFAULT_PRICES, type ReportPeriod, REPORT_PERIOD_LABELS } from '@/lib/forecast-config'

// ─── Constants ───

const FRENCH_MONTHS = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre']
const FRENCH_MONTHS_SHORT = ['Jan','Fev','Mar','Avr','Mai','Jun','Jul','Aou','Sep','Oct','Nov','Dec']

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

// ─── Number formatting ───
const numberFmt = new Intl.NumberFormat('fr-FR')
const currencyFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
function fmtCur(val: number) { return currencyFmt.format(val) }
function fmtNum(val: number) { return numberFmt.format(val) }

// ─── Date helpers ───
function formatMonth(s: string) { const [y, m] = s.split('-').map(Number); return `${FRENCH_MONTHS[m-1]} ${y}` }
function formatMonthShort(s: string) { return FRENCH_MONTHS_SHORT[parseInt(s.split('-')[1]) - 1] }
function getPeriodEnd(p: PeriodFilter) { const d = new Date(); const e = new Date(d.getFullYear(), d.getMonth(), 1); switch(p) { case 'month': e.setMonth(e.getMonth()+1); break; case 'quarter': e.setMonth(e.getMonth()+3); break; case '6months': e.setMonth(e.getMonth()+6); break; case '12months': e.setMonth(e.getMonth()+12); break; } return e }
function getPeriodStart() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) }
function isInPeriod(s: string, p: PeriodFilter) { const [y, m] = s.split('-').map(Number); const d = new Date(y, m-1, 1); return d >= getPeriodStart() && d < getPeriodEnd(p) }
function getYearMonths(year: number) { return Array.from({ length: 12 }, (_, i) => `${year}-${String(i+1).padStart(2,'0')}`) }

// ─── Types ───

// Unified entry from either client_machines or deployments table
interface DeployedEntry {
  id: string
  source_table: 'client_machines' | 'deployments'
  clientName: string
  prospectId: string | null
  quantity: number
  product: string
  unitPrice: number
  hardwareRevenue: number
  deploymentDate: string // YYYY-MM-DD
  notes: string | null
  sourceType: string // 'existing' | 'manual' | 'pipeline'
}

interface DeploymentFormData {
  client_name: string
  quantity: number
  product: string
  unit_price: number
  deployment_date: string
  notes: string
  source_table: 'client_machines' | 'deployments'
  prospect_id?: string | null
}

interface ClientAggRow { entreprise: string; months: Record<string, number>; totalMachines: number; totalRevenue: number; deals: ProspectForecast[] }

interface DeployedClientRow {
  clientName: string
  months: Record<string, number>
  totalMachines: number
  hardwareRevenue: Record<string, number>
  totalHardware: number
  entries: DeployedEntry[]
}

type ForecastTab = 'forecast' | 'deployed'
type ForecastView = 'deal' | 'month' | 'client'

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function ForecastStats() {
  const [forecasts, setForecasts] = useState<ProspectForecast[]>([])
  const [allEntries, setAllEntries] = useState<DeployedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ForecastTab>('forecast')
  const [productFilter, setProductFilter] = useState<ForecastProductType | 'all'>('all')
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('12months')
  const [viewMode, setViewMode] = useState<ForecastView>('deal')
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set())
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod | null>(null)
  const [generatingReport, setGeneratingReport] = useState(false)

  // Deployed tab state
  const [deployedYear, setDeployedYear] = useState(new Date().getFullYear())
  const [editingEntry, setEditingEntry] = useState<DeployedEntry | null>(null)
  const [showAddDeployment, setShowAddDeployment] = useState(false)
  const [deletingEntry, setDeletingEntry] = useState<DeployedEntry | null>(null)

  // ─── Data fetching: merge client_machines + deployments into unified entries ───
  const fetchData = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/forecasts').then(r => r.json()),
      fetch('/api/client-machines').then(r => r.json()).catch(() => ({ machines: [] })),
      fetch('/api/deployments').then(r => r.json()).catch(() => ({ deployments: [] })),
    ]).then(([fd, md, dd]) => {
      setForecasts(fd.forecasts || [])

      // Convert client_machines to DeployedEntry[]
      const machineEntries: DeployedEntry[] = (md.machines || []).map((m: { id: string; prospect_id: string; entreprise: string | null; machine_type: string; quantity: number; unit_price?: number; installed_at: string | null; notes: string | null }) => {
        const up = m.unit_price || PRODUCT_DEFAULT_PRICES[m.machine_type] || 0
        return {
          id: m.id,
          source_table: 'client_machines' as const,
          clientName: m.entreprise || 'Sans entreprise',
          prospectId: m.prospect_id,
          quantity: m.quantity,
          product: m.machine_type,
          unitPrice: up,
          hardwareRevenue: m.quantity * up,
          deploymentDate: m.installed_at || m.id.substring(0, 10), // fallback
          notes: m.notes,
          sourceType: 'existing',
        }
      })

      // Convert deployments to DeployedEntry[]
      const deployEntries: DeployedEntry[] = (dd.deployments || []).map((d: { id: string; client_name: string; prospect_id: string | null; quantity: number; product: string; unit_price: number; hardware_revenue: number; deployment_date: string; source: string; notes: string | null }) => ({
        id: d.id,
        source_table: 'deployments' as const,
        clientName: d.client_name,
        prospectId: d.prospect_id,
        quantity: d.quantity,
        product: d.product,
        unitPrice: d.unit_price,
        hardwareRevenue: d.hardware_revenue,
        deploymentDate: d.deployment_date,
        notes: d.notes,
        sourceType: d.source,
      }))

      setAllEntries([...machineEntries, ...deployEntries])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Available years from all entries
  const availableYears = useMemo(() => {
    const years = new Set<number>()
    years.add(new Date().getFullYear())
    for (const e of allEntries) {
      const dt = new Date(e.deploymentDate)
      if (!isNaN(dt.getTime())) years.add(dt.getFullYear())
    }
    return Array.from(years).sort()
  }, [allEntries])

  const yearMonths = useMemo(() => getYearMonths(deployedYear), [deployedYear])

  // ─── Filtered forecast data ───
  const filtered = useMemo(() => forecasts.filter(f => {
    if (productFilter !== 'all' && f.product_type !== productFilter) return false
    return isInPeriod(f.expected_month, periodFilter)
  }), [forecasts, productFilter, periodFilter])

  const totalBrut = useMemo(() => filtered.reduce((s, f) => s + f.total_amount, 0), [filtered])
  const totalPondere = useMemo(() => filtered.reduce((s, f) => s + Math.round(f.total_amount * f.probability / 100), 0), [filtered])
  const totalQuantity = useMemo(() => filtered.reduce((s, f) => s + f.quantity, 0), [filtered])

  // ─── Monthly data ───
  const monthlyData = useMemo(() => {
    const g: Record<string, { month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number }> = {}
    for (const f of filtered) {
      if (!g[f.expected_month]) g[f.expected_month] = { month: f.expected_month, deals: 0, totalBrut: 0, totalPondere: 0, totalMachines: 0 }
      g[f.expected_month].deals++
      g[f.expected_month].totalBrut += f.total_amount
      g[f.expected_month].totalPondere += Math.round(f.total_amount * f.probability / 100)
      g[f.expected_month].totalMachines += f.quantity
    }
    return Object.values(g).sort((a, b) => a.month.localeCompare(b.month))
  }, [filtered])
  const maxMP = useMemo(() => Math.max(...monthlyData.map(m => m.totalPondere), 1), [monthlyData])

  // ─── Client aggregation ───
  const clientData = useMemo<ClientAggRow[]>(() => {
    const map = new Map<string, ClientAggRow>()
    for (const f of filtered) {
      const name = f.prospect?.entreprise || 'Sans entreprise'
      const key = name.toLowerCase().trim()
      if (!map.has(key)) map.set(key, { entreprise: name, months: {}, totalMachines: 0, totalRevenue: 0, deals: [] })
      const r = map.get(key)!
      r.months[f.expected_month] = (r.months[f.expected_month] || 0) + f.quantity
      r.totalMachines += f.quantity
      r.totalRevenue += Math.round(f.total_amount * f.probability / 100)
      r.deals.push(f)
    }
    return Array.from(map.values()).sort((a, b) => b.totalMachines - a.totalMachines)
  }, [filtered])
  const clientViewMonths = useMemo(() => {
    const m = new Set<string>(); clientData.forEach(c => Object.keys(c.months).forEach(k => m.add(k))); return Array.from(m).sort()
  }, [clientData])

  // ─── Deployed data (from client_machines + deployments, filtered by year) ───
  const deployedClientData = useMemo<DeployedClientRow[]>(() => {
    const map = new Map<string, DeployedClientRow>()
    for (const e of allEntries) {
      const dt = new Date(e.deploymentDate)
      if (isNaN(dt.getTime()) || dt.getFullYear() !== deployedYear) continue
      const key = e.clientName.toLowerCase().trim()
      if (!map.has(key)) map.set(key, { clientName: e.clientName, months: {}, totalMachines: 0, hardwareRevenue: {}, totalHardware: 0, entries: [] })
      const row = map.get(key)!
      const mk = `${deployedYear}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      row.months[mk] = (row.months[mk] || 0) + e.quantity
      row.totalMachines += e.quantity
      row.hardwareRevenue[mk] = (row.hardwareRevenue[mk] || 0) + e.hardwareRevenue
      row.totalHardware += e.hardwareRevenue
      row.entries.push(e)
    }
    return Array.from(map.values()).sort((a, b) => b.totalMachines - a.totalMachines)
  }, [allEntries, deployedYear])

  // Count ALL machines deployed BEFORE the selected year (for cumulative MRR)
  const machinesBeforeYear = useMemo(() => {
    let total = 0
    for (const e of allEntries) {
      const dt = new Date(e.deploymentDate)
      if (!isNaN(dt.getTime()) && dt.getFullYear() < deployedYear) {
        total += e.quantity
      }
    }
    return total
  }, [allEntries, deployedYear])

  const deployedSummary = useMemo(() => {
    const machines: Record<string, number> = {}
    const hardware: Record<string, number> = {}
    const softwareMRR: Record<string, number> = {}
    for (const m of yearMonths) {
      let mc = 0, hr = 0
      for (const c of deployedClientData) { mc += c.months[m] || 0; hr += c.hardwareRevenue[m] || 0 }
      machines[m] = mc; hardware[m] = hr
    }
    // MRR is cumulative across ALL years: start from machines deployed before this year
    let cum = machinesBeforeYear
    for (const m of yearMonths) { cum += machines[m] || 0; softwareMRR[m] = cum * SOFTWARE_MRR_PER_UNIT }
    return { machines, hardware, softwareMRR, cumulativeMachines: cum }
  }, [yearMonths, deployedClientData, machinesBeforeYear])

  // ─── Helpers ───
  const getProbaOption = (p: number) => FORECAST_PROBABILITY_OPTIONS.find(o => o.value === p) || FORECAST_PROBABILITY_OPTIONS[0]
  const getMonthBorderColor = (pond: number) => { const r = pond / maxMP; return `rgb(${Math.round(59+(34-59)*r)},${Math.round(130+(197-130)*r)},${Math.round(246+(94-246)*r)})` }
  const toggleClient = (name: string) => setExpandedClients(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n })

  const generateReport = useCallback(async (period: ReportPeriod) => {
    setGeneratingReport(true)
    try {
      const res = await fetch('/api/forecasts/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period, year: new Date().getFullYear() }) })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href = url; a.download = `Forecast_${period}_${new Date().getFullYear()}.pdf`; a.click(); URL.revokeObjectURL(url)
    } catch { alert('Erreur lors de la generation du rapport') }
    finally { setGeneratingReport(false); setReportPeriod(null) }
  }, [])

  // ─── CRUD: works on both client_machines and deployments ───
  const saveEntry = useCallback(async (form: DeploymentFormData, existing?: DeployedEntry) => {
    if (existing) {
      // Edit existing
      if (existing.source_table === 'client_machines') {
        await fetch('/api/client-machines', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: existing.id, machine_type: form.product, quantity: form.quantity, unit_price: form.unit_price, installed_at: form.deployment_date, notes: form.notes }) })
      } else {
        await fetch('/api/deployments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: existing.id, client_name: form.client_name, product: form.product, quantity: form.quantity, unit_price: form.unit_price, deployment_date: form.deployment_date, notes: form.notes }) })
      }
    } else {
      // New entry — goes to deployments table
      await fetch('/api/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, source: 'manual' }) })
    }
    setShowAddDeployment(false); setEditingEntry(null); fetchData()
  }, [fetchData])

  const deleteEntry = useCallback(async (entry: DeployedEntry) => {
    if (entry.source_table === 'deployments') {
      await fetch(`/api/deployments/${entry.id}`, { method: 'DELETE' })
    }
    // client_machines entries: don't delete from here (managed on prospect page)
    setDeletingEntry(null); fetchData()
  }, [fetchData])

  // ─── Render ───
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-white/30" /></div>

  return (
    <div className="space-y-5">
      {/* Title + Tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-white/40">Forecast — Pipeline commercial</h3>
        <div className="flex gap-1.5">
          <button onClick={() => setActiveTab('forecast')} className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'forecast' ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'}`}>
            <FileText className="h-3.5 w-3.5" /> Forecast
          </button>
          <button onClick={() => setActiveTab('deployed')} className={`rounded-lg px-4 py-2 text-[12px] font-semibold transition-colors flex items-center gap-1.5 ${activeTab === 'deployed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'}`}>
            <CheckCircle2 className="h-3.5 w-3.5" /> Deploye
          </button>
        </div>
      </div>

      {activeTab === 'forecast' ? (
        <ForecastTabUI
          filtered={filtered} monthlyData={monthlyData} clientData={clientData} clientViewMonths={clientViewMonths}
          totalBrut={totalBrut} totalPondere={totalPondere} totalQuantity={totalQuantity} dealCount={filtered.length}
          productFilter={productFilter} setProductFilter={setProductFilter}
          periodFilter={periodFilter} setPeriodFilter={setPeriodFilter}
          viewMode={viewMode} setViewMode={setViewMode}
          expandedClients={expandedClients} toggleClient={toggleClient}
          getProbaOption={getProbaOption} getMonthBorderColor={getMonthBorderColor}
          reportPeriod={reportPeriod} setReportPeriod={setReportPeriod}
          generatingReport={generatingReport} generateReport={generateReport}
        />
      ) : (
        <DeployedTabUI
          deployedClientData={deployedClientData} yearMonths={yearMonths} deployedSummary={deployedSummary}
          expandedClients={expandedClients} toggleClient={toggleClient}
          deployedYear={deployedYear} setDeployedYear={setDeployedYear} availableYears={availableYears}
          showAddDeployment={showAddDeployment} setShowAddDeployment={setShowAddDeployment}
          editingEntry={editingEntry} setEditingEntry={setEditingEntry}
          deletingEntry={deletingEntry} setDeletingEntry={setDeletingEntry}
          saveEntry={saveEntry} deleteEntry={deleteEntry}
        />
      )}
    </div>
  )
}

// ─── Reusable ───
function SummaryCard({ label, value, sub, emerald }: { label: string; value: string; sub: string; emerald?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emerald ? 'border-emerald-500/20 bg-emerald-500/[0.05]' : 'border-white/[0.08] bg-white/[0.03]'}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${emerald ? 'text-emerald-400/60' : 'text-white/40'}`}>{label}</div>
      <div className={`text-2xl font-bold ${emerald ? 'text-emerald-400' : ''}`}>{value}</div>
      <div className={`mt-0.5 text-[11px] ${emerald ? 'text-emerald-400/40' : 'text-white/30'}`}>{sub}</div>
    </div>
  )
}

// ═══════════════════════════════════════════
// FORECAST TAB (unchanged logic, compressed)
// ═══════════════════════════════════════════

function ForecastTabUI(props: {
  filtered: ProspectForecast[]; monthlyData: Array<{ month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number }>
  clientData: ClientAggRow[]; clientViewMonths: string[]
  totalBrut: number; totalPondere: number; totalQuantity: number; dealCount: number
  productFilter: ForecastProductType | 'all'; setProductFilter: (v: ForecastProductType | 'all') => void
  periodFilter: PeriodFilter; setPeriodFilter: (v: PeriodFilter) => void
  viewMode: ForecastView; setViewMode: (v: ForecastView) => void
  expandedClients: Set<string>; toggleClient: (n: string) => void
  getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string }
  getMonthBorderColor: (p: number) => string
  reportPeriod: ReportPeriod | null; setReportPeriod: (v: ReportPeriod | null) => void
  generatingReport: boolean; generateReport: (p: ReportPeriod) => void
}) {
  const { filtered, monthlyData, clientData, clientViewMonths, totalBrut, totalPondere, totalQuantity, dealCount, productFilter, setProductFilter, periodFilter, setPeriodFilter, viewMode, setViewMode, expandedClients, toggleClient, getProbaOption, getMonthBorderColor, reportPeriod, setReportPeriod, generatingReport, generateReport } = props

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {PRODUCT_FILTERS.map(pf => <button key={pf.value} onClick={() => setProductFilter(pf.value)} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${productFilter === pf.value ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'}`}>{pf.label}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          {PERIOD_FILTERS.map(pf => <button key={pf.value} onClick={() => setPeriodFilter(pf.value)} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${periodFilter === pf.value ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'}`}>{pf.label}</button>)}
          <div className="relative ml-2">
            <button onClick={() => setReportPeriod(reportPeriod ? null : 'Q1')} disabled={generatingReport} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold bg-brand-accent/20 text-blue-400 hover:bg-brand-accent/30 transition-colors flex items-center gap-1.5 disabled:opacity-50">
              {generatingReport ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />} Exporter le rapport
            </button>
            {reportPeriod !== null && !generatingReport && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-white/[0.08] bg-[#132926] p-3 shadow-xl min-w-[200px]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40 mb-2">Periode</div>
                {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map(p => <button key={p} onClick={() => generateReport(p)} className="block w-full text-left rounded-lg px-3 py-2 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white transition-colors">{REPORT_PERIOD_LABELS[p]}</button>)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <SummaryCard label="Pipeline brut" value={fmtCur(totalBrut)} sub="Total non pondere" />
        <SummaryCard label="Pipeline pondere" value={fmtCur(totalPondere)} sub="Ajuste par probabilite" />
        <SummaryCard label="Deals" value={String(dealCount)} sub="En forecast" />
        <SummaryCard label="Total Machines" value={fmtNum(totalQuantity)} sub="Unites en pipeline" />
      </div>

      {/* View toggle */}
      <div className="flex gap-1.5">
        {([{ key: 'deal' as const, label: 'Vue par deal' }, { key: 'month' as const, label: 'Vue par mois' }, { key: 'client' as const, label: 'Vue par client' }]).map(v =>
          <button key={v.key} onClick={() => setViewMode(v.key)} className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-colors ${viewMode === v.key ? 'bg-white/10 text-white' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'}`}>{v.label}</button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-x-auto">
        {viewMode === 'deal' ? <DealTable filtered={filtered} totalBrut={totalBrut} totalPondere={totalPondere} totalQuantity={totalQuantity} getProbaOption={getProbaOption} />
        : viewMode === 'month' ? <MonthTable monthlyData={monthlyData} filtered={filtered} totalBrut={totalBrut} totalPondere={totalPondere} totalQuantity={totalQuantity} getMonthBorderColor={getMonthBorderColor} />
        : <ClientTable clientData={clientData} clientViewMonths={clientViewMonths} expandedClients={expandedClients} toggleClient={toggleClient} getProbaOption={getProbaOption} />}
      </div>
    </>
  )
}

// ─── Deal Table ───
function DealTable({ filtered, totalBrut, totalPondere, totalQuantity, getProbaOption }: { filtered: ProspectForecast[]; totalBrut: number; totalPondere: number; totalQuantity: number; getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string } }) {
  return (
    <table className="w-full text-left"><thead><tr className="border-b border-white/[0.08]">
      {['Prospect','Entreprise','Produit'].map(h => <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">{h}</th>)}
      {['Qty','Prix unit.','Total'].map(h => <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">{h}</th>)}
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Proba</th>
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Mois</th>
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Weighted</th>
    </tr></thead><tbody>
      {filtered.length === 0 ? <tr><td colSpan={9} className="px-4 py-8 text-center text-xs text-white/30">Aucun forecast pour cette periode</td></tr> : <>
        {filtered.map(f => { const pr = getProbaOption(f.probability); const w = Math.round(f.total_amount * f.probability / 100); return (
          <tr key={f.id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
            <td className="px-4 py-2.5 text-[13px] font-medium">{f.prospect ? `${f.prospect.prenom} ${f.prospect.nom}` : '—'}</td>
            <td className="px-4 py-2.5 text-[13px] text-white/60">{f.prospect?.entreprise || '—'}</td>
            <td className="px-4 py-2.5 text-[13px]">{FORECAST_PRODUCT_LABELS[f.product_type] || f.product_type}</td>
            <td className="px-4 py-2.5 text-[13px] text-right">{f.quantity}</td>
            <td className="px-4 py-2.5 text-[13px] text-right">{fmtCur(f.unit_price)}</td>
            <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(f.total_amount)}</td>
            <td className="px-4 py-2.5 text-[13px]"><span style={{ color: pr.color }}>{pr.emoji} {f.probability}% {pr.label}</span></td>
            <td className="px-4 py-2.5 text-[13px] text-white/60">{formatMonth(f.expected_month)}</td>
            <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(w)}</td>
          </tr>
        )})}
        <tr className="border-t border-white/[0.12] bg-white/[0.02]"><td colSpan={3} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Machines</td><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtNum(totalQuantity)}</td><td colSpan={5} /></tr>
        <tr className="border-t border-white/[0.08] bg-white/[0.02]"><td colSpan={5} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Revenus</td><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalBrut)}</td><td colSpan={2} /><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalPondere)}</td></tr>
      </>}
    </tbody></table>
  )
}

// ─── Month Table ───
function MonthTable({ monthlyData, filtered, totalBrut, totalPondere, totalQuantity, getMonthBorderColor }: { monthlyData: Array<{ month: string; deals: number; totalBrut: number; totalPondere: number; totalMachines: number }>; filtered: ProspectForecast[]; totalBrut: number; totalPondere: number; totalQuantity: number; getMonthBorderColor: (p: number) => string }) {
  return (
    <table className="w-full text-left"><thead><tr className="border-b border-white/[0.08]">
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">Mois</th>
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Nb deals</th>
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Machines</th>
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total brut</th>
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total pondere</th>
    </tr></thead><tbody>
      {monthlyData.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-white/30">Aucun forecast pour cette periode</td></tr> : <>
        {monthlyData.map(m => <tr key={m.month} className="border-b border-white/[0.04] hover:bg-white/[0.02]" style={{ borderLeftWidth: 3, borderLeftColor: getMonthBorderColor(m.totalPondere) }}>
          <td className="px-4 py-2.5 text-[13px] font-medium">{formatMonth(m.month)}</td>
          <td className="px-4 py-2.5 text-[13px] text-right">{m.deals}</td>
          <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtNum(m.totalMachines)}</td>
          <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(m.totalBrut)}</td>
          <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(m.totalPondere)}</td>
        </tr>)}
        <tr className="border-t border-white/[0.12] bg-white/[0.03]"><td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Machines</td><td /><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtNum(totalQuantity)}</td><td /><td /></tr>
        <tr className="border-t border-white/[0.08] bg-white/[0.02]"><td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50">Total Revenus</td><td className="px-4 py-3 text-[13px] text-right font-bold">{filtered.length}</td><td /><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalBrut)}</td><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(totalPondere)}</td></tr>
      </>}
    </tbody></table>
  )
}

// ─── Client Table ───
function ClientTable({ clientData, clientViewMonths, expandedClients, toggleClient, getProbaOption }: { clientData: ClientAggRow[]; clientViewMonths: string[]; expandedClients: Set<string>; toggleClient: (n: string) => void; getProbaOption: (p: number) => { value: number; label: string; color: string; emoji: string } }) {
  const mTotals = useMemo(() => { const t: Record<string, number> = {}; clientData.forEach(c => Object.entries(c.months).forEach(([m, q]) => t[m] = (t[m]||0) + q)); return t }, [clientData])
  const gM = clientData.reduce((s, c) => s + c.totalMachines, 0)
  const gR = clientData.reduce((s, c) => s + c.totalRevenue, 0)
  return (
    <table className="w-full text-left"><thead><tr className="border-b border-white/[0.08]">
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-white/[0.03] min-w-[180px]">Client</th>
      {clientViewMonths.map(m => <th key={m} className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-center min-w-[60px]">{formatMonthShort(m)}</th>)}
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Total</th>
      <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-white/40 text-right">Rev. pond.</th>
    </tr></thead><tbody>
      {clientData.length === 0 ? <tr><td colSpan={clientViewMonths.length+3} className="px-4 py-8 text-center text-xs text-white/30">Aucun forecast</td></tr> : <>
        {clientData.map(c => <Fragment key={c.entreprise}>
          <tr className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer" onClick={() => toggleClient(c.entreprise)}>
            <td className="px-4 py-2.5 text-[13px] font-semibold sticky left-0 bg-transparent"><span className="flex items-center gap-1.5">{expandedClients.has(c.entreprise) ? <ChevronDown className="h-3.5 w-3.5 text-white/40"/> : <ChevronRight className="h-3.5 w-3.5 text-white/40"/>}{c.entreprise}<span className="text-[11px] text-white/30 font-normal">({c.deals.length})</span></span></td>
            {clientViewMonths.map(m => <td key={m} className="px-3 py-2.5 text-[13px] text-center">{c.months[m] ? <span className="font-medium">{c.months[m]}</span> : <span className="text-white/10">—</span>}</td>)}
            <td className="px-4 py-2.5 text-[13px] text-right font-bold">{fmtNum(c.totalMachines)}</td>
            <td className="px-4 py-2.5 text-[13px] text-right font-medium">{fmtCur(c.totalRevenue)}</td>
          </tr>
          {expandedClients.has(c.entreprise) && c.deals.map(f => { const pr = getProbaOption(f.probability); return (
            <tr key={f.id} className="bg-white/[0.01] border-b border-white/[0.02]">
              <td className="pl-10 pr-4 py-2 text-[12px] text-white/50 sticky left-0">{f.prospect ? `${f.prospect.prenom} ${f.prospect.nom}` : '—'}<span className="ml-2 text-[11px]">{FORECAST_PRODUCT_LABELS[f.product_type]} · {f.quantity} u.</span></td>
              {clientViewMonths.map(m => <td key={m} className="px-3 py-2 text-[12px] text-center text-white/30">{f.expected_month === m ? f.quantity : ''}</td>)}
              <td className="px-4 py-2 text-[12px] text-right text-white/40">{fmtCur(f.total_amount)}</td>
              <td className="px-4 py-2 text-[12px] text-right"><span style={{ color: pr.color }}>{pr.emoji} {f.probability}%</span></td>
            </tr>
          )})}
        </Fragment>)}
        <tr className="border-t-2 border-white/[0.12] bg-white/[0.03]"><td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/50 sticky left-0 bg-white/[0.03]">Total</td>
          {clientViewMonths.map(m => <td key={m} className="px-3 py-3 text-[13px] text-center font-bold">{mTotals[m] || ''}</td>)}
          <td className="px-4 py-3 text-[13px] text-right font-bold">{fmtNum(gM)}</td><td className="px-4 py-3 text-[13px] text-right font-bold">{fmtCur(gR)}</td></tr>
      </>}
    </tbody></table>
  )
}

// ═══════════════════════════════════════════
// DEPLOYED TAB (reads from client_machines + deployments)
// ═══════════════════════════════════════════

function DeployedTabUI(props: {
  deployedClientData: DeployedClientRow[]; yearMonths: string[]
  deployedSummary: { machines: Record<string, number>; hardware: Record<string, number>; softwareMRR: Record<string, number>; cumulativeMachines: number }
  expandedClients: Set<string>; toggleClient: (n: string) => void
  deployedYear: number; setDeployedYear: (y: number) => void; availableYears: number[]
  showAddDeployment: boolean; setShowAddDeployment: (v: boolean) => void
  editingEntry: DeployedEntry | null; setEditingEntry: (e: DeployedEntry | null) => void
  deletingEntry: DeployedEntry | null; setDeletingEntry: (e: DeployedEntry | null) => void
  saveEntry: (form: DeploymentFormData, existing?: DeployedEntry) => void
  deleteEntry: (entry: DeployedEntry) => void
}) {
  const { deployedClientData, yearMonths, deployedSummary, expandedClients, toggleClient, deployedYear, setDeployedYear, availableYears, showAddDeployment, setShowAddDeployment, editingEntry, setEditingEntry, deletingEntry, setDeletingEntry, saveEntry, deleteEntry } = props

  const ytdM = Object.values(deployedSummary.machines).reduce((s, v) => s + v, 0)
  const ytdH = Object.values(deployedSummary.hardware).reduce((s, v) => s + v, 0)
  const ytdS = deployedSummary.softwareMRR[yearMonths[yearMonths.length - 1]] || 0

  return (
    <>
      {/* Year selector + Add button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {availableYears.map(y => (
            <button key={y} onClick={() => setDeployedYear(y)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${deployedYear === y ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60'}`}>{y}</button>
          ))}
        </div>
        <button onClick={() => setShowAddDeployment(true)}
          className="rounded-lg px-4 py-2 text-[12px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Ajouter un deploiement
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <SummaryCard emerald label="Machines deployees" value={fmtNum(ytdM)} sub={`YTD ${deployedYear}`} />
        <SummaryCard emerald label="Revenu Hardware" value={fmtCur(ytdH)} sub="One-time" />
        <SummaryCard emerald label="Software MRR" value={fmtCur(ytdS)} sub={`${SOFTWARE_MRR_PER_UNIT} EUR/machine/mois`} />
        <SummaryCard emerald label="Clients actifs" value={String(deployedClientData.length)} sub="Avec machines deployees" />
      </div>

      {/* Modal */}
      {(showAddDeployment || editingEntry) && (
        <DeploymentModal
          existing={editingEntry}
          onClose={() => { setShowAddDeployment(false); setEditingEntry(null) }}
          onSubmit={(form) => saveEntry(form, editingEntry || undefined)}
        />
      )}

      {/* Delete confirmation */}
      {deletingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeletingEntry(null)}>
          <div className="rounded-xl border border-white/[0.08] bg-[#132926] p-6 w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm mb-2">Supprimer ce deploiement ?</p>
            {deletingEntry.source_table === 'client_machines' && (
              <p className="text-[11px] text-amber-400/70 mb-4">Cette entree vient de la fiche prospect. La suppression se fait depuis la fiche client.</p>
            )}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeletingEntry(null)} className="rounded-lg px-3 py-1.5 text-[12px] bg-white/[0.05] text-white/60 hover:bg-white/[0.1]">Annuler</button>
              {deletingEntry.source_table === 'deployments' && (
                <button onClick={() => deleteEntry(deletingEntry)} className="rounded-lg px-3 py-1.5 text-[12px] bg-red-500/20 text-red-400 hover:bg-red-500/30">Supprimer</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Deployed Grid */}
      <div className="rounded-xl border border-emerald-500/15 bg-white/[0.03] overflow-x-auto">
        <table className="w-full text-left"><thead><tr className="border-b border-emerald-500/15">
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 sticky left-0 bg-white/[0.03] min-w-[200px]">Client</th>
          {yearMonths.map(m => <th key={m} className="px-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 text-center min-w-[65px]">{FRENCH_MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]}</th>)}
          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-emerald-400/60 text-right min-w-[70px]">YTD</th>
        </tr></thead><tbody>
          {deployedClientData.length === 0 ? <tr><td colSpan={14} className="px-4 py-8 text-center text-xs text-white/30">Aucun deploiement pour {deployedYear}</td></tr> : <>
            {deployedClientData.map(client => <Fragment key={client.clientName}>
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
                {yearMonths.map(m => <td key={m} className="px-3 py-2.5 text-[13px] text-center">
                  {client.months[m] ? <span className="inline-flex items-center justify-center rounded-md bg-emerald-500/15 px-2 py-0.5 text-[12px] font-semibold text-emerald-400">{client.months[m]}</span> : <span className="text-white/10">—</span>}
                </td>)}
                <td className="px-4 py-2.5 text-[13px] text-right font-bold text-emerald-400">{fmtNum(client.totalMachines)}</td>
              </tr>
              {expandedClients.has(client.clientName) && client.entries.map(e => {
                const pLabel = PRODUCT_OPTIONS.find(p => p.value === e.product)?.label || e.product
                const dt = new Date(e.deploymentDate)
                const mk = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
                const sourceLabel = e.source_table === 'client_machines' ? 'fiche client' : e.sourceType === 'manual' ? 'manuel' : e.sourceType
                return (
                  <tr key={`${e.source_table}-${e.id}`} className="bg-white/[0.01] border-b border-white/[0.02] group">
                    <td className="pl-10 pr-4 py-2 text-[12px] text-white/40 sticky left-0">
                      <span className="flex items-center gap-2">
                        <span>
                          {pLabel} · {e.quantity} x {fmtCur(e.unitPrice)} = {fmtCur(e.hardwareRevenue)}
                          <span className="ml-2 text-[10px] text-white/20">({sourceLabel})</span>
                        </span>
                        <span className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 ml-auto shrink-0">
                          <button onClick={(ev) => { ev.stopPropagation(); setEditingEntry(e) }} className="p-1 rounded hover:bg-white/[0.06]"><Pencil className="h-3 w-3 text-white/30 hover:text-white/60" /></button>
                          <button onClick={(ev) => { ev.stopPropagation(); setDeletingEntry(e) }} className="p-1 rounded hover:bg-red-500/10"><Trash2 className="h-3 w-3 text-white/30 hover:text-red-400" /></button>
                        </span>
                      </span>
                    </td>
                    {yearMonths.map(m => <td key={m} className="px-3 py-2 text-[12px] text-center text-emerald-400/30">{mk === m ? e.quantity : ''}</td>)}
                    <td className="px-4 py-2 text-[12px] text-right text-white/30">{e.quantity}</td>
                  </tr>
                )
              })}
            </Fragment>)}

            {/* Summary rows */}
            <tr className="border-t-2 border-emerald-500/20 bg-emerald-500/[0.04]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-400/70 sticky left-0 bg-emerald-500/[0.04]">Total Machines</td>
              {yearMonths.map(m => <td key={m} className="px-3 py-3 text-[13px] text-center font-bold text-emerald-400">{deployedSummary.machines[m] || ''}</td>)}
              <td className="px-4 py-3 text-[13px] text-right font-bold text-emerald-400">{fmtNum(ytdM)}</td>
            </tr>
            <tr className="bg-emerald-500/[0.02]">
              <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-emerald-500/[0.02]">Revenu Hardware</td>
              {yearMonths.map(m => <td key={m} className="px-3 py-2.5 text-[11px] text-center text-white/50">{deployedSummary.hardware[m] ? fmtCur(deployedSummary.hardware[m]) : ''}</td>)}
              <td className="px-4 py-2.5 text-[12px] text-right font-semibold">{fmtCur(ytdH)}</td>
            </tr>
            <tr className="bg-emerald-500/[0.02]">
              <td className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40 sticky left-0 bg-emerald-500/[0.02]">Software MRR</td>
              {yearMonths.map(m => <td key={m} className="px-3 py-2.5 text-[11px] text-center text-blue-400/70">{deployedSummary.softwareMRR[m] ? fmtCur(deployedSummary.softwareMRR[m]) : ''}</td>)}
              <td className="px-4 py-2.5 text-[12px] text-right font-semibold text-blue-400">{fmtCur(ytdS)}</td>
            </tr>
            <tr className="border-t border-emerald-500/15 bg-emerald-500/[0.06]">
              <td className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-emerald-400 sticky left-0 bg-emerald-500/[0.06]">Revenu Total</td>
              {yearMonths.map(m => { const t = (deployedSummary.hardware[m]||0) + (deployedSummary.softwareMRR[m]||0); return <td key={m} className="px-3 py-3 text-[11px] text-center font-bold text-emerald-400">{t ? fmtCur(t) : ''}</td> })}
              <td className="px-4 py-3 text-[13px] text-right font-bold text-emerald-400">{fmtCur(ytdH + ytdS)}</td>
            </tr>
          </>}
        </tbody></table>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════
// DEPLOYMENT MODAL (Add / Edit) — works with DeployedEntry
// ═══════════════════════════════════════════

function DeploymentModal({ existing, onClose, onSubmit }: {
  existing: DeployedEntry | null
  onClose: () => void
  onSubmit: (form: DeploymentFormData) => void
}) {
  const [clientName, setClientName] = useState(existing?.clientName || '')
  const [quantity, setQuantity] = useState(existing?.quantity || 1)
  const [product, setProduct] = useState(existing?.product || 'screenkit')
  const [unitPrice, setUnitPrice] = useState(existing?.unitPrice || PRODUCT_DEFAULT_PRICES['screenkit'] || 0)
  const [deploymentDate, setDeploymentDate] = useState(existing?.deploymentDate?.substring(0, 10) || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [submitting, setSubmitting] = useState(false)

  const totalHT = quantity * unitPrice
  const isClientMachine = existing?.source_table === 'client_machines'

  const handleProductChange = (val: string) => {
    setProduct(val)
    if (!existing) setUnitPrice(PRODUCT_DEFAULT_PRICES[val] || 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clientName || !deploymentDate) return
    setSubmitting(true)
    await onSubmit({
      client_name: clientName, quantity, product, unit_price: unitPrice,
      deployment_date: deploymentDate, notes,
      source_table: existing?.source_table || 'deployments',
      prospect_id: existing?.prospectId,
    })
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="rounded-xl border border-white/[0.08] bg-[#132926] p-6 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-bold">{existing ? 'Modifier le deploiement' : 'Ajouter un deploiement'}</h3>
          {isClientMachine && <span className="text-[10px] text-white/30 bg-white/[0.04] rounded px-2 py-0.5">Fiche client</span>}
          <button onClick={onClose} className="text-white/30 hover:text-white/60"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Client *</label>
            <input type="text" required value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Nom du client"
              disabled={isClientMachine}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none disabled:opacity-50" />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Produit *</label>
            <select value={product} onChange={e => handleProductChange(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none">
              {PRODUCT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Quantite *</label>
              <input type="number" required min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Prix unitaire (EUR) *</label>
              <input type="number" required min={0} value={unitPrice} onChange={e => setUnitPrice(Number(e.target.value))}
                className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none" />
            </div>
          </div>

          {/* Live total */}
          <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-4 py-3">
            <div className="text-[11px] text-white/40 mb-0.5">Total HT</div>
            <div className="text-lg font-bold">
              {quantity} x {fmtCur(unitPrice)} = <span className="text-emerald-400">{fmtCur(totalHT)}</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Date deploiement *</label>
            <input type="date" required value={deploymentDate} onChange={e => setDeploymentDate(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] focus:border-emerald-500/30 focus:outline-none" />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-white/40 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Contexte optionnel..."
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13px] placeholder:text-white/20 focus:border-emerald-500/30 focus:outline-none resize-none" />
          </div>

          <button type="submit" disabled={submitting || !clientName || !deploymentDate}
            className="w-full rounded-lg py-2.5 text-[13px] font-semibold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : existing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {existing ? 'Enregistrer' : 'Ajouter'}
          </button>
        </form>
      </div>
    </div>
  )
}
