import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toLocalDateString } from '@/lib/utils'

/**
 * Gmail Import — fetches ALL emails directly via Gmail REST API
 * and pushes them through the same processing pipeline as the webhook.
 *
 * Auth: CRM cookie or Bearer token
 * Body: { access_token?: string, after?: string (YYYY/MM/DD), before?: string, max_results?: number }
 *
 * If no access_token in body, tries to use OAuth cookies (gmail_access_token / gmail_refresh_token).
 */

async function getAccessToken(req: NextRequest): Promise<string | null> {
  // 1. Check body (manual token)
  // This will be checked in the POST handler

  // 2. Check cookie for cached access token
  const cachedToken = req.cookies.get('gmail_access_token')?.value
  if (cachedToken) return cachedToken

  // 3. Try refresh token
  const refreshToken = req.cookies.get('gmail_refresh_token')?.value
  if (!refreshToken) return null

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const data = await res.json()
    if (data.access_token) return data.access_token
  } catch {
    // Refresh failed
  }
  return null
}

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const MY_EMAILS = [
  'louis.matar@boostinc.com',
  'louis.matar.gueye@gmail.com',
]

function isMyEmail(email: string): boolean {
  return MY_EMAILS.some(me => email.toLowerCase().trim() === me.toLowerCase())
}

const COLLEAGUE_DOMAINS = ['boostinc.com']
const BLACKLISTED_DOMAINS = [
  'hubspot.com', 'notifications.hubspot.com', 'info.n8n.io', 'transactional.n8n.io',
  'google.com', 'docs.google.com', 'revolut.com', 'paypal.com', 'communications.paypal.com',
  'clay.com', 'fleet.co', 'mg.fleet.co', 'vendlive.com', 'mailmoo.io',
  'mailinblack.com', 'invitations.mailinblack.com',
]
const NOREPLY_PREFIXES = [
  'noreply', 'no-reply', 'no_reply', 'donotreply', 'do-not-reply',
  'notifications', 'updates', 'marketing', 'hello', 'info', 'news',
  'support', 'sales', 'onboarding', 'success', 'comments-noreply',
  'gemini-notes', 'cloudplatform-noreply', 'weeklyupdates', 'ukimarketing',
]

function shouldSkipEmail(contactEmail: string): boolean {
  const lower = contactEmail.toLowerCase().trim()
  const [localPart, domain] = lower.split('@')
  if (isMyEmail(contactEmail)) return true
  if (COLLEAGUE_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true
  if (BLACKLISTED_DOMAINS.some(d => domain === d || domain.endsWith('.' + d))) return true
  if (NOREPLY_PREFIXES.some(p => localPart === p || localPart.startsWith(p + '+'))) return true
  if (domain.includes('bcc.') || /^\d+@/.test(lower)) return true
  return false
}

function extractEmail(header: string): string {
  const match = header.match(/<([^>]+)>/)
  if (match) return match[1].toLowerCase()
  // Might be just an email address
  const emailMatch = header.match(/[\w.-]+@[\w.-]+\.\w+/)
  if (emailMatch) return emailMatch[0].toLowerCase()
  return header.toLowerCase().trim()
}

function extractName(header: string): string | null {
  // "John Doe <john@example.com>" -> "John Doe"
  const match = header.match(/^([^<]+)</)
  if (match) {
    const name = match[1].replace(/"/g, '').trim()
    if (name && !name.includes('@')) return name
  }
  return null
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return Buffer.from(base64, 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function getPlainTextBody(payload: GmailPayload): string {
  // Check if this part is plain text
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  // Search in parts recursively
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = getPlainTextBody(part)
      if (text) return text
    }
  }
  return ''
}

function getHtmlBody(payload: GmailPayload): string {
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const html = getHtmlBody(part)
      if (html) return html
    }
  }
  return ''
}

interface GmailPayload {
  mimeType?: string
  headers?: Array<{ name: string; value: string }>
  body?: { data?: string; size?: number }
  parts?: GmailPayload[]
}

interface GmailMessage {
  id: string
  threadId: string
  labelIds: string[]
  payload: GmailPayload
  internalDate: string
}

// DISABLED — Stage auto-progression removed. pipeline_stage only changes via user action.

export async function POST(req: NextRequest) {
  try {
    // Auth — check cookie or Bearer token
    const cookie = req.cookies.get('crm_auth')?.value
    const authHeader = req.headers.get('authorization')
    const bearerToken = authHeader?.replace('Bearer ', '')
    const isAuthed = cookie === 'authenticated' || (bearerToken && bearerToken === process.env.CRM_PASSWORD)
    if (!isAuthed) {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const body = await req.json()
    const { after, before, max_results } = body as {
      access_token?: string
      after?: string
      before?: string
      max_results?: number
    }

    // Get access token: from body (manual), from cookie, or via refresh
    const access_token = body.access_token || await getAccessToken(req)
    if (!access_token) {
      return NextResponse.json({
        error: 'Gmail non connecte. Cliquez sur "Connecter Gmail" pour autoriser l\'acces.',
        need_oauth: true,
      }, { status: 401 })
    }

    // Build Gmail search query
    const queryParts: string[] = []
    if (after) queryParts.push(`after:${after}`)
    if (before) queryParts.push(`before:${before}`)
    // Only get sent and received emails (not drafts, spam, etc.)
    queryParts.push('(in:sent OR in:inbox)')

    const searchQuery = queryParts.join(' ')
    const maxEmails = Math.min(max_results || 500, 2000)

    const results = {
      total_fetched: 0,
      emails_stored: 0,
      emails_linked: 0,
      prospects_created: 0,
      activities_created: 0,
      stage_changes: 0,
      skipped: 0,
      already_exists: 0,
      errors: [] as string[],
    }

    // Step 1: Fetch message IDs (paginated)
    let allMessageIds: Array<{ id: string; threadId: string }> = []
    let nextPageToken: string | undefined

    while (allMessageIds.length < maxEmails) {
      const listUrl = new URL(`${GMAIL_API}/messages`)
      listUrl.searchParams.set('q', searchQuery)
      listUrl.searchParams.set('maxResults', String(Math.min(100, maxEmails - allMessageIds.length)))
      if (nextPageToken) listUrl.searchParams.set('pageToken', nextPageToken)

      const listRes = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${access_token}` },
      })

      if (!listRes.ok) {
        const errBody = await listRes.json().catch(() => ({}))
        return NextResponse.json({
          error: `Gmail API error: ${listRes.status} — ${errBody.error?.message || 'Token expire?'}`,
          hint: 'Regenerez le token sur https://developers.google.com/oauthplayground',
        }, { status: 400 })
      }

      const listData = await listRes.json()
      const messages = (listData.messages || []) as Array<{ id: string; threadId: string }>
      allMessageIds = allMessageIds.concat(messages)

      nextPageToken = listData.nextPageToken
      if (!nextPageToken || messages.length === 0) break
    }

    results.total_fetched = allMessageIds.length

    if (allMessageIds.length === 0) {
      return NextResponse.json({ ...results, message: 'Aucun email trouve pour cette periode' })
    }

    // Step 2: Process each message
    // Process in batches of 10 to avoid overwhelming the API
    const BATCH_SIZE = 10
    for (let i = 0; i < allMessageIds.length; i += BATCH_SIZE) {
      const batch = allMessageIds.slice(i, i + BATCH_SIZE)
      const batchPromises = batch.map(msg => processMessage(msg.id, access_token, results))
      await Promise.all(batchPromises)
    }

    return NextResponse.json({
      ...results,
      message: `Import termine: ${results.emails_stored} emails stockes, ${results.emails_linked} lies a des prospects, ${results.prospects_created} prospects crees`,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    )
  }
}

async function processMessage(
  messageId: string,
  accessToken: string,
  results: {
    emails_stored: number
    emails_linked: number
    prospects_created: number
    activities_created: number
    stage_changes: number
    skipped: number
    already_exists: number
    errors: string[]
  }
) {
  try {
    // Check if already imported
    const { data: existingEmail } = await supabase
      .from('emails')
      .select('id')
      .eq('gmail_message_id', messageId)
      .limit(1)

    if (existingEmail && existingEmail.length > 0) {
      results.already_exists++
      return
    }

    // Fetch full message
    const msgRes = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!msgRes.ok) {
      results.errors.push(`Fetch message ${messageId}: ${msgRes.status}`)
      return
    }

    const msg = (await msgRes.json()) as GmailMessage

    // Parse headers
    const headers = msg.payload.headers || []
    const getHeader = (name: string) =>
      headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || ''

    const fromRaw = getHeader('From')
    const toRaw = getHeader('To')
    const subject = getHeader('Subject')
    const dateStr = getHeader('Date')

    const fromEmail = extractEmail(fromRaw)
    const toEmail = extractEmail(toRaw)
    const fromName = extractName(fromRaw)

    // Determine direction
    const direction = isMyEmail(fromEmail) ? 'sent' : 'received'
    const contactEmail = direction === 'sent' ? toEmail : fromEmail

    // Skip junk
    if (shouldSkipEmail(contactEmail)) {
      results.skipped++
      return
    }

    // Get body
    const bodyText = getPlainTextBody(msg.payload)
    const bodyHtml = getHtmlBody(msg.payload)
    const bodyPreview = bodyText.slice(0, 500)

    // Parse gmail_date from internalDate (epoch ms) or Date header
    const gmailDate = msg.internalDate
      ? new Date(parseInt(msg.internalDate)).toISOString()
      : dateStr
        ? new Date(dateStr).toISOString()
        : new Date().toISOString()

    // 1. Store email
    const { error: emailError } = await supabase
      .from('emails')
      .upsert(
        {
          id: crypto.randomUUID(),
          gmail_message_id: messageId,
          gmail_thread_id: msg.threadId || null,
          subject: subject || null,
          from_email: fromEmail,
          to_email: toEmail,
          body_preview: bodyPreview || null,
          body_html: bodyHtml || null,
          body_text: bodyText || null,
          direction,
          labels: msg.labelIds || [],
          is_read: true,
          gmail_date: gmailDate,
        },
        { onConflict: 'gmail_message_id' }
      )

    if (emailError) {
      results.errors.push(`Email store: ${emailError.message}`)
      return
    }
    results.emails_stored++

    // 2. Find or create prospect
    let prospectId: string | null = null

    const { data: existingProspects } = await supabase
      .from('prospects')
      .select('id')
      .or(`email.ilike.${contactEmail},email_pro.ilike.${contactEmail}`)
      .limit(1)

    if (existingProspects && existingProspects.length > 0) {
      prospectId = existingProspects[0].id
    }
    // Note: We don't auto-create prospects for old emails — too risky for spam
    // Only link to existing ones

    // 3. Link email to prospect
    if (prospectId) {
      await supabase
        .from('emails')
        .update({ prospect_id: prospectId })
        .eq('gmail_message_id', messageId)

      results.emails_linked++

      // 4. Create activity (skip if already exists for this message)
      const { data: existingActivity } = await supabase
        .from('activities')
        .select('id')
        .eq('prospect_id', prospectId)
        .contains('metadata', { gmail_message_id: messageId })
        .limit(1)

      if (!existingActivity || existingActivity.length === 0) {
        const activityType = direction === 'sent' ? 'email_sent' : 'email_received'
        const content = bodyText
          ? `Objet : ${subject || '(Sans objet)'}\n\n${bodyText.slice(0, 3000)}`
          : `Objet : ${subject || '(Sans objet)'}`

        const { error: activityError } = await supabase
          .from('activities')
          .insert({
            prospect_id: prospectId,
            type: activityType,
            content,
            created_at: gmailDate,
            metadata: {
              gmail_message_id: messageId,
              subject,
              from: fromEmail,
              to: toEmail,
              source: 'gmail_import',
            },
          })

        if (!activityError) results.activities_created++
      }

      // 5. Update date_dernier_contact (only if this email is more recent)
      const emailDate = toLocalDateString(new Date(gmailDate))
      const { data: prospect } = await supabase
        .from('prospects')
        .select('date_dernier_contact')
        .eq('id', prospectId)
        .single()

      if (prospect) {
        if (!prospect.date_dernier_contact || emailDate > prospect.date_dernier_contact) {
          await supabase
            .from('prospects')
            .update({ date_dernier_contact: emailDate })
            .eq('id', prospectId)
        }

        // DISABLED — pipeline_stage is now ONLY changed by user action (drag & drop or stage selector)
        // Previously auto-progressed stage based on email keywords
      }
    }
  } catch (err) {
    results.errors.push(`Message ${messageId}: ${(err as Error).message}`)
  }
}
