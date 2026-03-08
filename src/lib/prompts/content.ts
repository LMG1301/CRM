import type { Prospect } from '../types'

// ─── Content suggestion quick action ───

export const contentQuickActions = {
  contentSuggestion: (prospect: Prospect) =>
    `Analyse le profil de ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` (${prospect.entreprise})` : ''} (stage: ${prospect.pipeline_stage || 'inconnu'}) et suggere les 2-3 contenus les plus pertinents de notre base pour du nurturing. Pour chaque contenu, explique en 1 phrase pourquoi il est pertinent.`,
} as const
