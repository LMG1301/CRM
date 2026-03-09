import { supabase } from '@/lib/supabase'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { getGmailAccessToken, buildMimeMessage, sendGmailMessage } from '@/lib/gmail'
import { toLocalDateString } from '@/lib/utils'
import type { SequenceStep } from '@/lib/types'

/**
 * Process a sequence step: generate email via AI, then send (auto) or save as pending (semi_auto).
 *
 * POST /api/sequences/process-step
 * Body: { enrollment_id }
 * Auth: x-webhook-secret (called by cron) or direct
 */
export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY non configure' }, { status: 500 })
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const { enrollment_id } = await request.json()
    if (!enrollment_id) {
      return Response.json({ error: 'enrollment_id requis' }, { status: 400 })
    }

    // Load enrollment with joins
    const { data: enrollment, error: enrErr } = await supabase
      .from('sequence_enrollments')
      .select('*, sequence:sequences(*), prospect:prospects(*)')
      .eq('id', enrollment_id)
      .eq('status', 'active')
      .single()

    if (enrErr || !enrollment) {
      return Response.json({ error: 'Enrollment non trouve ou inactif' }, { status: 404 })
    }

    const sequence = enrollment.sequence
    const prospect = enrollment.prospect
    if (!sequence || !prospect) {
      return Response.json({ error: 'Sequence ou prospect manquant' }, { status: 404 })
    }

    const steps = sequence.steps as SequenceStep[]
    const nextStepIndex = enrollment.current_step // 0-indexed position for next step
    if (nextStepIndex >= steps.length) {
      // All steps done — mark completed
      await supabase
        .from('sequence_enrollments')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', enrollment_id)
      return Response.json({ completed: true })
    }

    const step = steps[nextStepIndex]
    const stepPosition = nextStepIndex + 1
    const totalSteps = steps.length

    // Check auto-stop: has prospect replied since enrollment?
    const { data: replies } = await supabase
      .from('activities')
      .select('id')
      .eq('prospect_id', prospect.id)
      .eq('type', 'email_received')
      .gte('created_at', enrollment.enrolled_at)
      .limit(1)

    if (replies && replies.length > 0) {
      await supabase
        .from('sequence_enrollments')
        .update({
          status: 'stopped_reply',
          stopped_at: new Date().toISOString(),
          stopped_reason: 'Prospect a repondu par email',
        })
        .eq('id', enrollment_id)
      return Response.json({ stopped: 'reply' })
    }

    // Load context for AI generation
    const [emailsResult, activitiesResult, bizResult] = await Promise.all([
      supabase
        .from('emails')
        .select('subject, body_preview, direction, gmail_date')
        .eq('prospect_id', prospect.id)
        .order('gmail_date', { ascending: false })
        .limit(5),
      supabase
        .from('activities')
        .select('type, content, created_at')
        .eq('prospect_id', prospect.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('business_context')
        .select('company_name, tone_and_style, email_signature')
        .limit(1)
        .single(),
    ])

    const recentEmails = emailsResult.data || []
    const recentActivities = activitiesResult.data || []
    const bizContext = bizResult.data

    // Build previous steps context
    const previousStepsContext = recentEmails
      .filter(e => e.direction === 'sent')
      .slice(0, nextStepIndex)
      .map((e, i) =>
        `- Etape ${i + 1}: Objet "${e.subject || '(sans objet)'}" — ${(e.body_preview || '').slice(0, 150)}`
      )
      .join('\n') || 'Aucun email envoye dans cette sequence encore.'

    const emailHistory = recentEmails.map(e => {
      const dir = e.direction === 'sent' ? 'Nous avons envoye' : 'Il/elle a repondu'
      return `- ${dir}: "${e.subject || '(sans objet)'}" — ${(e.body_preview || '').slice(0, 100)}`
    }).join('\n')

    const activityHistory = recentActivities.map(a =>
      `- ${a.type}: ${(a.content || '').slice(0, 120)}`
    ).join('\n')

    // AI Generation
    const model = resolveModel('generate-sequence-email')
    const anthropic = getAnthropicClient()

    const systemPrompt = `Tu es ${bizContext?.company_name ? `Louis Matar, Business Development chez ${bizContext.company_name}` : 'un commercial B2B'}.
Tu rediges l'email etape ${stepPosition}/${totalSteps} d'une sequence de prospection en francais.

## Contexte de la sequence
- Nom: ${sequence.name}
- Description: ${sequence.description || 'Sequence de prospection'}
- Etape actuelle: ${stepPosition} sur ${totalSteps}
- Instruction pour cette etape: ${step.prompt_hint}
${step.subject_hint ? `- Indication objet: ${step.subject_hint}` : ''}

## Etapes precedentes envoyees
${previousStepsContext}

## Regles strictes
- Email court et percutant (max 150 mots, 3 paragraphes max)
- Personnalise en fonction du profil du prospect ET de l'historique
- ${stepPosition === 1 ? 'Premier contact, pas de reference a un echange precedent' : 'Relance, fais reference au(x) message(s) precedent(s) sans copier le contenu'}
- CTA clair adapte a l'etape
- ${bizContext?.tone_and_style || 'Ton professionnel mais humain'}

## Anti-patterns (INTERDIT)
- "J'espere que vous allez bien", "Suite a notre dernier echange", "Je me permets de"
- Ouvre DIRECTEMENT par la valeur : un fait sectoriel, une question pertinente, un insight

Reponds UNIQUEMENT en JSON valide:
{"subject": "...", "body_html": "<p>...</p>", "body_text": "..."}`

    const userMessage = [
      `Destinataire: ${prospect.prenom} ${prospect.nom}`,
      prospect.entreprise && `Entreprise: ${prospect.entreprise}`,
      prospect.fonction && `Fonction: ${prospect.fonction}`,
      `Stage pipeline: ${prospect.pipeline_stage}`,
      '',
      emailHistory ? `Historique emails recents:\n${emailHistory}` : 'Pas d\'echanges email precedents.',
      activityHistory ? `\nDernieres activites:\n${activityHistory}` : '',
      '',
      `Genere l'email pour l'etape ${stepPosition}: "${step.prompt_hint}"`,
    ].filter(Boolean).join('\n')

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 600,
      system: [
        {
          type: 'text' as const,
          text: systemPrompt,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: [{ role: 'user', content: userMessage }],
    })

    logApiUsage({
      endpoint: 'generate-sequence-email',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    let rawText = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) rawText = fenceMatch[1].trim()

    const parsed = JSON.parse(rawText)
    const generatedEmail = {
      subject: parsed.subject || '',
      body_html: parsed.body_html || '',
      body_text: parsed.body_text || '',
      generated_at: new Date().toISOString(),
      step_position: stepPosition,
    }

    // Semi-auto: save as pending for review
    if (enrollment.send_mode === 'semi_auto') {
      await supabase
        .from('sequence_enrollments')
        .update({ pending_email: generatedEmail })
        .eq('id', enrollment_id)

      return Response.json({ generated: true, pending_review: true, step: stepPosition })
    }

    // Auto mode: send directly
    const accessToken = await getGmailAccessToken()
    if (!accessToken) {
      // Can't send — save as pending instead
      await supabase
        .from('sequence_enrollments')
        .update({ pending_email: generatedEmail })
        .eq('id', enrollment_id)
      return Response.json({ generated: true, pending_review: true, gmail_error: true })
    }

    const prospectEmail = prospect.email || prospect.email_pro
    if (!prospectEmail) {
      return Response.json({ error: 'Prospect sans adresse email' }, { status: 400 })
    }

    // Get sender profile
    const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const profile = await profileRes.json()
    const fromEmail = profile.emailAddress || 'noreply@boostinc.com'

    const mime = buildMimeMessage({
      from: fromEmail,
      to: prospectEmail,
      subject: generatedEmail.subject,
      htmlBody: generatedEmail.body_html,
      signature: bizContext?.email_signature || undefined,
    })

    const result = await sendGmailMessage(accessToken, mime)

    // Store email
    await supabase.from('emails').insert({
      gmail_message_id: result.id,
      gmail_thread_id: result.threadId || null,
      subject: generatedEmail.subject,
      from_email: fromEmail,
      to_email: prospectEmail,
      body_html: generatedEmail.body_html,
      body_text: generatedEmail.body_text,
      body_preview: generatedEmail.body_text.slice(0, 500),
      direction: 'sent',
      labels: ['SENT'],
      is_read: true,
      gmail_date: new Date().toISOString(),
      prospect_id: prospect.id,
    })

    // Create activity
    await supabase.from('activities').insert({
      prospect_id: prospect.id,
      type: 'email_sent',
      content: `[Sequence: ${sequence.name} — Etape ${stepPosition}] Objet : ${generatedEmail.subject}\n\n${generatedEmail.body_text.slice(0, 3000)}`,
      metadata: {
        gmail_message_id: result.id,
        subject: generatedEmail.subject,
        from: fromEmail,
        to: prospectEmail,
        source: 'sequence',
        sequence_id: sequence.id,
        step: stepPosition,
      },
    })

    // Update prospect
    const today = toLocalDateString(new Date())
    await supabase
      .from('prospects')
      .update({ date_dernier_contact: today })
      .eq('id', prospect.id)

    // Advance enrollment
    const nextIndex = nextStepIndex + 1
    if (nextIndex >= steps.length) {
      await supabase
        .from('sequence_enrollments')
        .update({
          current_step: nextIndex,
          status: 'completed',
          completed_at: new Date().toISOString(),
          pending_email: null,
        })
        .eq('id', enrollment_id)
    } else {
      const nextDelay = steps[nextIndex].delay_days || 1
      const nextDate = new Date()
      nextDate.setDate(nextDate.getDate() + nextDelay)

      await supabase
        .from('sequence_enrollments')
        .update({
          current_step: nextIndex,
          next_step_date: toLocalDateString(nextDate),
          pending_email: null,
        })
        .eq('id', enrollment_id)
    }

    return Response.json({ sent: true, step: stepPosition })
  } catch (error) {
    const parsed = parseAnthropicError(error)
    return Response.json({ error: parsed }, { status: 500 })
  }
}
