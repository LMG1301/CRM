import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

/**
 * POST /api/gmail/disconnect
 * Removes Gmail tokens from cookies and DB.
 */
export async function POST() {
  try {
    // Clear cookies
    const cookieStore = await cookies()
    cookieStore.delete('gmail_access_token')
    cookieStore.delete('gmail_refresh_token')

    // Clear DB integration
    await supabase
      .from('integrations')
      .update({
        config: {},
        status: 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('service', 'gmail')

    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'Failed to disconnect' }, { status: 500 })
  }
}
