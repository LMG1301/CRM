import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAnthropicClient } from '@/lib/anthropic'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SOFTWARE_MRR_PER_UNIT, type ReportPeriod, getReportPeriodMonths, getReportPeriodLabel } from '@/lib/forecast-config'

// ─── Number formatting — proper FR convention (space as thousand sep) ───
// Using a manual formatter to avoid any Node/jsPDF encoding issues with Intl

function fmtCurrency(val: number): string {
  const rounded = Math.round(val)
  const parts = Math.abs(rounded).toString().split('.')
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return `${rounded < 0 ? '-' : ''}${intPart} EUR`
}

function fmtNumber(val: number): string {
  return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export async function POST(request: NextRequest) {
  try {
    const { period, year } = await request.json() as { period: ReportPeriod; year: number }
    const { start, end } = getReportPeriodMonths(period, year)

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

    const periodForecasts = forecasts.filter(f => {
      const monthKey = f.expected_month.substring(0, 7)
      return periodMonths.includes(monthKey)
    })

    // Fetch activities for AI summaries
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
      aiSummary?: string
    }

    const clientMap = new Map<string, ClientSummary>()

    for (const f of periodForecasts) {
      const name = f.prospect?.entreprise || 'Unknown'
      const key = name.toLowerCase().trim()
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          entreprise: name, deals: [], totalMachines: 0, totalValue: 0, totalWeighted: 0,
          months: {}, stages: new Set(), products: new Set(), interactions: [],
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

    // Attach interactions
    const activityMap = new Map<string, typeof activities>()
    for (const a of (activities || [])) {
      if (!activityMap.has(a.prospect_id)) activityMap.set(a.prospect_id, [])
      activityMap.get(a.prospect_id)!.push(a)
    }

    for (const [, client] of clientMap) {
      const clientProspectIds = client.deals.map(d => d.prospect_id)
      const clientActivities: Array<{ date: string; type: string; content: string }> = []
      for (const pid of clientProspectIds) {
        for (const a of (activityMap.get(pid) || []).slice(0, 10)) {
          clientActivities.push({
            date: new Date(a.activity_date || a.created_at).toLocaleDateString('en-GB'),
            type: a.type,
            content: (a.content || '').substring(0, 200),
          })
        }
      }
      client.interactions = clientActivities.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
    }

    const clients = Array.from(clientMap.values()).sort((a, b) => b.totalWeighted - a.totalWeighted)

    // ─── AI-generated summaries via Claude Sonnet ───
    const anthropic = getAnthropicClient()

    for (const client of clients) {
      if (client.interactions.length === 0) continue
      try {
        const interactionText = client.interactions
          .map(i => `- ${i.date} [${i.type}]: ${i.content}`)
          .join('\n')

        const productLabels: Record<string, string> = {
          screenkit: 'ScreenKit', smart_fridge: 'Smart Fridge',
          smart_freezer: 'Smart Freezer', boostbar: 'BoostBar', autre: 'Other',
        }

        const msg = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: 'You are a sales assistant at Boost Inc, a vending/retail technology company. Summarize the following client interactions into a 2-3 sentence executive brief in English. Focus on: current deal status, last significant action, and next expected step. Be concise and factual. Do not use bullet points.',
          messages: [{
            role: 'user',
            content: `Client: ${client.entreprise}\nDeals: ${client.deals.length} deal(s), ${client.totalMachines} machines, ${fmtCurrency(client.totalWeighted)} weighted\nProducts: ${[...client.products].map(p => productLabels[p] || p).join(', ')}\nStage(s): ${[...client.stages].join(', ') || 'N/A'}\n\nRecent interactions:\n${interactionText}`,
          }],
        })

        const textBlock = msg.content.find(b => b.type === 'text')
        if (textBlock && textBlock.type === 'text') {
          client.aiSummary = textBlock.text
        }
      } catch (err) {
        console.error(`AI summary failed for ${client.entreprise}:`, err)
        // Fallback: no AI summary, will use interaction list
      }
    }

    // ─── Summary stats ───
    const totalMachines = periodForecasts.reduce((s, f) => s + f.quantity, 0)
    const totalHardware = periodForecasts.reduce((s, f) => s + Math.round(f.total_amount * f.probability / 100), 0)
    const totalSoftwareMRR = totalMachines * SOFTWARE_MRR_PER_UNIT
    const totalDeals = periodForecasts.length
    const uniqueClients = clients.length
    const signedDeals = periodForecasts.filter(f => f.probability === 100).length
    const closedDeals = periodForecasts.filter(f => f.probability === 100 || f.probability <= 0).length
    const winRate = closedDeals > 0 ? Math.round((signedDeals / (closedDeals || 1)) * 100) : null

    // ═══════════════════════════════════════════════
    // GENERATE PDF (all in English)
    // ═══════════════════════════════════════════════

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15

    const brandGreen = [13, 31, 28] as [number, number, number]

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
      doc.text(`Generated on ${new Date().toLocaleDateString('en-GB')}`, margin, pageHeight - 8)
    }

    // ═══ PAGE 1: Executive Summary ═══
    addHeader()
    let y = 28

    doc.setTextColor(50, 50, 50)
    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text('Executive Summary', margin, y)
    y += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Period: ${getReportPeriodLabel(period, year)}`, margin, y)
    y += 10

    const kpis = [
      { label: 'MACHINES FORECAST', value: fmtNumber(totalMachines) },
      { label: 'HARDWARE REVENUE (W)', value: fmtCurrency(totalHardware) },
      { label: 'SOFTWARE MRR (EOP)', value: fmtCurrency(totalSoftwareMRR) },
      { label: 'ACTIVE DEALS', value: `${totalDeals}` },
      { label: 'ACTIVE CLIENTS', value: `${uniqueClients}` },
      ...(winRate !== null ? [{ label: 'WIN RATE', value: `${winRate}%` }] : []),
    ]

    const boxWidth = (pageWidth - margin * 2 - 10 * (kpis.length - 1)) / kpis.length
    kpis.forEach((kpi, i) => {
      const x = margin + i * (boxWidth + 10)
      doc.setFillColor(245, 245, 245)
      doc.roundedRect(x, y, boxWidth, 22, 3, 3, 'F')
      doc.setTextColor(120, 120, 120)
      doc.setFontSize(6.5)
      doc.setFont('helvetica', 'normal')
      doc.text(kpi.label, x + 4, y + 7)
      doc.setTextColor(30, 30, 30)
      doc.setFontSize(11)
      doc.setFont('helvetica', 'bold')
      doc.text(kpi.value, x + 4, y + 17)
    })
    y += 32

    addFooter(1)

    // ═══ PAGE 2: Forecast Table ═══
    doc.addPage()
    addHeader()

    doc.setTextColor(50, 50, 50)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Forecast by Client', margin, 28)

    const tableHead = ['Client', ...periodMonths.map(m => MONTHS_SHORT[parseInt(m.split('-')[1]) - 1]), 'Total', 'Weighted Rev.']
    const tableBody: (string | number)[][] = []
    const monthTotals: Record<string, number> = {}

    for (const client of clients) {
      const row: (string | number)[] = [client.entreprise]
      for (const m of periodMonths) {
        const qty = client.months[m] || 0
        row.push(qty || '')
        monthTotals[m] = (monthTotals[m] || 0) + qty
      }
      row.push(fmtNumber(client.totalMachines))
      row.push(fmtCurrency(client.totalWeighted))
      tableBody.push(row)
    }

    // Totals row
    const totalsRow: (string | number)[] = ['TOTAL']
    for (const m of periodMonths) totalsRow.push(monthTotals[m] || '')
    totalsRow.push(fmtNumber(totalMachines))
    totalsRow.push(fmtCurrency(totalHardware))
    tableBody.push(totalsRow)

    autoTable(doc, {
      startY: 33,
      head: [tableHead],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: brandGreen, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', halign: 'center' },
      bodyStyles: { fontSize: 8, halign: 'center' },
      columnStyles: {
        0: { halign: 'left', fontStyle: 'bold', cellWidth: 50 },
        [periodMonths.length + 1]: { fontStyle: 'bold' },
        [periodMonths.length + 2]: { fontStyle: 'bold' },
      },
      didParseCell(data) {
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

    const productLabels: Record<string, string> = {
      screenkit: 'ScreenKit', smart_fridge: 'Smart Fridge',
      smart_freezer: 'Smart Freezer', boostbar: 'BoostBar', autre: 'Other',
    }

    for (const client of clients) {
      doc.addPage()
      addHeader()
      let cy = 28

      doc.setTextColor(50, 50, 50)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(client.entreprise, margin, cy)
      cy += 2

      doc.setDrawColor(200, 200, 200)
      doc.setLineWidth(0.5)
      doc.line(margin, cy, pageWidth - margin, cy)
      cy += 8

      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(80, 80, 80)

      const stats = [
        `Deals in period: ${client.deals.length}`,
        `Total machines: ${fmtNumber(client.totalMachines)}`,
        `Total value: ${fmtCurrency(client.totalWeighted)} (weighted)`,
        `Stage(s): ${[...client.stages].join(', ') || 'N/A'}`,
        `Key products: ${[...client.products].map(p => productLabels[p] || p).join(', ')}`,
      ]

      for (const line of stats) {
        doc.text(line, margin, cy)
        cy += 5
      }

      cy += 6

      // AI-generated status summary OR fallback
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(50, 50, 50)
      doc.text('Status Summary', margin, cy)
      cy += 6

      if (client.aiSummary) {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(60, 60, 60)

        // Word-wrap the AI summary
        const lines = doc.splitTextToSize(client.aiSummary, pageWidth - margin * 2 - 5)
        for (const line of lines) {
          doc.text(line, margin + 2, cy)
          cy += 4.5
          if (cy > pageHeight - 20) break
        }
      } else if (client.interactions.length > 0) {
        // Fallback: bullet list of last 5 interactions
        doc.setFontSize(8)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 100, 100)

        const typeLabels: Record<string, string> = {
          note: 'Note', call: 'Call', email_sent: 'Email sent', email_received: 'Email received',
          status_change: 'Status change', meeting: 'Meeting', presentation: 'Presentation',
          linkedin_interaction: 'LinkedIn', transcription: 'Transcription',
        }

        for (const interaction of client.interactions.slice(0, 5)) {
          const label = typeLabels[interaction.type] || interaction.type
          const text = `${interaction.date}  ${label}: ${interaction.content}`
          const wrappedLines = doc.splitTextToSize(`- ${text}`, pageWidth - margin * 2 - 10)
          for (const wl of wrappedLines) {
            doc.text(wl, margin + 2, cy)
            cy += 4
            if (cy > pageHeight - 20) break
          }
          if (cy > pageHeight - 20) break
        }
      } else {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(150, 150, 150)
        doc.text('No interactions recorded for this period.', margin, cy)
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
