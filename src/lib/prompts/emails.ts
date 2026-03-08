import type { Prospect } from '../types'

// ─── Email quick actions ───

export const emailQuickActions = {
  touch1: (prospect: Prospect) =>
    `Redige un premier message de prise de contact (Touch 1) pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. C'est le tout premier message, il doit etre court, personnalise et donner envie de repondre. Format email avec objet.`,

  relance: (prospect: Prospect) =>
    `Redige une relance (Touch 2 ou 3) pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. Le prospect n'a pas repondu au premier message. Apporte de la valeur et donne une raison de repondre. Format email avec objet.`,

  followUp: (prospect: Prospect) =>
    `Redige un email de suivi pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''} suite a notre dernier echange. Reprends le contexte de la derniere activite.`,

  proposeSlot: (prospect: Prospect) =>
    `Propose 2-3 creneaux disponibles cette semaine ou la semaine prochaine pour un call/meeting avec ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. Verifie mon calendrier pour eviter les conflits. Redige un court message a envoyer avec les propositions de creneaux.`,
} as const
