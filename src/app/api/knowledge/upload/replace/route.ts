import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/document-parser'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB

/**
 * Replace an existing document in the knowledge base
 *
 * PUT /api/knowledge/upload/replace
 * Body: FormData with "file" and "id" (document ID to replace)
 */
export async function PUT(request: NextRequest) {
  try {
    // Auth check
    const cookie = request.cookies.get('crm_auth')?.value
    if (cookie !== 'authenticated') {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const docId = formData.get('id') as string | null

    if (!file || !docId) {
      return NextResponse.json({ error: 'Fichier et id requis' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Fichier trop volumineux (max 10 MB)' }, { status: 400 })
    }

    // Verify document exists
    const { data: existing } = await supabase
      .from('knowledge_documents')
      .select('id')
      .eq('id', docId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Document non trouve' }, { status: 404 })
    }

    // Convert file to text
    const buffer = Buffer.from(await file.arrayBuffer())
    const content = await extractTextFromFile(buffer, file.name, file.type)

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Impossible d\'extraire le contenu texte' }, { status: 400 })
    }

    // Determine mime_type
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    const mimeType = file.type || guessMimeType(ext)

    // Update document
    const { error: updateError } = await supabase
      .from('knowledge_documents')
      .update({
        name: file.name,
        content,
        mime_type: mimeType,
        file_size: file.size,
        summary: null, // Reset summary for re-generation
        last_modified: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      })
      .eq('id', docId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ replaced: true, id: docId, name: file.name })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

function guessMimeType(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.json': 'application/json',
  }
  return map[ext] || 'application/octet-stream'
}
