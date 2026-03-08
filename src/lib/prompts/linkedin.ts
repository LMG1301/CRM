import type { Prospect } from '../types'

// ─── LinkedIn quick actions (messages, demandes de connexion) ───

export const linkedinQuickActions = {
  linkedinConnect: (prospect: Prospect) =>
    `Redige un message de demande de connexion LinkedIn pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. Court, personnalise, professionnel.`,

  linkedinMessage: (prospect: Prospect) =>
    `Redige un message LinkedIn (InMail ou message direct) pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. Objectif : engager la conversation et proposer un echange.`,
} as const
