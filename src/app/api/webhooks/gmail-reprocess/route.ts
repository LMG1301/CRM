import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Re-process existing emails in the database:
 * 1. Fix direction (sent vs received) using multi-email detection
 * 2. Create missing prospects from unlinked emails
 * 3. Create missing activities
 *
 * Run once to fix historical data, then use normal sync going forward.
 */

const MY_EMAILS = [
  'louis.matar@boostinc.com',
  'louis.matar.gueye@gmail.com',
]

function isMyEmail(email: string): boolean {
  const lower = email.toLowerCase().trim()
  return MY_EMAILS.some(me => lower === me.toLowerCase())
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
      prospects_created: 0,
      prospects_linked: 0,
      activities_created: 0,
      errors: [] as string[],
    }

    // 1. Get all emails
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

        // Skip if contact is also me (self-emails)
        if (isMyEmail(contactEmail)) continue

        // Find prospect by email
        let prospectId = email.prospect_id

        if (!prospectId) {
          const { data: existing } = await supabase
            .from('prospects')
            .select('id')
            .or(`email.ilike.${contactEmail},email_pro.ilike.${contactEmail}`)
            .limit(1)

          if (existing && existing.length > 0) {
            prospectId = existing[0].id

            // Link email to prospect
            await supabase
              .from('emails')
              .update({ prospect_id: prospectId })
              .eq('id', email.id)
            results.prospects_linked++
          } else {
            // Create prospect from email
            const nameParts = parseContactName(email.from_email, contactEmail)
            const { data: newProspect, error: pErr } = await supabase
              .from('prospects')
              .insert({
                prenom: nameParts.prenom,
                nom: nameParts.nom,
                email: contactEmail,
                source: 'Email Gmail',
                pipeline_stage: 'ciblage',
                date_premier_contact: new Date(email.gmail_date).toISOString().split('T')[0],
                date_dernier_contact: new Date(email.gmail_date).toISOString().split('T')[0],
              })
              .select('id')
              .single()

            if (!pErr && newProspect) {
              prospectId = newProspect.id
              results.prospects_created++

              await supabase
                .from('emails')
                .update({ prospect_id: prospectId })
                .eq('id', email.id)
            }
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
            const preview = email.body_preview
              ? email.body_preview.substring(0, 300).replace(/\s+/g, ' ').trim()
              : ''
            const content = preview
              ? `Objet : ${subject}\n\n${preview}`
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

          // Update date_dernier_contact
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

function parseContactName(fromHeader: string, email: string): { prenom: string; nom: string } {
  // Try to extract from email local part
  const local = email.split('@')[0]
  const parts = local.split(/[._-]/)
  if (parts.length >= 2) {
    const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
    return { prenom: capitalize(parts[0]), nom: capitalize(parts[1]) }
  }
  return { prenom: local, nom: '' }
}

// Health check
export async function GET() {
  return Response.json({
    status: 'ok',
    description: 'Re-process existing emails: fix direction, create missing prospects, link activities',
    usage: 'POST with x-webhook-secret header',
  })
}
