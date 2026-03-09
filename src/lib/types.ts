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
  site_web: string
  pays: string
  source: string
  pipeline_stage: string
  statut_commercial: string
  categorie: string
  date_premier_contact: string | null
  date_dernier_contact: string | null
  date_prochaine_action: string | null
  type_prochaine_action: string
  description_prochaine_action: string | null
  deal_group: string | null
  notes: string
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  prospect_id: string
  type: ActivityType
  content: string
  metadata: Record<string, unknown>
  created_at: string
}

export type ActivityType =
  | 'note'
  | 'call'
  | 'email_sent'
  | 'email_received'
  | 'status_change'
  | 'transcription'
  | 'linkedin_interaction'
  | 'presentation'
  | 'meeting'

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  note: 'Note',
  call: 'Appel',
  email_sent: 'Email envoye',
  email_received: 'Email recu',
  status_change: 'Changement de statut',
  transcription: 'Transcription',
  linkedin_interaction: 'LinkedIn',
  presentation: 'Presentation',
  meeting: 'Reunion',
}

export const ACTIVITY_ICONS: Record<ActivityType, string> = {
  note: '📝',
  call: '📞',
  email_sent: '📤',
  email_received: '📥',
  status_change: '🔄',
  transcription: '🎙️',
  linkedin_interaction: '💼',
  presentation: '📊',
  meeting: '🤝',
}

// ─── Email (synced from Gmail via n8n) ───

export interface Email {
  id: string
  prospect_id: string | null
  gmail_message_id: string
  gmail_thread_id: string | null
  subject: string | null
  from_email: string
  to_email: string
  body_preview: string | null
  body_html: string | null
  body_text: string | null
  direction: 'sent' | 'received'
  labels: string[]
  is_read: boolean
  gmail_date: string
  created_at: string
}

// ─── Integration (connected services) ───

export type IntegrationService = 'gmail' | 'linkedin' | 'n8n' | 'transcription'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error'

export interface Integration {
  id: string
  service: IntegrationService
  status: IntegrationStatus
  config: Record<string, unknown>
  last_sync: string | null
  sync_count: number
  error_message: string | null
  created_at: string
  updated_at: string
}

export const INTEGRATION_LABELS: Record<IntegrationService, string> = {
  gmail: 'Gmail',
  linkedin: 'LinkedIn',
  n8n: 'n8n Automations',
  transcription: 'Transcriptions',
}

export const INTEGRATION_ICONS: Record<IntegrationService, string> = {
  gmail: '✉️',
  linkedin: '💼',
  n8n: '⚡',
  transcription: '🎙️',
}

// ─── Business Context (for AI assistant) ───

export interface BusinessContext {
  id: string
  company_name: string
  company_description: string
  products: string
  sales_methodology: string
  tone_and_style: string
  email_templates: string
  linkedin_templates: string
  additional_context: string
  email_signature?: string
  created_at: string
  updated_at: string
}

// ─── Content Library ───

export type ContentType = 'post_linkedin' | 'article' | 'case_study' | 'video' | 'infographie' | 'temoignage'

export type FunnelLevel = 'tofu' | 'mofu' | 'bofu'

export const FUNNEL_LEVELS: Record<FunnelLevel, string> = {
  tofu: 'Top of Funnel',
  mofu: 'Middle of Funnel',
  bofu: 'Bottom of Funnel',
}

export interface Content {
  id: string
  title: string
  content_type: ContentType
  url: string | null
  body: string | null
  themes: string[]
  products: string[]
  pipeline_stages: string[]
  target_sectors: string[]
  funnel_level: FunnelLevel | null
  created_at: string
  updated_at: string
}

export interface ContentSuggestion {
  content: Content
  relevance_score: number
  reason: string
}

export const CONTENT_TYPES: Record<ContentType, string> = {
  post_linkedin: 'Post LinkedIn',
  article: 'Article',
  case_study: 'Case Study',
  video: 'Video',
  infographie: 'Infographie',
  temoignage: 'Temoignage',
}

export const CONTENT_THEMES = [
  'distribution_automatique',
  'retail_connecte',
  'micro_market',
  'technologie_iot',
  'paiement_sans_contact',
  'telemetrie',
  'gestion_stocks',
  'roi_vending',
  'developpement_durable',
  'innovation',
  'cas_client',
  'tendances_marche',
] as const

export const CONTENT_PRODUCTS = [
  'boost_telemetry',
  'boost_payment',
  'boost_analytics',
  'boost_stock',
  'boost_platform',
] as const

// ─── Tasks (follow-up reminders) ───

export interface Task {
  id: string
  prospect_id: string
  title: string
  description?: string
  due_date: string
  status: 'pending' | 'done' | 'skipped'
  type: string
  related_activity_id?: string
  created_at: string
  completed_at?: string
  prospect?: { prenom: string; nom: string; entreprise?: string }
}

// ─── Email Templates ───

export interface EmailTemplate {
  id: string
  name: string
  subject: string
  body_html: string
  category: string
  variables: string[]
  is_active: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

// ─── Email Sequences ───

export interface SequenceStep {
  position: number
  delay_days: number
  prompt_hint: string
  subject_hint?: string
}

export interface Sequence {
  id: string
  name: string
  description: string
  steps: SequenceStep[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface SequenceEnrollment {
  id: string
  sequence_id: string
  prospect_id: string
  status: 'active' | 'completed' | 'stopped_reply' | 'stopped_manual' | 'paused'
  current_step: number
  next_step_date: string | null
  pending_email: {
    subject: string
    body_html: string
    body_text: string
    generated_at: string
    step_position: number
  } | null
  send_mode: 'semi_auto' | 'auto'
  enrolled_at: string
  completed_at: string | null
  stopped_at: string | null
  stopped_reason: string | null
  created_at: string
  updated_at: string
  sequence?: Sequence
  prospect?: Prospect
}

// ─── Source colors for activity feed ───

export const SOURCE_COLORS: Record<string, string> = {
  gmail: '#EA4335',
  linkedin: '#0A66C2',
  n8n: '#FF6D5A',
  transcription: '#8B5CF6',
  manual: '#6B7280',
}
