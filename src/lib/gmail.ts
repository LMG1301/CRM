import { cookies } from 'next/headers'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

/**
 * Get a valid Gmail access token from cookies, refreshing if needed.
 * Returns null if no token available.
 */
export async function getGmailAccessToken(): Promise<string | null> {
  const cookieStore = await cookies()

  // 1. Check cached access token
  const cachedToken = cookieStore.get('gmail_access_token')?.value
  if (cachedToken) return cachedToken

  // 2. Try refresh token
  const refreshToken = cookieStore.get('gmail_refresh_token')?.value
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

/**
 * Build an RFC 2822 MIME message for the Gmail API.
 */
export function buildMimeMessage(params: {
  from: string
  to: string
  subject: string
  htmlBody: string
}): string {
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
    Buffer.from(params.htmlBody.replace(/<[^>]*>/g, '')).toString('base64'),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(params.htmlBody).toString('base64'),
    '',
    `--${boundary}--`,
  ]
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
