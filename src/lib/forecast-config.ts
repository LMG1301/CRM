// ─── Forecast Configuration Constants ───

/** Software MRR per deployed machine (EUR/month/machine) - Vendlive Cloud license */
export const SOFTWARE_MRR_PER_UNIT = 47

/** Report period options */
export type ReportPeriod = 'Q1' | 'Q2' | 'Q3' | 'Q4' | 'S1' | 'S2' | 'annual'

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  Q1: 'Q1 (Jan - Mar)',
  Q2: 'Q2 (Avr - Jun)',
  Q3: 'Q3 (Jul - Sep)',
  Q4: 'Q4 (Oct - Dec)',
  S1: 'S1 (Jan - Jun)',
  S2: 'S2 (Jul - Dec)',
  annual: 'Annuel',
}

export function getReportPeriodMonths(period: ReportPeriod, year: number): { start: number; end: number } {
  switch (period) {
    case 'Q1': return { start: 0, end: 2 }
    case 'Q2': return { start: 3, end: 5 }
    case 'Q3': return { start: 6, end: 8 }
    case 'Q4': return { start: 9, end: 11 }
    case 'S1': return { start: 0, end: 5 }
    case 'S2': return { start: 6, end: 11 }
    case 'annual': return { start: 0, end: 11 }
  }
}

export function getReportPeriodLabel(period: ReportPeriod, year: number): string {
  return `Forecast ${period} ${year}`
}
