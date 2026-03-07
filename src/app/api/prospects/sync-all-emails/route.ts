import { supabase } from '@/lib/supabase'

const MY_EMAILS = [
  'louis.matar@boostinc.com',
  'louis.matar.gueye@gmail.com',
]

function isMyEmail(email: string): boolean {
  return MY_EMAILS.some(me => email.toLowerCase().trim() === me.toLowerCase())
}

/**
 * Bulk sync: link all unlinked emails to existing prospects.
 * Matches by email/email_pro addresses.
 */
export async function POST() {
  try {
    const results = {
      prospects_checked: 0,
      emails_linked: 0,
      already_linked: 0,
      no_match: 0,
    }

    // Get all prospects with email addresses
    const { data: prospects } = await supabase
      .from('prospects')
      .select('id, email, email_pro, prenom, nom')
      .not('pipeline_stage', 'eq', 'refuse')

    if (!prospects || prospects.length === 0) {
      return Response.json({ ...results, message: 'Aucun prospect' })
    }

    results.prospects_checked = prospects.length

    // Get all unlinked emails (prospect_id is null)
    const { data: unlinkedEmails } = await supabase
      .from('emails')
      .select('id, from_email, to_email, gmail_message_id')
      .is('prospect_id', null)

    if (!unlinkedEmails || unlinkedEmails.length === 0) {
      // Still try to link emails that might be wrongly assigned
      // Also check for emails that match but are linked to wrong prospect
      return Response.json({ ...results, message: `${results.prospects_checked} prospects verifies, aucun email orphelin` })
    }

    // Build a lookup map: email address → prospect IDs
    const emailToProspect = new Map<string, string>()
    for (const p of prospects) {
      if (p.email) emailToProspect.set(p.email.toLowerCase().trim(), p.id)
      if (p.email_pro) emailToProspect.set(p.email_pro.toLowerCase().trim(), p.id)
    }

    // Link unlinked emails
    for (const email of unlinkedEmails) {
      const contactEmail = isMyEmail(email.from_email) ? email.to_email : email.from_email
      const contactLower = contactEmail.toLowerCase().trim()

      const prospectId = emailToProspect.get(contactLower)
      if (prospectId) {
        const direction = isMyEmail(email.from_email) ? 'sent' : 'received'
        await supabase
          .from('emails')
          .update({ prospect_id: prospectId, direction })
          .eq('id', email.id)
        results.emails_linked++
      } else {
        results.no_match++
      }
    }

    return Response.json(results)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
