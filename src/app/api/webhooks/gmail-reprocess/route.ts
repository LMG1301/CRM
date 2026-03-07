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
      skipped: 0,
      errors: [] as string[],
    }

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
        }
      } catch (err) {
        results.errors.push(`Email ${email.gmail_message_id}: ${(err as Error).message}`)
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
    description: 'Re-process existing emails: fix direction, link to existing prospects, create activities. Does NOT create new prospects.',
  })
}
