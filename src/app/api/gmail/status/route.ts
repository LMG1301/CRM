import { getGmailAccessToken } from '@/lib/gmail'
import { supabase } from '@/lib/supabase'

/**
 * GET /api/gmail/status
 * Returns Gmail connection status, email, last sync date, and email count.
 */
export async function GET() {
  try {
    const accessToken = await getGmailAccessToken()

    if (!accessToken) {
      return Response.json({
        connected: false,
        email: null,
        lastSync: null,
        emailCount: 0,
      })
    }

    // Get Gmail profile email
    let email: string | null = null
    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const profile = await res.json()
      email = profile.emailAddress || null
    } catch {
      // Token might be invalid
    }

    // Get email count and last sync date
    const [countResult, lastSyncResult] = await Promise.all([
      supabase.from('emails').select('id', { count: 'exact', head: true }),
      supabase
        .from('emails')
        .select('gmail_date')
        .order('gmail_date', { ascending: false })
        .limit(1),
    ])

    const emailCount = countResult.count || 0
    const lastSync = lastSyncResult.data?.[0]?.gmail_date || null

    return Response.json({
      connected: !!email,
      email,
      lastSync,
      emailCount,
    })
  } catch {
    return Response.json({
      connected: false,
      email: null,
      lastSync: null,
      emailCount: 0,
    })
  }
}
