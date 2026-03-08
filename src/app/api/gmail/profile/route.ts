import { getGmailAccessToken } from '@/lib/gmail'

export async function GET() {
  try {
    const accessToken = await getGmailAccessToken()
    if (!accessToken) {
      return Response.json({ email: null }, { status: 200 })
    }

    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const profile = await res.json()
    return Response.json({ email: profile.emailAddress || null })
  } catch {
    return Response.json({ email: null })
  }
}
