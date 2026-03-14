import type { Prospect, Activity, BusinessContext, Email } from '../types'
import { toLocalDateString } from '../utils'

// ─── Knowledge document type ───

export interface KnowledgeDocument {
  id: string
  name: string
  content: string
  folder_path: string | null
  mime_type: string | null
  summary: string | null
}

// ─── Prospect summary (for general pipeline questions) ───

export interface ProspectSummary {
  id: string
  prenom: string
  nom: string
  entreprise: string
  fonction: string
  pipeline_stage: string
  categorie: string
  statut_commercial: string
  source: string
  date_dernier_contact: string | null
  date_prochaine_action: string | null
  type_prochaine_action: string
  date_premier_contact: string | null
  deal_group: string | null
}

// ─── Build system prompt with prospect context ───

export function buildSystemPrompt(
  prospect?: Prospect | null,
  activities?: Activity[],
  businessContext?: BusinessContext | null,
  knowledgeDocuments?: KnowledgeDocument[],
  allProspects?: ProspectSummary[],
  emails?: Email[],
  dealGroupMembers?: Prospect[],
  stageOrder?: string[]
): string {
  let prompt = buildBasePrompt(businessContext)

  if (knowledgeDocuments && knowledgeDocuments.length > 0) {
    prompt += '\n\n' + buildKnowledgeContext(knowledgeDocuments)
  }

  if (prospect) {
    prompt += '\n\n' + buildProspectContext(prospect, activities || [], dealGroupMembers)
  }

  if (emails && emails.length > 0) {
    prompt += '\n\n' + buildEmailContext(emails)
  }

  if (!prospect && allProspects && allProspects.length > 0) {
    prompt += '\n\n' + buildPipelineSummary(allProspects, stageOrder)
  }

  return prompt
}

// ─── Build base prompt from business context ───

function buildBasePrompt(ctx?: BusinessContext | null): string {
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

  // NOTE: email_templates and linkedin_templates removed from system prompt to save tokens.
  // The quick action buttons already provide these templates when needed.

  if (ctx.additional_context) {
    sections.push(`\n## Contexte additionnel`)
    sections.push(ctx.additional_context)
  }

  sections.push(CAPABILITIES_BLOCK)

  return sections.join('\n')
}

// ─── Capabilities (always included) ───

const CAPABILITIES_BLOCK = `
## Format de reponse
- Emails : commence par "Objet :" puis le corps. Pas de signature.
- LinkedIn : commence directement par le message.
- Langue : Francais. Markdown pour la mise en forme.

## Regles de style obligatoires
- Formule de politesse : utilise "Bonne journee", JAMAIS "Belle journee".
- Autres formules acceptees : "Bien a vous", "Cordialement", "A bientot".
- Ne commence JAMAIS un email par "J'espere que vous allez bien" ou "J'espere que tout va bien".`

// ─── Fallback prompt (if no business context configured) ───

const FALLBACK_SYSTEM_PROMPT = `Tu es l'assistant commercial IA de Louis chez Boost Inc.
Boost Inc. = distribution automatique innovante en France. Produit phare : ScreenKit (ecran interactif pour DA).

## Methode
Touch 1 (J0) → Touch 2 (J+3-5, valeur ajoutee) → Touch 3 (J+10, proposer call) → Nurturing → Call decouverte → Devis → Client.

## Regles
Ton pro mais humain. Messages courts (5-8 lignes). Personnalise au prospect. CTA clair.
${CAPABILITIES_BLOCK}`

// ─── Build knowledge base context (INDEX MODE — lightweight) ───

export function buildKnowledgeContext(documents: KnowledgeDocument[]): string {
  const lines: string[] = [
    '## Base de connaissances (index)',
    '',
    'Voici l\'index des documents disponibles. Tu as un outil read_document() pour charger le contenu complet de n\'importe quel document. Utilise-le systematiquement quand tu as besoin du contenu. Ne dis JAMAIS que tu n\'as pas acces au contenu ou que tu as seulement le resume — charge le document avec read_document().',
    '',
  ]

  for (const doc of documents) {
    const typeLabel = getDocTypeLabel(doc.mime_type)
    let summary = doc.summary || doc.content?.substring(0, 80)?.replace(/\n/g, ' ') || ''
    // Truncate summary to 80 chars to keep prompt compact
    if (summary.length > 80) {
      summary = summary.substring(0, 80).trimEnd() + '...'
    }
    lines.push(`- **${doc.name}** [${typeLabel}]: ${summary}`)
  }

  return lines.join('\n')
}

function getDocTypeLabel(mimeType: string | null): string {
  if (!mimeType) return 'Document'
  if (mimeType.includes('presentation')) return 'Presentation'
  if (mimeType.includes('spreadsheet') || mimeType.includes('csv')) return 'Tableau'
  if (mimeType.includes('pdf')) return 'PDF'
  if (mimeType.includes('markdown')) return 'Markdown'
  if (mimeType.includes('json')) return 'JSON'
  if (mimeType.includes('meeting')) return 'Notes de reunion'
  if (mimeType.includes('linkedin')) return 'Profil LinkedIn'
  return 'Document'
}

// ─── Build email context block ───

function buildEmailContext(emails: Email[]): string {
  const recentEmails = emails.slice(0, 3)

  const lines: string[] = [
    `## Emails recents (${recentEmails.length} derniers sur ${emails.length} total)`,
    '',
  ]

  for (const email of recentEmails) {
    const date = new Date(email.gmail_date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    const direction = email.direction === 'sent' ? 'ENVOYE' : 'RECU'

    lines.push('---')
    lines.push(`**${direction}** | De: ${email.from_email} | A: ${email.to_email}`)
    lines.push(`Date: ${date}`)
    lines.push(`Objet: ${email.subject || '(Sans objet)'}`)
    lines.push('')

    let body = email.body_text || ''
    if (!body && email.body_html) {
      body = email.body_html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    }

    body = cleanEmailBody(body)

    if (body.length > 1000) {
      body = body.substring(0, 1000) + '\n[... email tronque]'
    }

    lines.push(body || '(Contenu vide)')
    lines.push('')
  }

  return lines.join('\n')
}

function cleanEmailBody(body: string): string {
  if (!body) return body

  const replyPatterns = [
    /Le \d{1,2}\/\d{1,2}\/\d{4}.*a ecrit\s*:/i,
    /Le \d{1,2} \w+ \d{4}.*a ecrit\s*:/i,
    /On \w{3}, \w{3} \d{1,2}, \d{4}.*wrote:/i,
    /From:.*\nSent:.*\nTo:.*\nSubject:.*/i,
    /---------- Forwarded message ----------/i,
    /De :.*\nEnvoyé :.*\nÀ :.*\nObjet :.*/i,
  ]

  for (const pattern of replyPatterns) {
    const match = body.search(pattern)
    if (match > 50) {
      body = body.substring(0, match).trim()
      break
    }
  }

  const disclaimerPatterns = [
    /Ce message[\s\S]*confidentiel[\s\S]*destinataire/i,
    /This email[\s\S]*confidential[\s\S]*intended recipient/i,
    /AVERTISSEMENT[\s\S]*Ce courriel/i,
    /DISCLAIMER/i,
  ]

  for (const pattern of disclaimerPatterns) {
    const match = body.search(pattern)
    if (match > 50) {
      body = body.substring(0, match).trim()
    }
  }

  return body.trim()
}

// ─── Build prospect context block ───

function buildProspectContext(
  prospect: Prospect,
  activities: Activity[],
  dealGroupMembers?: Prospect[]
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
  if (prospect.deal_group) lines.push(`- **Groupe de deal** : ${prospect.deal_group}`)
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

  if (dealGroupMembers && dealGroupMembers.length > 0 && prospect.deal_group) {
    lines.push(`\n### Groupe de deal "${prospect.deal_group}" — ${dealGroupMembers.length + 1} contacts`)
    lines.push('Autres contacts lies a cette opportunite :')
    for (const m of dealGroupMembers) {
      const name = [m.prenom, m.nom].filter(Boolean).join(' ') || 'Sans nom'
      const parts = [name]
      if (m.entreprise) parts.push(m.entreprise)
      if (m.fonction) parts.push(m.fonction)
      parts.push(`[${m.pipeline_stage}]`)
      if (m.date_dernier_contact) parts.push(`dernier contact: ${m.date_dernier_contact}`)
      lines.push(`- ${parts.join(' | ')}`)
    }
  }

  if (activities.length > 0) {
    lines.push(`\n### Historique d'activites (${Math.min(10, activities.length)} recentes sur ${activities.length})`)
    const recent = activities.slice(0, 10)
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
      const rawContent = activity.content || ''
      const maxLen = 300
      const content = rawContent.length > maxLen
        ? rawContent.substring(0, maxLen) + '...'
        : rawContent
      lines.push(`- **${date} — ${typeLabel}** : ${content}`)
    }
  }

  return lines.join('\n')
}

// ─── Build pipeline summary (compact — when no specific prospect selected) ───

export function buildPipelineSummary(prospects: ProspectSummary[], stageOrder?: string[]): string {
  const lines: string[] = [
    '## Pipeline commercial (resume)',
    '',
  ]

  // Counts by stage
  const byStage: Record<string, ProspectSummary[]> = {}
  for (const p of prospects) {
    const stage = p.pipeline_stage || 'inconnu'
    if (!byStage[stage]) byStage[stage] = []
    byStage[stage].push(p)
  }

  const order = stageOrder || [...new Set(prospects.map(p => p.pipeline_stage))]
  const stageCounts = order
    .filter(s => byStage[s])
    .map(s => `${byStage[s].length} ${s.replace(/_/g, ' ')}`)
    .join(', ')

  lines.push(`Pipeline (${prospects.length} total): ${stageCounts}`)
  lines.push('')

  // Hot deals: devis + onboarding + repondu (the ones that matter most)
  const hotStages = ['devis', 'onboarding', 'repondu']
  const hotDeals = prospects.filter(p => hotStages.includes(p.pipeline_stage))
  if (hotDeals.length > 0) {
    lines.push('### Deals chauds')
    for (const p of hotDeals) {
      const name = [p.prenom, p.nom].filter(Boolean).join(' ')
      lines.push(`- ${name} (${p.entreprise || '?'} / ${p.pipeline_stage})${p.date_dernier_contact ? ` — dernier contact: ${p.date_dernier_contact}` : ''}`)
    }
    lines.push('')
  }

  // Deal groups
  const dealGroupMap: Record<string, ProspectSummary[]> = {}
  for (const p of prospects) {
    if (p.deal_group) {
      if (!dealGroupMap[p.deal_group]) dealGroupMap[p.deal_group] = []
      dealGroupMap[p.deal_group].push(p)
    }
  }
  const activeDealGroups = Object.entries(dealGroupMap).filter(([, list]) => list.length > 1)
  if (activeDealGroups.length > 0) {
    lines.push('### Groupes de deal')
    for (const [groupName, members] of activeDealGroups) {
      const memberNames = members.map(m => `${m.prenom} ${m.nom} (${m.pipeline_stage})`).join(', ')
      lines.push(`- **${groupName}**: ${memberNames}`)
    }
    lines.push('')
  }

  // Overdue actions
  const today = toLocalDateString(new Date())
  const actionsDue = prospects.filter(
    p => p.date_prochaine_action && p.date_prochaine_action <= today
  )
  if (actionsDue.length > 0) {
    lines.push(`### Actions en retard (${actionsDue.length})`)
    for (const p of actionsDue.slice(0, 10)) {
      const name = [p.prenom, p.nom].filter(Boolean).join(' ')
      lines.push(`- ${name} (${p.entreprise || '?'}) — ${p.type_prochaine_action || '?'}`)
    }
  }

  // NOTE: Full prospect list removed to keep prompt compact.
  // The AI can ask for details about a specific prospect if needed.

  return lines.join('\n')
}
