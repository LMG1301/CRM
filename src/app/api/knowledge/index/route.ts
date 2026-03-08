import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateDocumentSummary } from '@/lib/knowledge-summary'

export const dynamic = 'force-dynamic'

/**
 * POST /api/knowledge/index
 *
 * Batch-generate summaries for all documents that don't have one yet.
 * Can be triggered manually from the UI via a "Re-indexer" button.
 */
export async function POST(request: NextRequest) {
  try {
    const cookie = request.cookies.get('crm_auth')?.value
    if (cookie !== 'authenticated') {
      return NextResponse.json({ error: 'Non autorise' }, { status: 401 })
    }

    // Fetch documents without a summary
    const { data: docs, error } = await supabase
      .from('knowledge_documents')
      .select('id, name, content')
      .is('summary', null)
      .order('name')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!docs || docs.length === 0) {
      return NextResponse.json({ indexed: 0, message: 'Tous les documents ont deja un resume.' })
    }

    let indexed = 0
    let skipped = 0

    for (const doc of docs) {
      const summary = await generateDocumentSummary(doc.name, doc.content || '')

      if (summary) {
        const { error: updateError } = await supabase
          .from('knowledge_documents')
          .update({ summary })
          .eq('id', doc.id)

        if (!updateError) {
          indexed++
        }
      } else {
        skipped++
      }
    }

    return NextResponse.json({
      indexed,
      skipped,
      total: docs.length,
      message: `${indexed} document${indexed > 1 ? 's' : ''} indexe${indexed > 1 ? 's' : ''}`,
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
