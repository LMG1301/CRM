import { supabase } from '@/lib/supabase'
import { groupCompaniesFuzzy } from '@/lib/company-matching'

/**
 * GET /api/companies/mapping
 *
 * Generates a mapping report showing how existing prospect "entreprise"
 * values would be grouped into companies. Returns the proposed mapping
 * for review BEFORE applying any migration.
 *
 * Response format:
 * {
 *   totalProspects: number,
 *   totalUniqueNames: number,
 *   totalCompanies: number,  // after grouping
 *   mapping: [
 *     {
 *       canonical: "BDA Distribution",
 *       variants: ["BDA Distribution", "bda distribution", "BDA"],
 *       prospectCount: 5,
 *       prospects: [{ id, prenom, nom, entreprise }]
 *     },
 *     ...
 *   ]
 * }
 */
export async function GET() {
  try {
    // Fetch all prospects with their entreprise field
    const { data: prospects, error } = await supabase
      .from('prospects')
      .select('id, prenom, nom, entreprise, pipeline_stage')
      .order('entreprise')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const all = prospects || []

    // Get all non-empty enterprise names
    const namesWithDupes = all
      .map((p) => (p.entreprise || '').trim())
      .filter(Boolean)

    // Count unique raw names
    const uniqueRawNames = new Set(namesWithDupes)

    // Group using fuzzy matching
    const groups = groupCompaniesFuzzy(namesWithDupes)

    // Build mapping report
    const mapping = [...groups.entries()].map(([canonical, variants]) => {
      const uniqueVariants = [...new Set(variants)]

      // Find all prospects that match any variant
      const matchingProspects = all.filter((p) => {
        const raw = (p.entreprise || '').trim()
        return uniqueVariants.includes(raw)
      })

      return {
        canonical,
        variants: uniqueVariants,
        prospectCount: matchingProspects.length,
        prospects: matchingProspects.map((p) => ({
          id: p.id,
          prenom: p.prenom,
          nom: p.nom,
          entreprise: p.entreprise,
          pipeline_stage: p.pipeline_stage,
        })),
      }
    })

    // Sort: multi-variant groups first (most interesting for review), then by prospect count
    mapping.sort((a, b) => {
      const aMulti = a.variants.length > 1 ? 1 : 0
      const bMulti = b.variants.length > 1 ? 1 : 0
      if (aMulti !== bMulti) return bMulti - aMulti
      return b.prospectCount - a.prospectCount
    })

    // Prospects without entreprise
    const noCompany = all.filter((p) => !(p.entreprise || '').trim())

    return Response.json({
      totalProspects: all.length,
      totalUniqueNames: uniqueRawNames.size,
      totalCompanies: mapping.length,
      prospectsWithoutCompany: noCompany.length,
      mapping,
    })
  } catch (err) {
    return Response.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}
