import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

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

const MY_EMAIL = 'louis.matar@boostinc.com'

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

    for (const email of emails) {
      try {
        // Determine direction
        const fromLower = email.from_email.toLowerCase()
        const direction = fromLower === MY_EMAIL.toLowerCase() ? 'sent' : 'received'
        const contactEmail = direction === 'sent' ? email.to_email : email.from_email
        const contactName = direction === 'received' ? email.from_name : undefined

        // 1. Upsert email
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
        } else if (direction === 'received') {
          // Auto-create prospect from incoming email
          const nameParts = parseEmailName(contactName, contactEmail)
          const { data: newProspect, error: prospectError } = await supabase
            .from('prospects')
            .insert({
              prenom: nameParts.prenom,
              nom: nameParts.nom,
              email: contactEmail,
              source: 'Email entrant',
              pipeline_stage: 'ciblage',
              date_premier_contact: new Date().toISOString().split('T')[0],
              date_dernier_contact: new Date().toISOString().split('T')[0],
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

          // 4. Create activity
          const activityType = direction === 'sent' ? 'email_sent' : 'email_received'
          const content = email.subject || `Email ${direction === 'sent' ? 'envoye' : 'recu'}`

          const { error: activityError } = await supabase
            .from('activities')
            .insert({
              prospect_id: prospectId,
              type: activityType,
              content,
              metadata: {
                gmail_message_id: email.gmail_message_id,
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
              date_dernier_contact: new Date(email.gmail_date).toISOString().split('T')[0],
            })
            .eq('id', prospectId)
        }

        results.processed++
      } catch (err) {
        results.errors.push(`Processing error: ${(err as Error).message}`)
      }
    }

    // 6. Trigger AI pipeline analysis for new prospects
    if (results.prospects_created > 0) {
      // Fire-and-forget: analyze new prospects in background
      triggerPipelineAnalysis().catch(() => {})
    }

    return Response.json(results)
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

// Trigger AI analysis for prospects with recent emails
async function triggerPipelineAnalysis() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : 'http://localhost:3000'

  await fetch(`${baseUrl}/api/ai/analyze-pipeline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-secret': process.env.WEBHOOK_SECRET || '',
    },
  })
}
