import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SOFTWARE_MRR_PER_UNIT, type ReportPeriod, getReportPeriodMonths, getReportPeriodLabel } from '@/lib/forecast-config'

const FRENCH_MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aou', 'Sep', 'Oct', 'Nov', 'Dec']

function currencyFmt(val: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(val)
}

function numberFmt(val: number): string {
  return new Intl.NumberFormat('fr-FR').format(val)
}

export async function POST(request: NextRequest) {
  try {
    const { period, year } = await request.json() as { period: ReportPeriod; year: number }
    const { start, end } = getReportPeriodMonths(period, year)

    // Build month keys for the period
    const periodMonths: string[] = []
    for (let m = start; m <= end; m++) {
      periodMonths.push(`${year}-${String(m + 1).padStart(2, '0')}`)
    }

    // Fetch forecasts with prospect data
    const { data: forecasts } = await supabase
      .from('prospect_forecasts')
      .select('*, prospect:prospects(prenom, nom, entreprise, pipeline_stage)')
      .order('expected_month')

    if (!forecasts) {
      return Response.json({ error: 'No forecast data' }, { status: 404 })
    }

    // Filter to period
    const periodForecasts = forecasts.filter(f => {
      const monthKey = f.expected_month.substring(0, 7)
      return periodMonths.includes(monthKey)
    })

    // Fetch activities for client interaction timelines
    const prospectIds = [...new Set(periodForecasts.map(f => f.prospect_id))]
    const { data: activities } = await supabase
      .from('activities')
      .select('*')
      .in('prospect_id', prospectIds.length > 0 ? prospectIds : ['none'])
      .order('created_at', { ascending: false })

    // ─── Aggregate by client ───
    interface ClientSummary {
      entreprise: string
      deals: typeof periodForecasts
      totalMachines: number
      totalValue: number
      totalWeighted: number
      months: Record<string, number>
      stages: Set<string>
      products: Set<string>
      interactions: Array<{ date: string; type: string; content: string }>
    }

    const clientMap = new Map<string, ClientSummary>()

    for (const f of periodForecasts) {
      const name = f.prospect?.entreprise || 'Sans entreprise'
      const key = name.toLowerCase().trim()
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          entreprise: name,
          deals: [],
          totalMachines: 0,
          totalValue: 0,
          totalWeighted: 0,
          months: {},
          stages: new Set(),
          products: new Set(),
          interactions: [],
        })
      }
      const c = clientMap.get(key)!
      c.deals.push(f)
      c.totalMachines += f.quantity
      c.totalValue += f.total_amount
      c.totalWeighted += Math.round(f.total_amount * f.probability / 100)
      const mk = f.expected_month.substring(0, 7)
      c.months[mk] = (c.months[mk] || 0) + f.quantity
      if (f.prospect?.pipeline_stage) c.stages.add(f.prospect.pipeline_stage)
      c.products.add(f.product_type)
    }

    // Attach interactions (max 5 per client)
    const activityMap = new Map<string, typeof activities>()
    for (const a of (activities || [])) {
      if (!activityMap.has(a.prospect_id)) activityMap.set(a.prospect_id, [])
      activityMap.get(a.prospect_id)!.push(a)
    }

    for (const [, client] of clientMap) {
      const clientProspectIds = client.deals.map(d => d.prospect_id)
      const clientActivities: Array<{ date: string; type: string; content: string }> = []
      for (const pid of clientProspectIds) {
        for (const a of (activityMap.get(pid) || []).slice(0, 5)) {
          clientActivities.push({
            date: new Date(a.activity_date || a.created_at).toLocaleDateString('fr-FR'),
            type: a.type,
            content: (a.content || '').substring(0, 100),
          })
        }
      }
      client.interactions = clientActivities.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    }

    const clients = Array.from(clientMap.values()).sort((a, b) => b.totalWeighted - a.totalWeighted)

    // ─── Summary stats ───
    const totalMachines = periodForecasts.reduce((s, f) => s + f.quantity, 0)
    const totalHardware = periodForecasts.reduce((s, f) => s + Math.round(f.total_amount * f.probability / 100), 0)
    const totalSoftwareMRR = totalMachines * SOFTWARE_MRR_PER_UNIT
    const totalDeals = periodForecasts.length
    const uniqueClients = clients.length
    const signedDeals = periodForecasts.filter(f => f.probability === 100).length
    const closedDeals = periodForecasts.filter(f => f.probability === 100 || f.probability <= 0).length
    const winRate = closedDeals > 0 ? Math.round((signedDeals / (closedDeals || 1)) * 100) : null

    // ─── Generate PDF ───
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15

    // Brand colors
    const brandGreen = [13, 31, 28] as [number, number, number]
    const brandAccent = [24, 99, 220] as [number, number, number]
    const emerald = [34, 197, 94] as [number, number, number]

    function addHeader() {
      doc.setFillColor(...brandGreen)
      doc.rect(0, 0, pageWidth, 18, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text('BOOST INC', margin, 12)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text(getReportPeriodLabel(period, year), pageWidth - margin, 12, { align: 'right' })
    }

    function addFooter(pageNum: number) {
      doc.setTextColor(150, 150, 150)
      doc.setFontSize(7)
      doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 8, { align: 'right' })
      doc.text(`Genere le ${new Date().toLocaleDateString('fr-FR')}`, margin, pageHeight - 8)
    }

    // ═══ PAGE 1: Executive Summary ═══
    addHeader()
    let y = 28

    doc.setTextColor(50, 50, 50)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Resume Executif', margin, y)
    y += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Periode: ${getReportPeriodLabel(period, year)}`, margin, y)
    y += 10

    // KPI boxes
    const kpis = [
      { label: 'Machines forecast', value: numberFmt(totalMachines) },
      { label: 'Revenu Hardware (pond.)', value: currencyFmt(totalHardware) },
      { label: 'Software MRR attendu', value: currencyFmt(totalSoftwareMRR) },
      { label: 'Deals actifs', value: `${totalDeals}` },
      { label: 'Clients actifs', value: `${uniqueClients}` },
      ...(winRate !== null ? [{ label: 'Win rate', value: `${winRate}%` }] : []),
    ]

    const boxWidth = (pageWidth - margin * 2 - 10 * (kpis.length - 1)) / kpis.length
    kpis.forEach((kpi, i) => {
      const x = margin + i * (boxWidth + 10)
      doc.setFillColor(245, 245, 245)
      doc.roundedRect(x, y, boxWidth, 22, 3, 3, 'F')
      doc.setTextColor(120, 120, 120)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text(kpi.label.toUpperCase(), x + 5, y + 7)
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.value, x + 5, y + 17)
    })
    y += 32

    addFooter(1)

    // ═══ PAGE 2: Forecast Table ═══
    doc.addPage()
    addHeader()

    doc.setTextColor(50, 50, 50)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Forecast par Client', margin, 28)

    // Build table data
    const tableHead = ['Client', ...periodMonths.map(m => FRENCH_MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]), 'Total', 'Rev. pond.']
    const tableBody: (string | number)[][] = []
    const monthTotals: Record<string, number> = {}

    for (const client of clients) {
      const row: (string | number)[] = [client.entreprise]
      for (const m of periodMonths) {
        const qty = client.months[m] || 0
        row.push(qty || '')
        monthTotals[m] = (monthTotals[m] || 0) + qty
      }
      row.push(numberFmt(client.totalMachines))
      row.push(currencyFmt(client.totalWeighted))
      tableBody.push(row)
    }

    // Totals row
    const totalsRow: (string | number)[] = ['TOTAL']
    for (const m of periodMonths) {
      totalsRow.push(monthTotals[m] || '')
    }
    totalsRow.push(numberFmt(totalMachines))
    totalsRow.push(currencyFmt(totalHardware))
    tableBody.push(totalsRow)

    autoTable(doc, {
      startY: 33,
      head: [tableHead],
      body: tableBody,
      theme: 'grid',
      headStyles: {
        fillColor: brandGreen,
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8,
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 50 },
        [periodMonths.length + 1]: { fontStyle: 'bold' },
        [periodMonths.length + 2]: { fontStyle: 'bold' },
      },
      didParseCell(data) {
        // Bold the last row (totals)
        if (data.row.index === tableBody.length - 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [240, 248, 240]
        }
      },
      margin: { left: margin, right: margin },
    })

    addFooter(2)

    // ═══ PAGE 3+: Client Summaries ═══
    let pageNum = 3

    for (const client of clients) {
      doc.addPage()
      addHeader()
      let cy = 28

      // Client name
      doc.setTextColor(50, 50, 50)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(client.entreprise, margin, cy)
      cy += 2

      // Separator line
      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.5)
      doc.line(margin, cy, pageWidth - margin, cy)
      cy += 8

      // Client stats
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)

      const stats = [
        `Deals sur la periode: ${client.deals.length}`,
        `Total machines: ${numberFmt(client.totalMachines)}`,
        `Valeur totale: ${currencyFmt(client.totalWeighted)} (ponderee)`,
        `Stade(s): ${[...client.stages].join(', ') || 'N/A'}`,
        `Produits: ${[...client.products].map(p => {
          const labels: Record<string, string> = { screenkit: 'ScreenKit', smart_fridge: 'Smart Fridge', smart_freezer: 'Smart Freezer', autre: 'Autre' }
          return labels[p] || p
        }).join(', ')}`,
      ]

      for (const line of stats) {
        doc.text(line, margin, cy)
        cy += 5
      }

      cy += 5

      // Interaction Timeline
      if (client.interactions.length > 0) {
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(50, 50, 50)
        doc.text('Historique des interactions', margin, cy)
        cy += 6

        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)

        const typeLabels: Record<string, string> = {
          note: 'Note', call: 'Appel', email_sent: 'Email', email_received: 'Email recu',
          status_change: 'Changement', meeting: 'Reunion', presentation: 'Presentation',
          linkedin_interaction: 'LinkedIn', transcription: 'Transcription',
        }

        for (const interaction of client.interactions) {
          const label = typeLabels[interaction.type] || interaction.type
          const text = `${interaction.date}  ${label}: ${interaction.content}`
          doc.text(`- ${text}`, margin + 2, cy)
          cy += 4.5
          if (cy > pageHeight - 20) break
        }
      } else {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(150, 150, 150)
        doc.text('Aucune interaction enregistree', margin, cy)
      }

      addFooter(pageNum)
      pageNum++
    }

    // Output PDF
    const pdfBuffer = doc.output('arraybuffer')

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Forecast_${period}_${year}.pdf"`,
      },
    })
  } catch (err) {
    console.error('Report generation error:', err)
    return Response.json({ error: (err as Error).message }, { status: 500 })
  }
}
