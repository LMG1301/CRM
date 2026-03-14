import { supabase } from '@/lib/supabase'

/**
 * POST /api/companies/apply-mapping
 *
 * Takes a validated mapping and:
 * 1. Creates companies from the mapping
 * 2. Links prospects to their company via company_id
 *
 * Body: {
 *   mapping: [
 *     { canonical: "BDA Distribution", aliases: ["bda", "BDA Distribution SAS"] },
 *     ...
 *   ]
 * }
 *
 * IMPORTANT: Run the SQL migration first (supabase/migration-companies.sql)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const mapping: Array<{ canonical: string; aliases?: string[] }> = body.mapping

    if (!Array.isArray(mapping) || mapping.length === 0) {
      return Response.json({ error: 'mapping array required' }, { status: 400 })
    }

    let companiesCreated = 0
    let prospectsLinked = 0
    const errors: string[] = []

    for (const entry of mapping) {
      const { canonical, aliases } = entry
      if (!canonical) continue

      // All name variants (canonical + aliases)
      const allNames = [canonical, ...(aliases || [])].map((n) => n.trim()).filter(Boolean)
      const uniqueAliases = [...new Set(allNames.filter((n) => n !== canonical))]

      // Upsert company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .upsert(
          { name: canonical, aliases: uniqueAliases },
          { onConflict: 'name' }
        )
        .select('id')
        .single()

      if (companyError) {
        errors.push(`Company "${canonical}": ${companyError.message}`)
        continue
      }

      companiesCreated++

      // Link prospects matching any variant (case-insensitive)
      for (const variant of allNames) {
        const { data: updated, error: updateError } = await supabase
          .from('prospects')
          .update({ company_id: company.id })
          .ilike('entreprise', variant)
          .is('company_id', null)
          .select('id')

        if (updateError) {
          errors.push(`Linking "${variant}": ${updateError.message}`)
        } else {
          prospectsLinked += updated?.length || 0
        }
      }
    }

    return Response.json({
      success: true,
      companiesCreated,
      prospectsLinked,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
