import type { Prospect, Activity, BusinessContext } from './types'

// ─── Knowledge document type ───

interface KnowledgeDocument {
  id: string
  name: string
  content: string
  folder_path: string | null
  mime_type: string | null
}

// ─── Build system prompt with prospect context ───

export function buildSystemPrompt(
  prospect?: Prospect | null,
  activities?: Activity[],
  businessContext?: BusinessContext | null,
  knowledgeDocuments?: KnowledgeDocument[]
): string {
  let prompt = buildBasePrompt(businessContext)

  if (knowledgeDocuments && knowledgeDocuments.length > 0) {
    prompt += '\n\n' + buildKnowledgeContext(knowledgeDocuments)
  }

  if (prospect) {
    prompt += '\n\n' + buildProspectContext(prospect, activities || [])
  }

  return prompt
}

// ─── Build base prompt from business context ───

function buildBasePrompt(ctx?: BusinessContext | null): string {
  // If no business context saved, use fallback
  if (!ctx || (!ctx.company_name && !ctx.company_description)) {
    return FALLBACK_SYSTEM_PROMPT
  }

  const sections: string[] = [
    `Tu es l'assistant commercial IA de Louis chez ${ctx.company_name || 'son entreprise'}.`,
  ]

  if (ctx.company_description) {
    sections.push(`\n## A propos de ${ctx.company_name || 'l\'entreprise'}`)
    sections.push(ctx.company_description)
  }

  if (ctx.products) {
    sections.push(`\n## Produits / Services`)
    sections.push(ctx.products)
  }

  if (ctx.sales_methodology) {
    sections.push(`\n## Methode commerciale`)
    sections.push(ctx.sales_methodology)
  }

  if (ctx.tone_and_style) {
    sections.push(`\n## Regles de redaction`)
    sections.push(ctx.tone_and_style)
  }

  if (ctx.email_templates) {
    sections.push(`\n## Templates email (pour t'inspirer)`)
    sections.push(ctx.email_templates)
  }

  if (ctx.linkedin_templates) {
    sections.push(`\n## Templates LinkedIn (pour t'inspirer)`)
    sections.push(ctx.linkedin_templates)
  }

  if (ctx.additional_context) {
    sections.push(`\n## Contexte additionnel`)
    sections.push(ctx.additional_context)
  }

  sections.push(CAPABILITIES_BLOCK)

  return sections.join('\n')
}

// ─── Capabilities (always included) ───

const CAPABILITIES_BLOCK = `
## Ce que tu peux faire

1. **Rediger des emails/messages** : Touch 1, relances, follow-ups, messages LinkedIn, adaptes au prospect et a son stade dans le pipeline.
2. **Suggerer la prochaine action** : Analyser le prospect et recommander quoi faire (relancer, appeler, envoyer un devis, etc.)
3. **Resumer les echanges** : Faire une synthese de l'historique d'activites.
4. **Conseiller sur la strategie** : Aider a prioriser les actions et optimiser le process commercial.
5. **Rediger des messages LinkedIn** : Demandes de connexion, InMails, commentaires strategiques.

## Format de reponse

- Pour les emails : commence directement par "Objet :" puis le corps du mail.
- Pour les messages LinkedIn : commence directement par le message.
- Pour les suggestions : liste claire et actionnable.
- Pour les resumes : bullet points concis.
- Utilise le markdown pour la mise en forme.
- Langue : Francais sauf indication contraire.
- Signature : Ne pas inclure de signature, l'utilisateur l'ajoutera lui-meme.`

// ─── Fallback prompt (if no business context configured) ───

const FALLBACK_SYSTEM_PROMPT = `Tu es l'assistant commercial IA de Louis chez Boost Inc.

## A propos de Boost Inc.
Boost Inc. est une entreprise specialisee dans la distribution automatique et les solutions de vending innovantes en France. Le produit phare est le ScreenKit — un ecran interactif pour machines de distribution automatique. Louis gere la prospection B2B sur le marche francais.

## Methode commerciale

Le process de prospection suit ces etapes :

1. **Ciblage** : Identification du prospect (entreprise, decision maker)
2. **Touch 1 (J0)** : Premier message de prise de contact (LinkedIn ou email). Court, personnalise, avec accroche sur le business du prospect.
3. **Touch 2 (J+3 a J+5)** : Relance si pas de reponse. Apporter de la valeur (cas client, stat, insight).
4. **Touch 3 (J+10)** : Dernier message. Direct, proposer un call ou donner une raison de repondre.
5. **Nurturing** : Si pas de reponse apres 3 touches → newsletter, contenu, rester visible.
6. **Repondu** : Le prospect a repondu → engager la conversation.
7. **Call decouverte** : Planifier et effectuer un appel pour comprendre les besoins.
8. **Devis** : Envoyer une proposition commerciale adaptee.
9. **Client** : Deal signe !

## Regles de redaction

- **Ton** : Professionnel mais humain. Pas de jargon commercial lourd.
- **Longueur** : Messages courts et percutants (5-8 lignes max pour un email).
- **Personnalisation** : Toujours mentionner l'entreprise du prospect et un element specifique a son activite.
- **CTA clair** : Chaque message doit avoir un appel a l'action simple (repondre, prendre un call, etc.)
- **Langue** : Francais sauf indication contraire.
- **Signature** : Ne pas inclure de signature, Louis l'ajoutera lui-meme.
${CAPABILITIES_BLOCK}`

// ─── Build knowledge base context ───

function buildKnowledgeContext(documents: KnowledgeDocument[]): string {
  const lines: string[] = [
    '## Base de connaissances',
    '',
    'Voici les documents et informations disponibles (Google Drive, Meeting Notes Genspark, LinkedIn). Utilise ces informations pour :',
    '- Repondre aux questions techniques des prospects',
    '- Personnaliser les messages avec des details produits',
    '- Citer des specifications, prix, avantages',
    '- Utiliser le contexte des reunions passees pour personnaliser les echanges',
    '- Exploiter les donnees LinkedIn pour mieux connaitre les prospects',
    '',
  ]

  // Limit total knowledge to ~30k chars to leave room for other context
  let totalChars = 0
  const maxTotal = 30000

  for (const doc of documents) {
    if (totalChars >= maxTotal) {
      lines.push(`\n... et ${documents.length - documents.indexOf(doc)} autres documents disponibles.`)
      break
    }

    const typeLabel = doc.mime_type?.includes('presentation') ? 'Presentation'
      : doc.mime_type?.includes('spreadsheet') ? 'Tableau'
      : doc.mime_type?.includes('pdf') ? 'PDF'
      : doc.mime_type?.includes('meeting') ? 'Notes de reunion'
      : doc.mime_type?.includes('linkedin') ? 'Profil LinkedIn'
      : 'Document'

    const folderInfo = doc.folder_path ? ` (${doc.folder_path})` : ''
    lines.push(`### ${doc.name} [${typeLabel}]${folderInfo}`)

    // Truncate individual doc if too long
    const maxPerDoc = Math.min(10000, maxTotal - totalChars)
    const content = doc.content.length > maxPerDoc
      ? doc.content.substring(0, maxPerDoc) + '\n[... tronque]'
      : doc.content

    lines.push(content)
    lines.push('')

    totalChars += content.length
  }

  return lines.join('\n')
}

// ─── Build prospect context block ───

function buildProspectContext(
  prospect: Prospect,
  activities: Activity[]
): string {
  const lines: string[] = ['## Contexte du prospect actuel']

  lines.push(`- **Nom** : ${prospect.prenom} ${prospect.nom}`)
  if (prospect.entreprise) lines.push(`- **Entreprise** : ${prospect.entreprise}`)
  if (prospect.fonction) lines.push(`- **Fonction** : ${prospect.fonction}`)
  if (prospect.localisation) lines.push(`- **Localisation** : ${prospect.localisation}`)
  if (prospect.pays) lines.push(`- **Pays** : ${prospect.pays}`)
  if (prospect.source) lines.push(`- **Source** : ${prospect.source}`)
  if (prospect.pipeline_stage) lines.push(`- **Stage pipeline** : ${prospect.pipeline_stage}`)
  if (prospect.categorie) lines.push(`- **Categorie** : ${prospect.categorie}`)
  if (prospect.statut_commercial) lines.push(`- **Statut commercial** : ${prospect.statut_commercial}`)
  if (prospect.email) lines.push(`- **Email** : ${prospect.email}`)
  if (prospect.email_pro) lines.push(`- **Email pro** : ${prospect.email_pro}`)
  if (prospect.linkedin_url) lines.push(`- **LinkedIn** : ${prospect.linkedin_url}`)

  if (prospect.date_premier_contact) {
    lines.push(`- **Premier contact** : ${prospect.date_premier_contact}`)
  }
  if (prospect.date_dernier_contact) {
    lines.push(`- **Dernier contact** : ${prospect.date_dernier_contact}`)
  }
  if (prospect.date_prochaine_action) {
    lines.push(`- **Prochaine action** : ${prospect.date_prochaine_action} (${prospect.type_prochaine_action || 'non defini'})`)
  }

  if (prospect.notes) {
    lines.push(`\n### Notes`)
    lines.push(prospect.notes)
  }

  if (activities.length > 0) {
    lines.push(`\n### Historique d'activites (${activities.length} entrees)`)
    // Show last 20 activities
    const recent = activities.slice(0, 20)
    for (const activity of recent) {
      const date = new Date(activity.created_at).toLocaleDateString('fr-FR')
      const typeLabel = activity.type === 'email_sent' ? 'Email envoye'
        : activity.type === 'email_received' ? 'Email recu'
        : activity.type === 'call' ? 'Appel'
        : activity.type === 'note' ? 'Note'
        : activity.type === 'transcription' ? 'Transcription'
        : activity.type === 'status_change' ? 'Changement de statut'
        : activity.type === 'linkedin_interaction' ? 'LinkedIn'
        : activity.type === 'meeting' ? 'Reunion'
        : activity.type === 'presentation' ? 'Presentation'
        : activity.type
      const content = activity.content.length > 200
        ? activity.content.substring(0, 200) + '...'
        : activity.content
      lines.push(`- **${date} — ${typeLabel}** : ${content}`)
    }
  }

  return lines.join('\n')
}

// ─── Quick action prompts ───

export const QUICK_ACTIONS = {
  touch1: (prospect: Prospect) =>
    `Redige un premier message de prise de contact (Touch 1) pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. C'est le tout premier message, il doit etre court, personnalise et donner envie de repondre. Format email avec objet.`,

  relance: (prospect: Prospect) =>
    `Redige une relance (Touch 2 ou 3) pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. Le prospect n'a pas repondu au premier message. Apporte de la valeur et donne une raison de repondre. Format email avec objet.`,

  nextAction: () =>
    `Analyse ce prospect et son historique. Quelle est la meilleure prochaine action a faire ? Donne une recommandation claire et actionnable.`,

  summary: () =>
    `Fais un resume concis de ce prospect : qui c'est, ou on en est dans le process, et les points cles de l'historique des echanges.`,

  followUp: (prospect: Prospect) =>
    `Redige un email de suivi pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''} suite a notre dernier echange. Reprends le contexte de la derniere activite.`,

  linkedinConnect: (prospect: Prospect) =>
    `Redige un message de demande de connexion LinkedIn pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. Court, personnalise, professionnel.`,

  linkedinMessage: (prospect: Prospect) =>
    `Redige un message LinkedIn (InMail ou message direct) pour ${prospect.prenom} ${prospect.nom}${prospect.entreprise ? ` de ${prospect.entreprise}` : ''}. Objectif : engager la conversation et proposer un echange.`,
} as const
