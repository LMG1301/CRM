import { getCompaniesFromTable, getCompanies, createCompany } from '@/lib/actions'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    // Check if companies table exists and has data
    const { count } = await supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })

    if (count && count > 0) {
      // Use the companies table
      const companies = await getCompaniesFromTable()
      return Response.json({ companies, source: 'table' })
    }

    // Fallback: old fuzzy aggregation from prospects.entreprise
    const companies = await getCompanies()
    return Response.json({ companies, source: 'fuzzy' })
  } catch {
    // If companies table doesn't exist yet, fall back to fuzzy
    try {
      const companies = await getCompanies()
      return Response.json({ companies, source: 'fuzzy' })
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 500 }
      )
    }
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, sector, website, location } = body

    if (!name || !name.trim()) {
      return Response.json({ error: 'name is required' }, { status: 400 })
    }

    const company = await createCompany(name, { sector, website, location })
    return Response.json({ company })
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
