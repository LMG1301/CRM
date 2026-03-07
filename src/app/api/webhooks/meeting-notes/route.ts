import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Webhook endpoint for Genspark Meeting Notes sync.
 * Receives parsed meeting notes from Google Apps Script and:
 * 1. Matches companies/participants to existing prospects
 * 2. Creates 'meeting' activities linked to prospects
 * 3. Stores full meeting notes in knowledge_documents for AI context
 */

interface MeetingNoteSection {
  title: string
  content: string
}

interface ActionItem {
  text: string
  assignee: string | null
}

interface IncomingMeetingNote {
  gmail_message_id: string
  gmail_thread_id?: string
  subject: string
  meeting_title: string
  meeting_date: string
  summary: string
  sections: MeetingNoteSection[]
  action_items: ActionItem[]
  participants: string[]
  companies_mentioned: string[]
  full_text: string
  gmail_date: string
}

export async function POST(request: NextRequest) {
  try {
    // Verify webhook secret
    const secret = request.headers.get('x-webhook-secret')
    if (secret !== process.env.WEBHOOK_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const notes: IncomingMeetingNote[] = Array.isArray(body) ? body : [body]

    if (notes.length === 0) {
      return Response.json({ message: 'No meeting notes to process' })
    }

    const results = {
      processed: 0,
      activities_created: 0,
      knowledge_docs_created: 0,
      prospects_matched: 0,
      errors: [] as string[],
    }

    for (const note of notes) {
      try {
        // 1. Find matching prospects by company name or participant name
        const matchedProspectIds = await findMatchingProspects(
          note.companies_mentioned,
          note.participants
        )

        if (matchedProspectIds.length > 0) {
          results.prospects_matched += matchedProspectIds.length
        }

        // 2. Build structured content for the activity
        const activityContent = buildMeetingActivityContent(note)

        // 3. Create meeting activity for each matched prospect
        for (const prospectId of matchedProspectIds) {
          // Check if already synced (avoid duplicates)
          const { data: existing } = await supabase
            .from('activities')
            .select('id')
            .eq('prospect_id', prospectId)
            .eq('type', 'meeting')
            .contains('metadata', { gmail_message_id: note.gmail_message_id })
            .limit(1)

          if (existing && existing.length > 0) continue

          const { error: activityError } = await supabase
            .from('activities')
            .insert({
              prospect_id: prospectId,
              type: 'meeting',
              content: activityContent,
              metadata: {
                gmail_message_id: note.gmail_message_id,
                meeting_title: note.meeting_title,
                meeting_date: note.meeting_date,
                participants: note.participants,
                companies: note.companies_mentioned,
                action_items: note.action_items,
                source: 'genspark',
              },
            })

          if (!activityError) {
            results.activities_created++

            // Update date_dernier_contact
            await supabase
              .from('prospects')
              .update({
                date_dernier_contact: new Date(note.meeting_date).toISOString().split('T')[0],
              })
              .eq('id', prospectId)
          } else {
            results.errors.push(`Activity insert: ${activityError.message}`)
          }
        }

        // 4. If no prospect matched, create activity without prospect link
        // (still stored in knowledge_documents for AI context)
        if (matchedProspectIds.length === 0) {
          // Store as unlinked activity so it shows up somewhere
          const { error: unlinkedError } = await supabase
            .from('activities')
            .insert({
              prospect_id: null as unknown as string,
              type: 'meeting',
              content: activityContent,
              metadata: {
                gmail_message_id: note.gmail_message_id,
                meeting_title: note.meeting_title,
                meeting_date: note.meeting_date,
                participants: note.participants,
                companies: note.companies_mentioned,
                action_items: note.action_items,
                source: 'genspark',
                unmatched: true,
              },
            })

          if (unlinkedError) {
            // prospect_id might be NOT NULL — that's ok, we still save to knowledge_documents
          }
        }

        // 5. Store in knowledge_documents for AI context
        const docContent = buildKnowledgeDocContent(note)

        const { error: docError } = await supabase
          .from('knowledge_documents')
          .upsert(
            {
              drive_file_id: `genspark_${note.gmail_message_id}`,
              name: `Meeting: ${note.meeting_title}`,
              mime_type: 'text/meeting-notes',
              folder_path: 'Genspark Meeting Notes',
              content: docContent,
              url: null,
              last_modified: note.meeting_date,
              synced_at: new Date().toISOString(),
            },
            { onConflict: 'drive_file_id' }
          )

        if (!docError) {
          results.knowledge_docs_created++
        } else {
          results.errors.push(`Knowledge doc: ${docError.message}`)
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

/**
 * Find prospects matching companies or participant names
 */
async function findMatchingProspects(
  companies: string[],
  participants: string[]
): Promise<string[]> {
  const prospectIds = new Set<string>()

  // Search by company name
  for (const company of companies) {
    if (company.length < 2) continue

    const { data } = await supabase
      .from('prospects')
      .select('id')
      .ilike('entreprise', `%${company}%`)

    if (data) {
      data.forEach((p) => prospectIds.add(p.id))
    }
  }

  // Search by participant name (first name or last name)
  for (const name of participants) {
    if (name.length < 2 || name.toLowerCase() === 'speaker') continue

    const { data } = await supabase
      .from('prospects')
      .select('id')
      .or(`prenom.ilike.%${name}%,nom.ilike.%${name}%`)

    if (data) {
      data.forEach((p) => prospectIds.add(p.id))
    }
  }

  return Array.from(prospectIds)
}

/**
 * Build readable meeting content for the activity feed
 */
function buildMeetingActivityContent(note: IncomingMeetingNote): string {
  const parts: string[] = []

  parts.push(`Reunion : ${note.meeting_title}`)

  if (note.summary) {
    parts.push(`\nResume : ${note.summary}`)
  }

  if (note.action_items.length > 0) {
    parts.push('\nActions :')
    for (const item of note.action_items) {
      const assignee = item.assignee ? ` (${item.assignee})` : ''
      parts.push(`- ${item.text}${assignee}`)
    }
  }

  if (note.companies_mentioned.length > 0) {
    parts.push(`\nEntreprises : ${note.companies_mentioned.join(', ')}`)
  }

  return parts.join('\n')
}

/**
 * Build full document content for knowledge base (AI context)
 */
function buildKnowledgeDocContent(note: IncomingMeetingNote): string {
  const parts: string[] = []

  parts.push(`# ${note.meeting_title}`)
  parts.push(`Date: ${note.meeting_date}`)

  if (note.participants.length > 0) {
    parts.push(`Participants: ${note.participants.join(', ')}`)
  }

  if (note.companies_mentioned.length > 0) {
    parts.push(`Entreprises: ${note.companies_mentioned.join(', ')}`)
  }

  parts.push('')

  if (note.summary) {
    parts.push(`## Resume`)
    parts.push(note.summary)
    parts.push('')
  }

  for (const section of note.sections) {
    parts.push(`## ${section.title}`)
    parts.push(section.content)
    parts.push('')
  }

  if (note.action_items.length > 0) {
    parts.push(`## Actions a suivre`)
    for (const item of note.action_items) {
      const assignee = item.assignee ? ` → ${item.assignee}` : ''
      parts.push(`- ${item.text}${assignee}`)
    }
  }

  return parts.join('\n')
}
