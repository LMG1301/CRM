import { NextRequest, NextResponse } from 'next/server'
import { storeGmailRefreshToken } from '@/lib/gmail'

/**
 * Step 2: Google redirects here with an authorization code.
 * We exchange it for access + refresh tokens, store refresh_token in a cookie
 * AND in the integrations table (for server-side/cron access),
 * then redirect to /settings.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    const settingsUrl = new URL('/settings', req.url)
    settingsUrl.searchParams.set('gmail_error', error)
    return NextResponse.redirect(settingsUrl)
  }

  if (!code) {
    return NextResponse.json({ error: 'Code manquant' }, { status: 400 })
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth non configure' }, { status: 500 })
  }

  // Build redirect URI (must match what was used in authorize)
  const host = req.headers.get('host') || 'localhost:3000'
  const protocol = host.includes('localhost') ? 'http' : 'https'
  const redirectUri = `${protocol}://${host}/api/gmail/oauth/callback`

  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    const tokenData = await tokenRes.json()

    if (!tokenRes.ok || !tokenData.access_token) {
      const settingsUrl = new URL('/settings', req.url)
      settingsUrl.searchParams.set('gmail_error', tokenData.error_description || 'Token exchange failed')
      return NextResponse.redirect(settingsUrl)
    }

    // Store refresh token in secure cookie (lasts 1 year)
    const settingsUrl = new URL('/settings', req.url)
    settingsUrl.searchParams.set('gmail_connected', '1')

    const response = NextResponse.redirect(settingsUrl)

    if (tokenData.refresh_token) {
      response.cookies.set('gmail_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: !host.includes('localhost'),
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60, // 1 year
      })

      // Also store in DB so server-side code (cron, process-step) can access it
      await storeGmailRefreshToken(tokenData.refresh_token)
    }

    // Also store current access token (short-lived, 1 hour)
    response.cookies.set('gmail_access_token', tokenData.access_token, {
      httpOnly: true,
      secure: !host.includes('localhost'),
      sameSite: 'lax',
      path: '/',
      maxAge: 3500, // ~58 min
    })

    return response
  } catch (err) {
    const settingsUrl = new URL('/settings', req.url)
    settingsUrl.searchParams.set('gmail_error', (err as Error).message)
    return NextResponse.redirect(settingsUrl)
  }
}
