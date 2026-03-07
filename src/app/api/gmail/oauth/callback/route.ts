import { NextRequest, NextResponse } from 'next/server'

/**
 * Step 2: Google redirects here with an authorization code.
 * We exchange it for access + refresh tokens, store refresh_token in a cookie,
 * then redirect to /import.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    const importUrl = new URL('/import', req.url)
    importUrl.searchParams.set('gmail_error', error)
    return NextResponse.redirect(importUrl)
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
      const importUrl = new URL('/import', req.url)
      importUrl.searchParams.set('gmail_error', tokenData.error_description || 'Token exchange failed')
      return NextResponse.redirect(importUrl)
    }

    // Store refresh token in secure cookie (lasts 1 year)
    const importUrl = new URL('/import', req.url)
    importUrl.searchParams.set('gmail_connected', '1')

    const response = NextResponse.redirect(importUrl)

    if (tokenData.refresh_token) {
      response.cookies.set('gmail_refresh_token', tokenData.refresh_token, {
        httpOnly: true,
        secure: !host.includes('localhost'),
        sameSite: 'lax',
        path: '/',
        maxAge: 365 * 24 * 60 * 60, // 1 year
      })
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
    const importUrl = new URL('/import', req.url)
    importUrl.searchParams.set('gmail_error', (err as Error).message)
    return NextResponse.redirect(importUrl)
  }
}
