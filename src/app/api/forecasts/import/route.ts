import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Import forecasts from the CSV pipeline data.
 * POST with webhook secret. One-shot import.
 */

interface CSVRow {
  name: string
  status: string
  segment: string
  productType: 'screenkit' | 'smart_fridge' | 'smart_freezer' | 'autre'
  quarters: { quarter: string; units: number }[]
  unitPrice: number
  probability: number
}

// CSV data hardcoded from the pipeline spreadsheet
const CSV_DATA: CSVRow[] = [
  // Segment 1: New Vending Startups (ScreenKits) — €2,500/unit
  ...[
    { name: 'Fresh Food Lab', status: 'Acquired', prob: 100 },
    { name: 'Distrimag', status: 'Acquired', prob: 100 },
    { name: 'DAP', status: 'Acquired', prob: 100 },
    { name: 'Well Eat', status: 'Acquired', prob: 100 },
    { name: "Shap'Eat", status: 'Acquired', prob: 100 },
    { name: 'Graille', status: 'Acquired', prob: 100 },
    { name: 'JLN', status: 'Qualified', prob: 50 },
    { name: 'Distrimag Reseller Network', status: 'Qualified', prob: 50 },
  ].map(c => ({
    name: c.name,
    status: c.status,
    segment: 'Segment 1',
    productType: 'screenkit' as const,
    quarters: [
      { quarter: '2026-01-01', units: 2 }, { quarter: '2026-04-01', units: 3 },
      { quarter: '2026-07-01', units: 2 }, { quarter: '2026-10-01', units: 3 },
    ],
    unitPrice: 2500,
    probability: c.prob,
  })),

  // Segment 2: Regional Operators (ScreenKits) — €2,500/unit
  {
    name: 'Qualidea Network',
    status: 'Pilot',
    segment: 'Segment 2',
    productType: 'screenkit',
    quarters: [
      { quarter: '2026-04-01', units: 15 }, { quarter: '2026-07-01', units: 20 },
      { quarter: '2026-10-01', units: 20 },
    ],
    unitPrice: 2500,
    probability: 75,
  },
  {
    name: 'Prodia Plus Network',
    status: 'Qualified',
    segment: 'Segment 2',
    productType: 'screenkit',
    quarters: [
      { quarter: '2026-07-01', units: 10 }, { quarter: '2026-10-01', units: 15 },
    ],
    unitPrice: 2500,
    probability: 50,
  },
  {
    name: 'Diva et Devient Network',
    status: 'Opportunity',
    segment: 'Segment 2',
    productType: 'screenkit',
    quarters: [{ quarter: '2026-10-01', units: 5 }],
    unitPrice: 2500,
    probability: 25,
  },

  // Segment 3: Food Brands (Fridges) — €6,500/unit
  {
    name: 'Bofrost',
    status: 'Pilot',
    segment: 'Segment 3',
    productType: 'smart_fridge',
    quarters: [
      { quarter: '2026-01-01', units: 4 }, { quarter: '2026-04-01', units: 8 },
      { quarter: '2026-07-01', units: 10 }, { quarter: '2026-10-01', units: 10 },
    ],
    unitPrice: 6500,
    probability: 75,
  },
  {
    name: 'Cheef',
    status: 'Pilot',
    segment: 'Segment 3',
    productType: 'smart_fridge',
    quarters: [
      { quarter: '2026-04-01', units: 4 }, { quarter: '2026-07-01', units: 8 },
      { quarter: '2026-10-01', units: 10 },
    ],
    unitPrice: 6500,
    probability: 75,
  },
  {
    name: 'Sodebo',
    status: 'Qualified',
    segment: 'Segment 3',
    productType: 'smart_fridge',
    quarters: [
      { quarter: '2026-07-01', units: 4 }, { quarter: '2026-10-01', units: 8 },
    ],
    unitPrice: 6500,
    probability: 50,
  },

  // Segment 4: Distribution Giants (Boost Technology) — €6,500/unit — 2027+ only
  ...['Lavazza', 'Selecta', 'MaxiCoffee', 'Dallmayr'].map(name => ({
    name,
    status: 'Opportunity',
    segment: 'Segment 4',
    productType: 'smart_fridge' as const,
    quarters: [] as { quarter: string; units: number }[], // No 2026 units
    unitPrice: 6500,
    probability: 25,
  })),
]

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.WEBHOOK_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results = {
    imported: 0,
    skipped: 0,
    warnings: [] as string[],
  }

  // Get all prospects for fuzzy matching
  const { data: prospects } = await supabase
    .from('prospects')
    .select('id, prenom, nom, entreprise')

  if (!prospects) {
    return Response.json({ error: 'Could not fetch prospects' }, { status: 500 })
  }

  // Build search index
  const prospectIndex = prospects.map(p => ({
    id: p.id,
    searchName: `${p.prenom} ${p.nom}`.toLowerCase().trim(),
    searchCompany: (p.entreprise || '').toLowerCase().trim(),
  }))

  for (const row of CSV_DATA) {
    // Skip rows with no 2026 units
    if (row.quarters.length === 0) {
      results.warnings.push(`${row.name}: no 2026 data, skipped`)
      results.skipped++
      continue
    }

    // Fuzzy match prospect
    const searchTerm = row.name.toLowerCase().trim()
    const match = prospectIndex.find(p =>
      p.searchCompany.includes(searchTerm) ||
      searchTerm.includes(p.searchCompany) ||
      p.searchName.includes(searchTerm) ||
      searchTerm.includes(p.searchName) ||
      // Try splitting the search term for partial matches
      searchTerm.split(/\s+/).some(part =>
        part.length >= 3 && (p.searchCompany.includes(part) || p.searchName.includes(part))
      )
    )

    if (!match) {
      results.warnings.push(`${row.name}: no matching prospect found`)
      results.skipped++
      continue
    }

    // Insert one forecast per quarter with units
    for (const q of row.quarters) {
      if (q.units <= 0) continue

      // Check if already exists
      const { data: existing } = await supabase
        .from('prospect_forecasts')
        .select('id')
        .eq('prospect_id', match.id)
        .eq('product_type', row.productType)
        .eq('expected_month', q.quarter)
        .limit(1)

      if (existing && existing.length > 0) {
        continue // Already imported
      }

      const { error } = await supabase
        .from('prospect_forecasts')
        .insert({
          prospect_id: match.id,
          product_type: row.productType,
          unit_price: row.unitPrice,
          quantity: q.units,
          probability: row.probability,
          expected_month: q.quarter,
          notes: `Import CSV — ${row.segment} — ${row.status}`,
        })

      if (error) {
        results.warnings.push(`${row.name} ${q.quarter}: ${error.message}`)
      } else {
        results.imported++
      }
    }
  }

  return Response.json(results)
}
