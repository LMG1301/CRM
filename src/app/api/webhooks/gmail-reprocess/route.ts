import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Re-process existing emails in the database:
 * 1. Fix direction (sent vs received) using multi-email detection
 * 2. Link unlinked emails to existing prospects (NO auto-creation)
 * 3. Create missing activities for linked emails
 *
 * This endpoint does NOT create new prospects.
 * Prospects should be manually added or come from commercial exchanges only.
 */

const MY_EMAILS = [
  'louis.matar@boostinc.com',
  'louis.matar.gueye@gmail.com',
]

const COLLEAGUE_DOMAINS = ['boostinc.com']

function isMyEmail(email: string): boolean {
  const lower = email.toLowerCase().trim()
  return MY_EMAILS.some(me => lower === me.toLowerCase())
}

function isColleague(email: string): boolean {
  const domain = email.toLowerCase().split('@')[1] || ''
  return COLLEAGUE_DOMAINS.some(d => domain === d)
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get('x-webhook-secret')
    if (secret !== process.env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = {
      emails_checked: 0,
      direction_fixed: 0,
      prospects_linked: 0,
      activities_created: 0,
      stages_updated: 0,
      skipped: 0,
      errors: [] as string[],
    }

    // Track all prospect IDs that have linked emails for auto-progression
    const prospectIdsWithEmails = new Set<string>()

    // Get all emails
    const { data: emails, error } = await supabase
      .from('emails')
      .select('*')
      .order('gmail_date', { ascending: true })

    if (error || !emails) {
      return Response.json({ error: error?.message || 'No emails' }, { status: 500 })
    }

    results.emails_checked = emails.length

    for (const email of emails) {
      try {
        // Fix direction
        const correctDirection = isMyEmail(email.from_email) ? 'sent' : 'received'

        if (email.direction !== correctDirection) {
          await supabase
            .from('emails')
            .update({ direction: correctDirection })
            .eq('id', email.id)
          results.direction_fixed++
        }

        const contactEmail = correctDirection === 'sent' ? email.to_email : email.from_email

        // Skip self-emails and colleagues
        if (isMyEmail(contactEmail) || isColleague(contactEmail)) {
          results.skipped++
          continue
        }

        // Only link to EXISTING prospects — no auto-creation
        let prospectId = email.prospect_id

        if (!prospectId) {
          const { data: existing } = await supabase
            .from('prospects')
            .select('id')
            .or(`email.ilike.${contactEmail},email_pro.ilike.${contactEmail}`)
            .limit(1)

          if (existing && existing.length > 0) {
            prospectId = existing[0].id
            await supabase
              .from('emails')
              .update({ prospect_id: prospectId })
              .eq('id', email.id)
            results.prospects_linked++
          }
        }

        // Create activity if prospect linked and no activity exists
        if (prospectId) {
          const { data: existingActivity } = await supabase
            .from('activities')
            .select('id')
            .eq('prospect_id', prospectId)
            .contains('metadata', { gmail_message_id: email.gmail_message_id })
            .limit(1)

          if (!existingActivity || existingActivity.length === 0) {
            const actType = correctDirection === 'sent' ? 'email_sent' : 'email_received'
            const subject = email.subject || '(Sans objet)'
            const body = email.body_text || email.body_preview || ''
            const content = body
              ? `Objet : ${subject}\n\n${body}`
              : `Objet : ${subject}`

            const { error: aErr } = await supabase
              .from('activities')
              .insert({
                prospect_id: prospectId,
                type: actType,
                content,
                metadata: {
                  gmail_message_id: email.gmail_message_id,
                  subject: email.subject,
                  from: email.from_email,
                  to: email.to_email,
                  source: 'gmail_reprocess',
                },
              })

            if (!aErr) results.activities_created++
          }

          // Update date_dernier_contact (only if newer)
          await supabase
            .from('prospects')
            .update({
              date_dernier_contact: new Date(email.gmail_date).toISOString().split('T')[0],
            })
            .eq('id', prospectId)
            .lt('date_dernier_contact', new Date(email.gmail_date).toISOString().split('T')[0])

          prospectIdsWithEmails.add(prospectId)
        }
      } catch (err) {
        results.errors.push(`Email ${email.gmail_message_id}: ${(err as Error).message}`)
      }
    }

    // Auto-progress pipeline stages for all prospects with linked emails
    for (const pid of prospectIdsWithEmails) {
      try {
        const updated = await autoProgressProspect(pid)
        if (updated) results.stages_updated++
      } catch (err) {
        results.errors.push(`Auto-progress ${pid}: ${(err as Error).message}`)
      }
    }

    return Response.json(results)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function GET() {
  return Response.json({
    status: 'ok',
    description: 'Re-process existing emails: fix direction, link to existing prospects, create activities, auto-progress pipeline. Does NOT create new prospects.',
  })
}

// ─── Auto-progression logic ───

const STAGE_ORDER: Record<string, number> = {
  ciblage: 1, touch_1: 2, repondu: 3, devis: 4, client: 5, refuse: 6,
}

const DEVIS_KEYWORDS = ['devis', 'proposition', 'offre commerciale', 'proposal', 'quotation', 'prix', 'tarif']
const CLIENT_KEYWORDS = ['accord', 'signe', 'commande', 'valide', 'ok pour', 'go pour', 'on lance']

const STAGE_NAMES: Record<string, string> = {
  ciblage: 'Ciblage', touch_1: 'Contacte', repondu: 'Repondu',
  devis: 'Devis envoye', client: 'Client', refuse: 'Perdu',
}

/**
 * Auto-progress a prospect's pipeline stage based on ALL their linked emails.
 * Returns true if the stage was updated.
 */
async function autoProgressProspect(prospectId: string): Promise<boolean> {
  const { data: prospect } = await supabase
    .from('prospects')
    .select('pipeline_stage')
    .eq('id', prospectId)
    .single()

  if (!prospect) return false

  const currentStage = prospect.pipeline_stage
  const currentOrder = STAGE_ORDER[currentStage] || 0

  // Terminal stages — never auto-progress
  if (['client', 'refuse'].includes(currentStage)) return false

  // Get all emails linked to this prospect
  const { data: emails } = await supabase
    .from('emails')
    .select('direction, subject, body_text, body_preview')
    .eq('prospect_id', prospectId)
    .order('gmail_date', { ascending: true })

  if (!emails || emails.length === 0) return false

  let suggestedStage: string | null = null
  let suggestedOrder = currentOrder

  // Count sent emails
  const sentCount = emails.filter(e => e.direction === 'sent').length
  const hasReceived = emails.some(e => e.direction === 'received')

  // Any sent email → Contacté
  if (sentCount >= 1 && STAGE_ORDER.touch_1 > suggestedOrder) {
    suggestedStage = 'touch_1'
    suggestedOrder = STAGE_ORDER.touch_1
  }

  // If prospect responded, move to at least "repondu"
  if (hasReceived && STAGE_ORDER.repondu > suggestedOrder) {
    suggestedStage = 'repondu'
    suggestedOrder = STAGE_ORDER.repondu
  }

  // Check for keyword signals in all emails
  for (const email of emails) {
    const text = [email.subject, email.body_text, email.body_preview]
      .filter(Boolean).join(' ').toLowerCase()

    // Devis keywords in sent emails
    if (email.direction === 'sent' && DEVIS_KEYWORDS.some(kw => text.includes(kw))) {
      if (STAGE_ORDER.devis > suggestedOrder) {
        suggestedStage = 'devis'
        suggestedOrder = STAGE_ORDER.devis
      }
    }

    // Client keywords in received emails
    if (email.direction === 'received' && CLIENT_KEYWORDS.some(kw => text.includes(kw))) {
      if (STAGE_ORDER.client > suggestedOrder) {
        suggestedStage = 'client'
        suggestedOrder = STAGE_ORDER.client
      }
    }
  }

  // Only advance, never go back
  if (suggestedStage && suggestedOrder > currentOrder) {
    await supabase
      .from('prospects')
      .update({ pipeline_stage: suggestedStage })
      .eq('id', prospectId)

    // Log the automatic stage change
    await supabase.from('activities').insert({
      prospect_id: prospectId,
      type: 'status_change',
      content: `Pipeline auto (reprocess) : ${STAGE_NAMES[currentStage] || currentStage} → ${STAGE_NAMES[suggestedStage] || suggestedStage}`,
      metadata: { from: currentStage, to: suggestedStage, source: 'auto_progression_reprocess' },
    })

    return true
  }

  return false
}
