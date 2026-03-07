import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

/**
 * Sync emails for a specific prospect:
 * 1. Find unlinked emails matching prospect's email addresses
 * 2. Link them and create activities
 * 3. Run auto-progression
 */

const MY_EMAILS = [
  'louis.matar@boostinc.com',
  'louis.matar.gueye@gmail.com',
]

function isMyEmail(email: string): boolean {
  return MY_EMAILS.some(me => email.toLowerCase().trim() === me.toLowerCase())
}

// Stage progression order (simplified pipeline)
const STAGE_ORDER: Record<string, number> = {
  ciblage: 1, touch_1: 2, repondu: 3, devis: 4, client: 5, refuse: 6,
}

const DEVIS_KEYWORDS = ['devis', 'proposition', 'offre commerciale', 'proposal', 'quotation', 'prix', 'tarif']
const CLIENT_KEYWORDS = ['accord', 'signe', 'commande', 'valide', 'ok pour', 'go pour', 'on lance']

const STAGE_NAMES: Record<string, string> = {
  ciblage: 'Ciblage', touch_1: 'Contacte', repondu: 'Repondu',
  devis: 'Devis envoye', client: 'Client', refuse: 'Perdu',
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: prospectId } = await params

    // Get prospect
    const { data: prospect, error: pErr } = await supabase
      .from('prospects')
      .select('id, email, email_pro, pipeline_stage')
      .eq('id', prospectId)
      .single()

    if (pErr || !prospect) {
      return Response.json({ error: 'Prospect introuvable' }, { status: 404 })
    }

    const results = { emails_linked: 0, activities_created: 0, stage_updated: false, new_stage: null as string | null }

    // Find all emails matching this prospect's email addresses
    const emailAddresses = [prospect.email, prospect.email_pro].filter(Boolean) as string[]
    if (emailAddresses.length === 0) {
      return Response.json({ ...results, message: 'Aucune adresse email sur ce prospect' })
    }

    // Build OR filter for from_email/to_email matching prospect's addresses
    const orFilters = emailAddresses.flatMap(addr => [
      `from_email.ilike.${addr}`,
      `to_email.ilike.${addr}`,
    ]).join(',')

    const { data: emails } = await supabase
      .from('emails')
      .select('*')
      .or(orFilters)
      .order('gmail_date', { ascending: true })

    if (!emails || emails.length === 0) {
      return Response.json({ ...results, message: 'Aucun email trouve pour ces adresses' })
    }

    for (const email of emails) {
      // Fix direction
      const correctDirection = isMyEmail(email.from_email) ? 'sent' : 'received'

      // Link email to prospect if not already linked
      if (!email.prospect_id || email.prospect_id !== prospectId) {
        await supabase
          .from('emails')
          .update({ prospect_id: prospectId, direction: correctDirection })
          .eq('id', email.id)
        results.emails_linked++
      } else if (email.direction !== correctDirection) {
        await supabase
          .from('emails')
          .update({ direction: correctDirection })
          .eq('id', email.id)
      }

      // Create activity if missing
      const { data: existingActivity } = await supabase
        .from('activities')
        .select('id')
        .eq('prospect_id', prospectId)
        .contains('metadata', { gmail_message_id: email.gmail_message_id })
        .limit(1)

      if (!existingActivity || existingActivity.length === 0) {
        const actType = correctDirection === 'sent' ? 'email_sent' : 'email_received'
        const subject = email.subject || '(Sans objet)'
        const body = email.body_text || email.body_preview || ''
        const content = body ? `Objet : ${subject}\n\n${body}` : `Objet : ${subject}`

        await supabase.from('activities').insert({
          prospect_id: prospectId,
          type: actType,
          content,
          metadata: {
            gmail_message_id: email.gmail_message_id,
            subject: email.subject,
            from: email.from_email,
            to: email.to_email,
            source: 'manual_sync',
          },
        })
        results.activities_created++
      }

      // Update date_dernier_contact
      const emailDate = new Date(email.gmail_date).toISOString().split('T')[0]
      await supabase
        .from('prospects')
        .update({ date_dernier_contact: emailDate })
        .eq('id', prospectId)
        .lt('date_dernier_contact', emailDate)
    }

    // Auto-progress pipeline stage
    const linkedEmails = emails
    const currentStage = prospect.pipeline_stage
    const currentOrder = STAGE_ORDER[currentStage] || 0

    if (!['client', 'refuse'].includes(currentStage)) {
      const sentCount = linkedEmails.filter(e => isMyEmail(e.from_email)).length
      const hasReceived = linkedEmails.some(e => !isMyEmail(e.from_email))

      let suggestedStage: string | null = null
      let suggestedOrder = currentOrder

      // Any sent email → Contacté
      if (sentCount >= 1 && STAGE_ORDER.touch_1 > suggestedOrder) {
        suggestedStage = 'touch_1'; suggestedOrder = STAGE_ORDER.touch_1
      }

      // Prospect responded → Répondu
      if (hasReceived && STAGE_ORDER.repondu > suggestedOrder) {
        suggestedStage = 'repondu'; suggestedOrder = STAGE_ORDER.repondu
      }

      for (const email of linkedEmails) {
        const text = [email.subject, email.body_text, email.body_preview].filter(Boolean).join(' ').toLowerCase()
        const dir = isMyEmail(email.from_email) ? 'sent' : 'received'

        if (dir === 'sent' && DEVIS_KEYWORDS.some(kw => text.includes(kw)) && STAGE_ORDER.devis > suggestedOrder) {
          suggestedStage = 'devis'; suggestedOrder = STAGE_ORDER.devis
        }
        if (dir === 'received' && CLIENT_KEYWORDS.some(kw => text.includes(kw)) && STAGE_ORDER.client > suggestedOrder) {
          suggestedStage = 'client'; suggestedOrder = STAGE_ORDER.client
        }
      }

      if (suggestedStage && suggestedOrder > currentOrder) {
        await supabase.from('prospects').update({ pipeline_stage: suggestedStage }).eq('id', prospectId)
        await supabase.from('activities').insert({
          prospect_id: prospectId,
          type: 'status_change',
          content: `Pipeline auto (sync) : ${STAGE_NAMES[currentStage] || currentStage} → ${STAGE_NAMES[suggestedStage] || suggestedStage}`,
          metadata: { from: currentStage, to: suggestedStage, source: 'manual_sync' },
        })
        results.stage_updated = true
        results.new_stage = suggestedStage
      }
    }

    return Response.json(results)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
