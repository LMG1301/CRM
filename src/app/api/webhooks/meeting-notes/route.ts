import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toLocalDateString } from '@/lib/utils'

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
        const matchedProspects = await findMatchingProspects(
          note.companies_mentioned,
          note.participants
        )

        if (matchedProspects.length > 0) {
          results.prospects_matched += matchedProspects.length
        }

        // 2. Build structured content for the activity (richer, 5+ lines)
        const activityContent = buildMeetingActivityContent(note)

        // 3. Create meeting activity for each matched prospect
        for (const match of matchedProspects) {
          // Check if already synced (avoid duplicates)
          const { data: existing } = await supabase
            .from('activities')
            .select('id')
            .eq('prospect_id', match.id)
            .eq('type', 'meeting')
            .contains('metadata', { gmail_message_id: note.gmail_message_id })
            .limit(1)

          if (existing && existing.length > 0) continue

          const { error: activityError } = await supabase
            .from('activities')
            .insert({
              prospect_id: match.id,
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
                match_reason: match.match_reason,
              },
            })

          if (!activityError) {
            results.activities_created++

            // Update date_dernier_contact
            await supabase
              .from('prospects')
              .update({
                date_dernier_contact: toLocalDateString(new Date(note.meeting_date)),
              })
              .eq('id', match.id)
          } else {
            results.errors.push(`Activity insert: ${activityError.message}`)
          }
        }

        // 4. If no prospect matched, create activity without prospect link
        if (matchedProspects.length === 0) {
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
 * Returns prospect IDs along with the reason they matched
 */
async function findMatchingProspects(
  companies: string[],
  participants: string[]
): Promise<Array<{ id: string; match_reason: string }>> {
  const matches = new Map<string, string[]>()

  // Search by company name
  for (const company of companies) {
    if (company.length < 2) continue

    const { data } = await supabase
      .from('prospects')
      .select('id, prenom, nom, entreprise')
      .ilike('entreprise', `%${company}%`)

    if (data) {
      data.forEach((p) => {
        const reasons = matches.get(p.id) || []
        reasons.push(`Entreprise "${p.entreprise}" ≈ "${company}"`)
        matches.set(p.id, reasons)
      })
    }
  }

  // Search by participant name (first name or last name)
  for (const name of participants) {
    if (name.length < 2 || name.toLowerCase() === 'speaker') continue

    // Split name into parts for better matching
    const nameParts = name.split(/\s+/).filter(p => p.length >= 2)

    for (const part of nameParts) {
      const { data } = await supabase
        .from('prospects')
        .select('id, prenom, nom')
        .or(`prenom.ilike.%${part}%,nom.ilike.%${part}%`)

      if (data) {
        data.forEach((p) => {
          const reasons = matches.get(p.id) || []
          reasons.push(`Participant "${name}" ≈ ${p.prenom} ${p.nom}`)
          matches.set(p.id, reasons)
        })
      }
    }
  }

  return Array.from(matches.entries()).map(([id, reasons]) => ({
    id,
    // Deduplicate reasons
    match_reason: [...new Set(reasons)].join(' | '),
  }))
}

/**
 * Build readable meeting content for the activity feed.
 * Produces a rich summary (5+ lines minimum) with sections, participants, and key points.
 */
function buildMeetingActivityContent(note: IncomingMeetingNote): string {
  const parts: string[] = []

  // Title line
  parts.push(`📋 Reunion : ${note.meeting_title}`)

  // Date & participants
  if (note.meeting_date) {
    const dateStr = new Date(note.meeting_date).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    parts.push(`📅 Date : ${dateStr}`)
  }

  if (note.participants.length > 0) {
    parts.push(`👥 Participants : ${note.participants.join(', ')}`)
  }

  if (note.companies_mentioned.length > 0) {
    parts.push(`🏢 Entreprises : ${note.companies_mentioned.join(', ')}`)
  }

  // Full summary (not truncated)
  if (note.summary) {
    parts.push(`\n📝 Resume :\n${note.summary}`)
  }

  // Include all sections content for a rich overview
  if (note.sections.length > 0) {
    for (const section of note.sections) {
      // Truncate very long sections to ~500 chars in activity feed
      const content = section.content.length > 500
        ? section.content.substring(0, 500) + '...'
        : section.content
      parts.push(`\n🔹 ${section.title} :\n${content}`)
    }
  }

  // Action items
  if (note.action_items.length > 0) {
    parts.push('\n✅ Actions a suivre :')
    for (const item of note.action_items) {
      const assignee = item.assignee ? ` → ${item.assignee}` : ''
      parts.push(`  • ${item.text}${assignee}`)
    }
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
