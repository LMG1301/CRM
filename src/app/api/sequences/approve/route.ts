import { supabase } from '@/lib/supabase'
import { getGmailAccessToken, buildMimeMessage, sendGmailMessage } from '@/lib/gmail'
import { toLocalDateString } from '@/lib/utils'
import type { SequenceStep } from '@/lib/types'

/**
 * Approve and send a pending sequence email
 *
 * POST /api/sequences/approve
 * Body: { enrollment_id, edited_subject?, edited_body_html? }
 */
export async function POST(request: Request) {
  try {
    console.log('=== APPROVE START ===')
    const { enrollment_id, edited_subject, edited_body_html } = await request.json()
    console.log('Enrollment ID:', enrollment_id)

    if (!enrollment_id) {
      console.log('ERROR: enrollment_id manquant')
      return Response.json({ error: 'enrollment_id requis' }, { status: 400 })
    }

    // Load enrollment
    const { data: enrollment, error: enrErr } = await supabase
      .from('sequence_enrollments')
      .select('*, sequence:sequences(*), prospect:prospects(*)')
      .eq('id', enrollment_id)
      .eq('status', 'active')
      .single()

    console.log('Enrollment loaded:', enrollment ? 'OK' : 'NOT FOUND', 'Error:', enrErr?.message || 'none')
    console.log('Has pending_email:', !!enrollment?.pending_email)

    if (enrErr || !enrollment || !enrollment.pending_email) {
      console.log('ERROR: Enrollment sans email en attente — enrErr:', enrErr?.message, 'enrollment:', !!enrollment, 'pending:', !!enrollment?.pending_email)
      return Response.json({ error: 'Enrollment sans email en attente' }, { status: 404 })
    }

    const sequence = enrollment.sequence
    const prospect = enrollment.prospect
    if (!sequence || !prospect) {
      return Response.json({ error: 'Sequence ou prospect manquant' }, { status: 404 })
    }

    const pendingEmail = enrollment.pending_email as {
      subject: string
      body_html: string
      body_text: string
      step_position: number
    }

    const subject = edited_subject || pendingEmail.subject
    const body_html = edited_body_html || pendingEmail.body_html
    const body_text = body_html.replace(/<[^>]*>/g, '')

    // Get Gmail access token
    console.log('Getting Gmail access token...')
    const accessToken = await getGmailAccessToken()
    console.log('Access token:', accessToken ? `OK (${accessToken.slice(0, 20)}...)` : 'NULL')
    if (!accessToken) {
      console.log('ERROR: Gmail non connecte — pas de token')
      console.log('=== APPROVE END (no token) ===')
      return Response.json({
        error: 'Gmail non connecte',
        need_oauth: true,
      }, { status: 401 })
    }

    const prospectEmail = prospect.email || prospect.email_pro
    console.log('Prospect email:', prospectEmail || 'MISSING')
    if (!prospectEmail) {
      console.log('ERROR: Prospect sans adresse email')
      console.log('=== APPROVE END (no email) ===')
      return Response.json({ error: 'Prospect sans adresse email' }, { status: 400 })
    }

    // Get sender profile
    console.log('Fetching Gmail profile...')
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const profile = await profileRes.json()
    const fromEmail = profile.emailAddress || 'noreply@boostinc.com'
    console.log('Gmail profile status:', profileRes.status, 'From:', fromEmail)

    // Load signature
    const { data: bizCtx } = await supabase
      .from('business_context')
      .select('email_signature')
      .limit(1)
      .single()

    // Build and send
    console.log('Building MIME message...')
    console.log('To:', prospectEmail, 'Subject:', subject)
    const mime = buildMimeMessage({
      from: fromEmail,
      to: prospectEmail,
      subject,
      htmlBody: body_html,
      signature: bizCtx?.email_signature || undefined,
    })
    console.log('MIME built, length:', mime.length)

    console.log('Sending email via Gmail API...')
    const result = await sendGmailMessage(accessToken, mime)
    console.log('Gmail send result:', JSON.stringify(result))

    // Store email
    await supabase.from('emails').insert({
      gmail_message_id: result.id,
      gmail_thread_id: result.threadId || null,
      subject,
      from_email: fromEmail,
      to_email: prospectEmail,
      body_html,
      body_text,
      body_preview: body_text.slice(0, 500),
      direction: 'sent',
      labels: ['SENT'],
      is_read: true,
      gmail_date: new Date().toISOString(),
      prospect_id: prospect.id,
    })

    // Create activity
    await supabase.from('activities').insert({
      prospect_id: prospect.id,
      type: 'email_sent',
      content: `[Sequence: ${sequence.name} — Etape ${pendingEmail.step_position}] Objet : ${subject}\n\n${body_text.slice(0, 3000)}`,
      metadata: {
        gmail_message_id: result.id,
        subject,
        from: fromEmail,
        to: prospectEmail,
        source: 'sequence',
        sequence_id: sequence.id,
        step: pendingEmail.step_position,
      },
    })

    // Update prospect date_dernier_contact
    const today = toLocalDateString(new Date())
    await supabase
      .from('prospects')
      .update({ date_dernier_contact: today })
      .eq('id', prospect.id)

    // Advance enrollment
    const steps = sequence.steps as SequenceStep[]
    const nextIndex = enrollment.current_step + 1

    if (nextIndex >= steps.length) {
      await supabase
        .from('sequence_enrollments')
        .update({
          current_step: nextIndex,
          status: 'completed',
          completed_at: new Date().toISOString(),
          pending_email: null,
        })
        .eq('id', enrollment_id)
    } else {
      const nextDelay = steps[nextIndex]?.delay_days || 1
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + nextDelay)

      await supabase
        .from('sequence_enrollments')
        .update({
          current_step: nextIndex,
          next_step_date: toLocalDateString(nextDate),
          pending_email: null,
        })
        .eq('id', enrollment_id)
    }

    // Generate next step email immediately (so it appears for review)
    if (nextIndex < steps.length) {
      try {
        const origin = new URL(request.url).origin
        console.log('Triggering generation of next step', nextIndex + 1, '...')
        const genRes = await fetch(`${origin}/api/sequences/process-step`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enrollment_id }),
        })
        const genData = await genRes.json()
        console.log('Next step generation result:', JSON.stringify(genData))
      } catch (genErr) {
        console.log('Warning: failed to generate next step email:', (genErr as Error).message)
        // Non-blocking: cron will pick it up later
      }
    }

    console.log('=== APPROVE SUCCESS — step', pendingEmail.step_position, '===')
    return Response.json({ sent: true, step: pendingEmail.step_position })
  } catch (error) {
    console.log('=== APPROVE ERROR ===')
    console.log('Error type:', (error as Error).constructor.name)
    console.log('Error message:', (error as Error).message)
    console.log('Error stack:', (error as Error).stack)
    console.log('=== APPROVE END (error) ===')
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
