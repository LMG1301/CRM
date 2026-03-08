/**
 * Fuzzy company name matching — groups similar company names together.
 * Uses Levenshtein distance with normalization to handle typos like
 * Beaufrost/Bofrost, Dallmayer/Dallmayr, etc.
 */

// Legal suffixes to strip before comparison
const LEGAL_SUFFIXES = [
  'sas', 'sarl', 'sa', 'eurl', 'sasu', 'sci', 'snc',
  'gmbh', 'ag', 'inc', 'ltd', 'llc', 'corp', 'co',
  'bv', 'nv', 'sprl', 'bvba',
]

export function normalizeCompanyName(name: string): string {
  let normalized = name.toLowerCase().trim()
  // Remove common punctuation
  normalized = normalized.replace(/[.,\-_'"()]/g, ' ')
  // Remove legal suffixes
  const words = normalized.split(/\s+/).filter(Boolean)
  const filtered = words.filter(w => !LEGAL_SUFFIXES.includes(w))
  return filtered.join(' ').trim() || normalized
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
      }
    }
  }

  return dp[m][n]
}

/** Normalized similarity: 0 = identical, 1 = completely different */
export function normalizedDistance(a: string, b: string): number {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (na === nb) return 0
  const maxLen = Math.max(na.length, nb.length)
  if (maxLen === 0) return 0
  return levenshteinDistance(na, nb) / maxLen
}

/**
 * Groups company names that are similar (distance < threshold).
 * Returns a Map from canonical name → list of all variant names.
 * Canonical name = the most frequent variant, or longest if tied.
 */
export function groupCompaniesFuzzy(
  names: string[],
  threshold = 0.3
): Map<string, string[]> {
  const groups: string[][] = []

  for (const name of names) {
    if (!name || !name.trim()) continue

    let foundGroup = false
    for (const group of groups) {
      // Compare against first member (representative)
      if (normalizedDistance(name, group[0]) < threshold) {
        group.push(name)
        foundGroup = true
        break
      }
    }

    if (!foundGroup) {
      groups.push([name])
    }
  }

  // Build map: canonical name → variants
  const result = new Map<string, string[]>()
  for (const group of groups) {
    // Count frequency of each variant
    const freq = new Map<string, number>()
    for (const name of group) {
      freq.set(name, (freq.get(name) || 0) + 1)
    }
    // Pick canonical: most frequent, then longest
    const canonical = [...freq.entries()]
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0]
    const uniqueVariants = [...new Set(group)]
    result.set(canonical, uniqueVariants)
  }

  return result
}
