export interface PipelineStage {
  id: string
  name: string
  slug: string
  position: number
  color: string
  is_terminal: boolean
  created_at: string
}

export interface Prospect {
  id: string
  prenom: string
  nom: string
  entreprise: string
  fonction: string
  email: string
  email_pro: string
  telephone: string
  localisation: string
  linkedin_url: string
  pays: string
  source: string
  pipeline_stage: string
  statut_commercial: string
  categorie: string
  date_premier_contact: string | null
  date_dernier_contact: string | null
  date_prochaine_action: string | null
  type_prochaine_action: string
  notes: string
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  prospect_id: string
  type: 'note' | 'call' | 'email_sent' | 'email_received' | 'status_change' | 'transcription'
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export type ActivityType = Activity['type']

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note: 'Note',
  call: 'Appel',
  email_sent: 'Email envoyé',
  email_received: 'Email reçu',
  status_change: 'Changement de statut',
  transcription: 'Transcription',
}

export const ACTIVITY_ICONS: Record<ActivityType, string> = {
  note: '📝',
  call: '📞',
  email_sent: '📤',
  email_received: '📥',
  status_change: '🔄',
  transcription: '🎙️',
}
