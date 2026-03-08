import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractTextFromFile } from '@/lib/document-parser'
import { generateDocumentSummary } from '@/lib/knowledge-summary'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const MAX_FILES = 10
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.csv', '.json']

/**
 * Upload local documents to the knowledge base
 *
 * POST /api/knowledge/upload
 * Body: FormData with file(s) under key "files"
 *
 * Returns 409 if a document with the same name already exists (frontend handles "Replace?" dialog)
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const cookie = request.cookies.get('crm_auth')?.value
    if (cookie !== 'authenticated') {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    const formData = await request.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Aucun fichier fourni' }, { status: 400 })
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} fichiers par upload` }, { status: 400 })
    }

    const results = {
      processed: 0,
      created: 0,
      errors: [] as string[],
    }

    for (const file of files) {
      try {
        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
          results.errors.push(`${file.name}: fichier trop volumineux (max 10 MB)`)
          continue
        }

        // Validate extension
        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
          results.errors.push(`${file.name}: type non supporte (acceptes: ${ALLOWED_EXTENSIONS.join(', ')})`)
          continue
        }

        // Check for duplicate name
        const { data: existing } = await supabase
          .from('knowledge_documents')
          .select('id, name')
          .eq('name', file.name)
          .limit(1)

        if (existing && existing.length > 0) {
          return NextResponse.json({
            error: 'duplicate',
            existing_id: existing[0].id,
            name: file.name,
          }, { status: 409 })
        }

        // Convert file to text
        const buffer = Buffer.from(await file.arrayBuffer())
        const content = await extractTextFromFile(buffer, file.name, file.type)

        if (!content || content.trim().length === 0) {
          results.errors.push(`${file.name}: impossible d'extraire le contenu texte`)
          continue
        }

        // Determine mime_type
        const mimeType = file.type || guessMimeType(ext)

        // Generate summary via Haiku (non-blocking — null if it fails)
        const summary = await generateDocumentSummary(file.name, content)

        // Insert into knowledge_documents
        const { error: insertError } = await supabase
          .from('knowledge_documents')
          .insert({
            name: file.name,
            content,
            mime_type: mimeType,
            source: 'upload',
            file_size: file.size,
            summary,
            drive_file_id: null,
            folder_path: null,
            url: null,
            last_modified: new Date().toISOString(),
            synced_at: new Date().toISOString(),
          })

        if (insertError) {
          results.errors.push(`${file.name}: ${insertError.message}`)
          continue
        }

        results.created++
        results.processed++
      } catch (err) {
        results.errors.push(`${file.name}: ${(err as Error).message}`)
      }
    }

    return NextResponse.json({
      ...results,
      message: `${results.created} document${results.created > 1 ? 's' : ''} ajoute${results.created > 1 ? 's' : ''}`,
    })
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
