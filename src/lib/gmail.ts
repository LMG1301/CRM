import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/**
 * Refresh an access token using a refresh token.
 * Returns the new access token or null.
 */
async function refreshAccessToken(refreshToken: string): Promise<string | null> {
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

/**
 * Get a valid Gmail access token. Tries cookies first (browser context),
 * then falls back to the integrations table (server/cron context).
 * Returns null if no token available.
 */
export async function getGmailAccessToken(): Promise<string | null> {
  // 1. Try cookies (works when called from a browser request)
  try {
    const cookieStore = await cookies()

    const cachedToken = cookieStore.get('gmail_access_token')?.value
    if (cachedToken) {
      console.log('[Gmail] Access token found in cookie')
      return cachedToken
    }

    const cookieRefresh = cookieStore.get('gmail_refresh_token')?.value
    if (cookieRefresh) {
      console.log('[Gmail] Refresh token found in cookie, refreshing...')
      const token = await refreshAccessToken(cookieRefresh)
      if (token) {
        console.log('[Gmail] Token refreshed from cookie refresh_token')
        return token
      }
      console.log('[Gmail] Cookie refresh_token failed to refresh')
    } else {
      console.log('[Gmail] No cookies found (access_token nor refresh_token)')
    }
  } catch {
    console.log('[Gmail] cookies() not available (server/cron context)')
  }

  // 2. Fallback: read refresh_token from integrations table (works everywhere)
  try {
    const { data, error: dbErr } = await supabase
      .from('integrations')
      .select('config')
      .eq('service', 'gmail')
      .single()

    if (dbErr) {
      console.log('[Gmail] DB read error:', dbErr.message)
    }

    const config = data?.config as Record<string, unknown> | null
    console.log('[Gmail] DB config keys:', config ? Object.keys(config) : 'null')
    const refreshToken = config?.refresh_token as string | undefined
    if (refreshToken) {
      console.log('[Gmail] Refresh token found in DB, refreshing...')
      const token = await refreshAccessToken(refreshToken)
      if (token) {
        console.log('[Gmail] Token refreshed from DB refresh_token')
        return token
      }
      console.log('[Gmail] DB refresh_token failed to refresh')
    } else {
      console.log('[Gmail] No refresh_token in DB config')
    }
  } catch {
    console.log('[Gmail] DB fallback exception')
  }

  console.log('[Gmail] No token available — returning null')
  return null
}

/**
 * Store Gmail refresh token in the integrations table for server-side access.
 */
export async function storeGmailRefreshToken(refreshToken: string): Promise<void> {
  try {
    console.log('[Gmail] Storing refresh token in DB...')

    // Get current config to preserve other fields
    const { data: existing, error: readErr } = await supabase
      .from('integrations')
      .select('config')
      .eq('service', 'gmail')
      .single()

    if (readErr) {
      console.error('[Gmail] Failed to read integrations row:', readErr.message)
    }

    const currentConfig = (existing?.config as Record<string, unknown>) || {}

    const { error: updateErr } = await supabase
      .from('integrations')
      .update({
        config: { ...currentConfig, refresh_token: refreshToken },
        status: 'connected',
        updated_at: new Date().toISOString(),
      })
      .eq('service', 'gmail')

    if (updateErr) {
      console.error('[Gmail] Failed to update integrations row:', updateErr.message)
      // Fallback: try upsert instead (in case RLS blocks update but allows insert)
      const { error: upsertErr } = await supabase
        .from('integrations')
        .upsert({
          service: 'gmail',
          config: { refresh_token: refreshToken },
          status: 'connected',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'service' })

      if (upsertErr) {
        console.error('[Gmail] Upsert fallback also failed:', upsertErr.message)
      } else {
        console.log('[Gmail] Refresh token stored via upsert fallback')
      }
    } else {
      console.log('[Gmail] Refresh token stored successfully')
    }
  } catch (err) {
    console.error('[Gmail] Exception storing refresh token:', (err as Error).message)
  }
}

/**
 * Build an RFC 2822 MIME message for the Gmail API.
 * Supports optional signature and file attachments.
 */
export function buildMimeMessage(params: {
  from: string
  to: string
  subject: string
  htmlBody: string
  signature?: string
  attachments?: { filename: string; mimeType: string; base64: string }[]
}): string {
  // Inject signature into HTML body if provided
  let htmlBody = params.htmlBody
  if (params.signature) {
    const signatureHtml = `<div class="gmail-signature" style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:12px;font-size:13px;color:#6b7280">${params.signature.replace(/\n/g, '<br>')}</div>`
    // Insert before </body> if present, otherwise append
    if (htmlBody.includes('</body>')) {
      htmlBody = htmlBody.replace('</body>', `${signatureHtml}</body>`)
    } else {
      htmlBody = htmlBody + signatureHtml
    }
  }

  const plainText = htmlBody.replace(/<[^>]*>/g, '')
  const hasAttachments = params.attachments && params.attachments.length > 0

  if (!hasAttachments) {
    // Simple multipart/alternative (text + html)
    const boundary = `boundary_${Date.now()}`
    const lines = [
      `From: ${params.from}`,
      `To: ${params.to}`,
      `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(plainText).toString('base64'),
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlBody).toString('base64'),
      '',
      `--${boundary}--`,
    ]
    return lines.join('\r\n')
  }

  // multipart/mixed with nested multipart/alternative + attachments
  const mixedBoundary = `mixed_${Date.now()}`
  const altBoundary = `alt_${Date.now()}`
  const lines = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(params.subject).toString('base64')}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(plainText).toString('base64'),
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(htmlBody).toString('base64'),
    '',
    `--${altBoundary}--`,
  ]

  // Add each attachment
  for (const att of params.attachments!) {
    const encodedName = `=?UTF-8?B?${Buffer.from(att.filename).toString('base64')}?=`
    lines.push(
      '',
      `--${mixedBoundary}`,
      `Content-Type: ${att.mimeType}; name="${encodedName}"`,
      `Content-Disposition: attachment; filename="${encodedName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      att.base64,
    )
  }

  lines.push('', `--${mixedBoundary}--`)
  return lines.join('\r\n')
}

/**
 * Base64url encode a string for the Gmail API.
 */
export function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Send an email via the Gmail API.
 * Returns the sent message ID or throws on error.
 */
export async function sendGmailMessage(
  accessToken: string,
  mimeMessage: string,
): Promise<{ id: string; threadId: string }> {
  const encoded = base64UrlEncode(mimeMessage)

  const res = await fetch(`${GMAIL_API}/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encoded }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(
      `Gmail send error: ${res.status} — ${err.error?.message || 'Token expire?'}`,
    )
  }

  return res.json()
}
