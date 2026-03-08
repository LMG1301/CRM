import { supabase } from '@/lib/supabase'

/**
 * Email Templates API
 * GET  /api/email-templates         — list all active templates
 * POST /api/email-templates         — create a new template
 */

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('is_active', true)
      .order('usage_count', { ascending: false })

    if (error) {
      // Table may not exist yet
      if (error.message.includes('email_templates')) {
        return Response.json([])
      }
      throw error
    }
    return Response.json(data || [])
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, subject, body_html, category, variables } = body

    if (!name || !subject || !body_html) {
      return Response.json({ error: 'name, subject, body_html requis' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        name,
        subject,
        body_html,
        category: category || 'general',
        variables: variables || [],
      })
      .select()
      .single()

    if (error) throw error
    return Response.json(data)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
