import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toLocalDateString } from '@/lib/utils'

/**
 * Webhook endpoint for Gmail sync — replaces n8n workflows.
 * Receives emails from Google Apps Script and:
 * 1. Upserts emails into the emails table
 * 2. Auto-creates prospects for unknown senders
 * 3. Creates activity entries
 * 4. Triggers AI pipeline detection
 *
 * Auth: Simple secret token in headers
 */

// All emails belonging to the user (business + personal + aliases)
const MY_EMAILS = [
  'louis.matar@boostinc.com',
  'louis.matar.gueye@gmail.com',
]

function isMyEmail(email: string): boolean {
  const lower = email.toLowerCase().trim()
  return MY_EMAILS.some(me => lower === me.toLowerCase())
}

// Colleagues — never create prospects for these
const COLLEAGUE_DOMAINS = [
  'boostinc.com',
]

// Automated/noreply/spam domains — skip entirely
const BLACKLISTED_DOMAINS = [
  'hubspot.com', 'notifications.hubspot.com', 'info.n8n.io', 'transactional.n8n.io',
  'google.com', 'docs.google.com', 'revolut.com', 'paypal.com', 'communications.paypal.com',
  'clay.com', 'fleet.co', 'mg.fleet.co', 'vendlive.com', 'mailmoo.io',
  'mailinblack.com', 'invitations.mailinblack.com',
]

// Noreply-like prefixes — skip
const NOREPLY_PREFIXES = [
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
  'notifications', 'updates', 'marketing', 'hello', 'info', 'news',
  'support', 'sales', 'onboarding', 'success', 'comments-noreply',
  'gemini-notes', 'cloudplatform-noreply', 'weeklyupdates', 'ukimarketing',
]

/**
 * Check if an email should be skipped (not a real commercial contact)
 */
function shouldSkipEmail(contactEmail: string): boolean {
  const lower = contactEmail.toLowerCase().trim()
  const [localPart, domain] = lower.split('@')

  // Skip if contact is also me
  if (isMyEmail(contactEmail)) return true

  // Skip colleague emails
  if (COLLEAGUE_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true

  // Skip blacklisted domains
  if (BLACKLISTED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true

  // Skip noreply prefixes
  if (NOREPLY_PREFIXES.some(p => localPart === p || localPart.startsWith(p + '+'))) return true

  // Skip BCC tracking emails (e.g. 8061577@bcc.hubspot.com)
  if (domain.includes('bcc.') || /^\d+@/.test(lower)) return true

  return false
}

/**
 * Check if email looks like a real commercial exchange (not a newsletter/pub)
 * Only auto-creates prospects if this returns true
 */
function isLikelyCommercialExchange(email: IncomingEmail): boolean {
  const text = [email.subject, email.body_preview, email.from_name].filter(Boolean).join(' ').toLowerCase()

  // Check for French content indicators
  const frenchIndicators = [
    'bonjour', 'bonsoir', 'cordialement', 'merci', 'salut', 'cher', 'chère',
    'madame', 'monsieur', 'je vous', 'nous vous', 'veuillez', 'suite à',
    'concernant', 'objet', 'rdv', 'rendez-vous', 'réunion', 'proposition',
    'devis', 'commande', 'livraison', 'facture', 'contrat', 'offre',
    'collaboration', 'partenariat', 'distribu', 'automatique', 'café',
    'machine', 'frigo', 'distributeur', 're:', 'tr:', 'fwd:',
  ]

  const hasFrenchContent = frenchIndicators.some(ind => text.includes(ind))

  // Check for French TLD
  const contactDomain = email.from_email.split('@')[1]?.toLowerCase() || ''
  const isFrenchDomain = contactDomain.endsWith('.fr') || contactDomain.endsWith('.lu') ||
    contactDomain.endsWith('.be') || contactDomain.endsWith('.mc')

  return hasFrenchContent || isFrenchDomain
}

interface IncomingEmail {
  gmail_message_id: string
  gmail_thread_id?: string
  subject?: string
  from_email: string
  from_name?: string
  to_email: string
  body_preview?: string
  body_html?: string
  body_text?: string
  labels?: string[]
  is_read?: boolean
  gmail_date: string
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const secret = request.headers.get('x-webhook-secret')
    if (secret !== process.env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const emails: IncomingEmail[] = Array.isArray(body) ? body : [body]

    if (emails.length === 0) {
      return Response.json({ message: 'No emails to process' })
    }

    const results = {
      processed: 0,
      prospects_created: 0,
      activities_created: 0,
      errors: [] as string[],
    }

    const skipped: string[] = []

    for (const email of emails) {
      try {
        // Determine direction — check all user emails
        const direction = isMyEmail(email.from_email) ? 'sent' : 'received'
        const contactEmail = direction === 'sent' ? email.to_email : email.from_email
        const contactName = direction === 'received' ? email.from_name : undefined

        // *** FILTER: Skip junk, colleagues, noreply, etc. ***
        if (shouldSkipEmail(contactEmail)) {
          skipped.push(contactEmail)
          continue
        }

        // 1. Upsert email (always store, even if no prospect match)
        const { error: emailError } = await supabase
          .from('emails')
          .upsert(
            {
              id: crypto.randomUUID(),
              gmail_message_id: email.gmail_message_id,
              gmail_thread_id: email.gmail_thread_id || null,
              subject: email.subject || null,
              from_email: email.from_email,
              to_email: email.to_email,
              body_preview: email.body_preview || null,
              body_html: email.body_html || null,
              body_text: email.body_text || null,
              direction,
              labels: email.labels || [],
              is_read: email.is_read ?? true,
              gmail_date: email.gmail_date,
            },
            { onConflict: 'gmail_message_id' }
          )

        if (emailError) {
          results.errors.push(`Email upsert: ${emailError.message}`)
          continue
        }

        // 2. Find or create prospect
        let prospectId: string | null = null

        // Search by email (both email and email_pro fields)
        const { data: existingProspects } = await supabase
          .from('prospects')
          .select('id')
          .or(`email.ilike.${contactEmail},email_pro.ilike.${contactEmail}`)
          .limit(1)

        if (existingProspects && existingProspects.length > 0) {
          prospectId = existingProspects[0].id
        } else if (direction === 'received' && isLikelyCommercialExchange(email)) {
          // Only auto-create prospect if it looks like a real French commercial exchange
          const nameParts = parseEmailName(contactName, contactEmail)
          const { data: newProspect, error: prospectError } = await supabase
            .from('prospects')
            .insert({
              prenom: nameParts.prenom,
              nom: nameParts.nom,
              email: contactEmail,
              source: 'Email entrant',
              pipeline_stage: 'ciblage',
              date_premier_contact: toLocalDateString(new Date()),
              date_dernier_contact: toLocalDateString(new Date()),
            })
            .select('id')
            .single()

          if (!prospectError && newProspect) {
            prospectId = newProspect.id
            results.prospects_created++
          }
        }

        // 3. Link email to prospect
        if (prospectId) {
          await supabase
            .from('emails')
            .update({ prospect_id: prospectId })
            .eq('gmail_message_id', email.gmail_message_id)

          // 4. Create activity with FULL email content (for AI context)
          const activityType = direction === 'sent' ? 'email_sent' : 'email_received'
          const subject = email.subject || '(Sans objet)'
          // Use full body_text for complete context, fallback to preview
          const body = email.body_text || email.body_preview || ''
          const content = body
            ? `Objet : ${subject}\n\n${body}`
            : `Objet : ${subject}`

          const { error: activityError } = await supabase
            .from('activities')
            .insert({
              prospect_id: prospectId,
              type: activityType,
              content,
              metadata: {
                gmail_message_id: email.gmail_message_id,
                subject: email.subject,
                from: email.from_email,
                to: email.to_email,
                source: 'gmail_sync',
              },
            })

          if (!activityError) results.activities_created++

          // 5. Update date_dernier_contact
          await supabase
            .from('prospects')
            .update({
              date_dernier_contact: toLocalDateString(new Date(email.gmail_date)),
            })
            .eq('id', prospectId)

          // DISABLED — pipeline_stage is now ONLY changed by user action (drag & drop or stage selector)
          // Previously called autoProgressStage(prospectId, email, direction)
        }

        results.processed++
      } catch (err) {
        results.errors.push(`Processing error: ${(err as Error).message}`)
      }
    }

    // DISABLED — AI pipeline auto-analysis removed. pipeline_stage only changes via user action.
    // Previously triggered triggerPipelineAnalysis() for new prospects

    return Response.json({ ...results, skipped: skipped.length })
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

// Parse name from email "From" header
function parseEmailName(
  name: string | undefined,
  email: string
): { prenom: string; nom: string } {
  if (name) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return { prenom: parts[0], nom: parts.slice(1).join(' ') }
    }
    return { prenom: name.trim(), nom: '' }
  }
  // Extract from email address
  const local = email.split('@')[0]
  const parts = local.split(/[._-]/)
  if (parts.length >= 2) {
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    return { prenom: capitalize(parts[0]), nom: capitalize(parts[1]) }
  }
  return { prenom: local, nom: '' }
}

// DISABLED — autoProgressStage and triggerPipelineAnalysis removed.
// pipeline_stage is now ONLY changed by user action (drag & drop or stage selector).
