import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/knowledge — List knowledge documents with search, type filter, pagination
 */
export async function GET(request: NextRequest) {
  try {
    const cookie = request.cookies.get('crm_auth')?.value
    if (cookie !== 'authenticated') {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || ''
    const type = searchParams.get('type') || ''
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    let query = supabase
      .from('knowledge_documents')
      .select('id, name, mime_type, folder_path, url, last_modified, synced_at, source, file_size, drive_file_id', { count: 'exact' })

    // Search filter
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }

    // Type filter
    if (type) {
      const typeMap: Record<string, string[]> = {
        pdf: ['application/pdf'],
        docs: ['application/vnd.google-apps.document', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/markdown'],
        sheets: ['application/vnd.google-apps.spreadsheet', 'text/csv', 'application/json'],
        slides: ['application/vnd.google-apps.presentation'],
      }
      const mimeTypes = typeMap[type]
      if (mimeTypes) {
        query = query.in('mime_type', mimeTypes)
      }
    }

    const { data, error, count } = await query
      .order('name')
      .range(offset, offset + limit - 1)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      documents: data || [],
      total: count || 0,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

/**
 * DELETE /api/knowledge?id=<docId> — Delete a single document
 */
export async function DELETE(request: NextRequest) {
  try {
    const cookie = request.cookies.get('crm_auth')?.value
    if (cookie !== 'authenticated') {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id requis' }, { status: 400 })
    }

    const { error } = await supabase
      .from('knowledge_documents')
      .delete()
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ deleted: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
