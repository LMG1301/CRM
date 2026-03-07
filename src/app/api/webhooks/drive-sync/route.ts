import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Webhook endpoint for Google Drive sync.
 * Receives documents from Google Apps Script and stores them
 * in the knowledge_documents table for AI context.
 *
 * Auth: Simple secret token in headers
 */

interface IncomingDocument {
  drive_file_id: string
  name: string
  mime_type: string
  folder_path?: string
  content: string
  url?: string
  last_modified: string
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const secret = request.headers.get('x-webhook-secret')
    if (secret !== process.env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const documents: IncomingDocument[] = Array.isArray(body) ? body : [body]

    if (documents.length === 0) {
      return Response.json({ message: 'No documents to process' })
    }

    const results = {
      processed: 0,
      updated: 0,
      created: 0,
      errors: [] as string[],
    }

    for (const doc of documents) {
      try {
        if (!doc.drive_file_id || !doc.content) {
          results.errors.push(`Missing drive_file_id or content for ${doc.name}`)
          continue
        }

        // Upsert document (update if already exists, insert if new)
        const { data: existing } = await supabase
          .from('knowledge_documents')
          .select('id')
          .eq('drive_file_id', doc.drive_file_id)
          .limit(1)

        if (existing && existing.length > 0) {
          // Update existing
          const { error } = await supabase
            .from('knowledge_documents')
            .update({
              name: doc.name,
              mime_type: doc.mime_type,
              folder_path: doc.folder_path || null,
              content: doc.content,
              url: doc.url || null,
              last_modified: doc.last_modified,
              synced_at: new Date().toISOString(),
            })
            .eq('drive_file_id', doc.drive_file_id)

          if (error) {
            results.errors.push(`Update error for ${doc.name}: ${error.message}`)
          } else {
            results.updated++
          }
        } else {
          // Insert new
          const { error } = await supabase
            .from('knowledge_documents')
            .insert({
              drive_file_id: doc.drive_file_id,
              name: doc.name,
              mime_type: doc.mime_type,
              folder_path: doc.folder_path || null,
              content: doc.content,
              url: doc.url || null,
              last_modified: doc.last_modified,
              synced_at: new Date().toISOString(),
            })

          if (error) {
            // If table doesn't exist, return helpful error
            if (error.message.includes('knowledge_documents')) {
              return Response.json({
                error: 'Table knowledge_documents does not exist. Please create it in Supabase.',
                sql: CREATE_TABLE_SQL,
              }, { status: 500 })
            }
            results.errors.push(`Insert error for ${doc.name}: ${error.message}`)
          } else {
            results.created++
          }
        }

        results.processed++
      } catch (err) {
        results.errors.push(`Processing error: ${(err as Error).message}`)
      }
    }

    return Response.json(results)
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

// GET — list all synced documents
export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-webhook-secret')
  const isInternal = request.headers.get('x-internal') === 'true'

  if (!isInternal && secret !== process.env.WEBHOOK_SECRET) {
    // Check for cookie auth (from settings page)
    const cookie = request.cookies.get('crm_auth')
    if (cookie?.value !== 'authenticated') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const { data, error } = await supabase
      .from('knowledge_documents')
      .select('id, drive_file_id, name, mime_type, folder_path, url, last_modified, synced_at')
      .order('name')

    if (error) {
      // Table might not exist yet
      if (error.message.includes('knowledge_documents')) {
        return Response.json({ documents: [], needsSetup: true, sql: CREATE_TABLE_SQL })
      }
      throw error
    }

    return Response.json({ documents: data || [] })
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

const CREATE_TABLE_SQL = `
CREATE TABLE knowledge_documents (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  drive_file_id text UNIQUE NOT NULL,
  name text NOT NULL,
  mime_type text,
  folder_path text,
  content text NOT NULL,
  url text,
  last_modified timestamptz,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;

-- Allow all operations (single-user CRM)
CREATE POLICY "Allow all" ON knowledge_documents FOR ALL USING (true) WITH CHECK (true);

-- Index for fast lookup
CREATE INDEX idx_knowledge_documents_drive_file_id ON knowledge_documents(drive_file_id);
`
