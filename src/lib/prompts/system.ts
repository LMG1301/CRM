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
  dealGroupMembers?: Prospect[]
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
    prompt += '\n\n' + buildPipelineSummary(allProspects)
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

export function buildKnowledgeContext(documents: KnowledgeDocument[]): string {
  const lines: string[] = [
    '## Base de connaissances',
    '',
    'Voici les documents disponibles. Utilise ces informations pour :',
    '- Repondre aux questions techniques des prospects',
    '- Personnaliser les messages avec des details produits',
    '- Citer des specifications, prix, avantages',
    '',
  ]

  let totalChars = 0
  const maxTotal = 80000
  const maxPerDoc = 12000

  for (const doc of documents) {
    if (totalChars >= maxTotal) {
      lines.push(`\n... et ${documents.length - documents.indexOf(doc)} autres documents disponibles.`)
      break
    }

    const typeLabel = getDocTypeLabel(doc.mime_type)
    const folderInfo = doc.folder_path ? ` (${doc.folder_path})` : ''
    lines.push(`### ${doc.name} [${typeLabel}]${folderInfo}`)

    const budget = Math.min(maxPerDoc, maxTotal - totalChars)
    const content = (doc.content || '').length > budget
      ? doc.content.substring(0, budget) + '\n[... tronque]'
      : doc.content

    lines.push(content)
    lines.push('')

    totalChars += content.length
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
  const recentEmails = emails.slice(0, 5)

  const lines: string[] = [
    `## Emails echanges avec ce prospect (${recentEmails.length} derniers sur ${emails.length} total)`,
    '',
    'Voici le contenu complet des derniers emails. Utilise ces informations pour repondre de maniere pertinente, personnaliser tes messages, et comprendre le contexte des echanges.',
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

    if (body.length > 2000) {
      body = body.substring(0, 2000) + '\n[... email tronque]'
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
    lines.push(`\n### Historique d'activites (${activities.length} entrees)`)
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
      const isEmail = activity.type === 'email_sent' || activity.type === 'email_received'
      const fullTranscript = activity.type === 'transcription' && activity.metadata?.full_transcript
        ? String(activity.metadata.full_transcript)
        : null
      const rawContent = fullTranscript || activity.content
      const maxLen = isEmail || fullTranscript ? 5000 : 500
      const content = rawContent.length > maxLen
        ? rawContent.substring(0, maxLen) + '...'
        : rawContent
      lines.push(`- **${date} — ${typeLabel}** : ${content}`)
    }
  }

  return lines.join('\n')
}

// ─── Build pipeline summary (when no specific prospect selected) ───

export function buildPipelineSummary(prospects: ProspectSummary[]): string {
  const lines: string[] = [
    '## Pipeline commercial complet',
    '',
    `Tu as acces a **${prospects.length} prospects actifs** dans le CRM. Voici le resume complet :`,
    '',
  ]

  const byStage: Record<string, ProspectSummary[]> = {}
  for (const p of prospects) {
    const stage = p.pipeline_stage || 'inconnu'
    if (!byStage[stage]) byStage[stage] = []
    byStage[stage].push(p)
  }

  lines.push('### Repartition par stage')
  const stageOrder = [
    'ciblage', 'touch_1', 'repondu', 'devis',
    'onboarding', 'client', 'a_recontacter', 'refuse',
  ]
  for (const stage of stageOrder) {
    if (byStage[stage]) {
      lines.push(`- **${stage.replace(/_/g, ' ')}** : ${byStage[stage].length} prospects`)
    }
  }
  for (const [stage, list] of Object.entries(byStage)) {
    if (!stageOrder.includes(stage)) {
      lines.push(`- **${stage}** : ${list.length} prospects`)
    }
  }

  const byCompany: Record<string, ProspectSummary[]> = {}
  for (const p of prospects) {
    if (p.entreprise) {
      const key = p.entreprise.trim().toLowerCase()
      if (!byCompany[key]) byCompany[key] = []
      byCompany[key].push(p)
    }
  }
  const multiContactCompanies = Object.entries(byCompany)
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length)

  if (multiContactCompanies.length > 0) {
    lines.push('')
    lines.push('### Entreprises avec plusieurs contacts')
    for (const [, list] of multiContactCompanies) {
      const companyName = list[0].entreprise
      const stages = [...new Set(list.map(p => p.pipeline_stage))].join(', ')
      lines.push(`- **${companyName}** : ${list.length} contacts (stages: ${stages})`)
    }
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
    lines.push('')
    lines.push('### Groupes de deal actifs')
    for (const [groupName, members] of activeDealGroups) {
      const memberNames = members.map(m => {
        const name = [m.prenom, m.nom].filter(Boolean).join(' ')
        return `${name} (${m.entreprise || '?'}, ${m.pipeline_stage})`
      }).join(', ')
      lines.push(`- **${groupName}** : ${members.length} contacts — ${memberNames}`)
    }
  }

  const today = toLocalDateString(new Date())
  const actionsDue = prospects.filter(
    p => p.date_prochaine_action && p.date_prochaine_action <= today
  )
  if (actionsDue.length > 0) {
    lines.push('')
    lines.push(`### Actions en retard ou du jour (${actionsDue.length})`)
    for (const p of actionsDue.slice(0, 20)) {
      const name = [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'
      lines.push(
        `- **${name}** (${p.entreprise || '?'}) — ${p.pipeline_stage} — action: ${p.type_prochaine_action || '?'} prevue le ${p.date_prochaine_action}`
      )
    }
  }

  lines.push('')
  lines.push('### Liste complete des prospects')
  lines.push('')
  for (const p of prospects) {
    const name = [p.prenom, p.nom].filter(Boolean).join(' ') || 'Sans nom'
    const parts = [name]
    if (p.entreprise) parts.push(p.entreprise)
    parts.push(`[${p.pipeline_stage}]`)
    if (p.categorie) parts.push(`cat:${p.categorie}`)
    if (p.date_dernier_contact) parts.push(`dernier:${p.date_dernier_contact}`)
    if (p.date_prochaine_action) parts.push(`action:${p.date_prochaine_action}`)
    lines.push(`- ${parts.join(' | ')}`)
  }

  return lines.join('\n')
}
