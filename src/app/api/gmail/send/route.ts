import { supabase } from '@/lib/supabase'
import { getGmailAccessToken, buildMimeMessage, sendGmailMessage } from '@/lib/gmail'
import { toLocalDateString } from '@/lib/utils'

/**
 * Send an email via Gmail API.
 *
 * POST /api/gmail/send
 * Body: { to, subject, body_html, prospect_id? }
 */
export async function POST(request: Request) {
  try {
    const { to, subject, body_html, prospect_id, attachments } = await request.json()

    if (!to || !subject || !body_html) {
      return Response.json({ error: 'to, subject et body_html requis' }, { status: 400 })
    }

    // Get Gmail access token
    const accessToken = await getGmailAccessToken()
    if (!accessToken) {
      return Response.json({
        error: 'Gmail non connecte. Reconnectez Gmail dans Parametres (le scope "envoyer" est maintenant requis).',
        need_oauth: true,
      }, { status: 401 })
    }

    // Get sender email from Google userinfo
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const profile = await profileRes.json()
    const fromEmail = profile.emailAddress || 'louis.matar@boostinc.com'

    // Load email signature from business context
    const { data: bizCtx } = await supabase
      .from('business_context')
      .select('email_signature')
      .limit(1)
      .single()

    // Build and send MIME message
    const mime = buildMimeMessage({
      from: fromEmail,
      to,
      subject,
      htmlBody: body_html,
      signature: bizCtx?.email_signature || undefined,
      attachments: attachments || undefined,
    })

    const result = await sendGmailMessage(accessToken, mime)

    // Store in emails table
    const emailId = crypto.randomUUID()
    await supabase.from('emails').insert({
      id: emailId,
      gmail_message_id: result.id,
      gmail_thread_id: result.threadId || null,
      subject,
      from_email: fromEmail,
      to_email: to,
      body_html,
      body_text: body_html.replace(/<[^>]*>/g, ''),
      body_preview: body_html.replace(/<[^>]*>/g, '').slice(0, 500),
      direction: 'sent',
      labels: ['SENT'],
      is_read: true,
      gmail_date: new Date().toISOString(),
      prospect_id: prospect_id || null,
    })

    // Create activity if linked to a prospect
    if (prospect_id) {
      await supabase.from('activities').insert({
        prospect_id,
        type: 'email_sent',
        content: `Objet : ${subject}\n\n${body_html.replace(/<[^>]*>/g, '').slice(0, 3000)}`,
        metadata: {
          gmail_message_id: result.id,
          subject,
          from: fromEmail,
          to,
          source: 'crm_compose',
        },
      })

      // Update date_dernier_contact
      const today = toLocalDateString(new Date())
      await supabase
        .from('prospects')
        .update({ date_dernier_contact: today })
        .eq('id', prospect_id)

      // DISABLED — pipeline_stage is now ONLY changed by user action (drag & drop or stage selector)
      // Previously auto-progressed ciblage → touch_1 on email send
    }

    return Response.json({
      success: true,
      gmail_message_id: result.id,
      email_id: emailId,
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
