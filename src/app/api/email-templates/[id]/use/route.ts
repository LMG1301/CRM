import { supabase } from '@/lib/supabase'
import { NextRequest } from 'next/server'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    // Simple read + update approach
    const { data } = await supabase
      .from('email_templates')
      .select('usage_count')
      .eq('id', id)
      .single()

    if (data) {
      await supabase
        .from('email_templates')
        .update({ usage_count: (data.usage_count || 0) + 1 })
        .eq('id', id)
    }
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: true }) // Non-critical
  }
}
