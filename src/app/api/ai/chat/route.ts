import { NextRequest } from 'next/server'
import { buildSystemPrompt } from '@/lib/ai-prompts'
import { getProspect, getActivities, getBusinessContext, getKnowledgeDocuments, getProspectsSummary, getProspectEmails, getDealGroupMembers } from '@/lib/actions'
import type { Email } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { getAnthropicClient, parseAnthropicError } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage, enforceBudget } from '@/lib/api-usage'
import { getCalendarEvents, type CalendarEvent } from '@/lib/calendar'
import type { Prospect } from '@/lib/types'

// ─── CRM Query Tool executor ───

async function executeCrmQuery(input: { data_type: string; filters?: string }): Promise<unknown> {
  const { data_type, filters } = input

  // Fetch valid pipeline stages from DB (used by multiple cases)
  const { data: dbStages } = await supabase
    .from('pipeline_stages')
    .select('slug, is_terminal, is_default')
    .order('position')
  const validStageSlugs = (dbStages || []).map(s => s.slug)

  switch (data_type) {
    case 'prospects': {
      let query = supabase
        .from('prospects')
        .select('prenom, nom, entreprise, pipeline_stage, email, date_dernier_contact, date_prochaine_action, type_prochaine_action')
        .order('date_dernier_contact', { ascending: false, nullsFirst: false })
        .limit(50)

      if (filters) {
        if (validStageSlugs.includes(filters.toLowerCase())) {
          query = query.eq('pipeline_stage', filters.toLowerCase())
        } else {
          query = query.ilike('entreprise', `%${filters}%`)
        }
      }

      const { data, error } = await query
      if (error) return { error: error.message }
      return { prospects: data, count: data?.length || 0 }
    }

    case 'clients': {
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise, pipeline_stage, email, date_dernier_contact')
        .in('pipeline_stage', ['client', 'onboarding'])
        .order('date_dernier_contact', { ascending: false })

      if (!prospects || prospects.length === 0) return { clients: [], count: 0 }

      const prospectIds = prospects.map(p => p.id)
      const { data: machines } = await supabase
        .from('client_machines')
        .select('prospect_id, machine_type, quantity, installed_at')
        .in('prospect_id', prospectIds)

      const result = prospects.map(p => ({
        ...p,
        machines: (machines || []).filter(m => m.prospect_id === p.id),
      }))

      return { clients: result, count: result.length }
    }

    case 'entreprises': {
      const { data } = await supabase
        .from('prospects')
        .select('entreprise, pipeline_stage')

      if (!data) return { entreprises: [], count: 0 }

      const grouped: Record<string, { count: number; stages: Set<string> }> = {}
      for (const p of data) {
        const ent = p.entreprise || 'Sans entreprise'
        if (!grouped[ent]) grouped[ent] = { count: 0, stages: new Set() }
        grouped[ent].count++
        grouped[ent].stages.add(p.pipeline_stage)
      }

      const result = Object.entries(grouped)
        .filter(([, v]) => v.count > 1)
        .map(([name, v]) => ({ entreprise: name, contacts: v.count, stages: [...v.stages] }))
        .sort((a, b) => b.contacts - a.contacts)
        .slice(0, 50)

      return { entreprises: result, count: result.length }
    }

    case 'activites_recentes': {
      const days = filters ? parseInt(filters) || 7 : 7
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from('activities')
        .select('type, content, created_at, prospect_id')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(30)

      if (!data || data.length === 0) return { activites: [], count: 0 }

      const prospectIds = [...new Set(data.map(a => a.prospect_id))]
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .in('id', prospectIds)

      const pMap = new Map((prospects || []).map(p => [p.id, p]))

      const result = data.map(a => {
        const p = pMap.get(a.prospect_id)
        return {
          type: a.type,
          content: a.content?.substring(0, 200),
          date: new Date(a.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
          prospect: p ? `${p.prenom} ${p.nom}` : 'Inconnu',
          entreprise: p?.entreprise || '',
        }
      })

      return { activites: result, count: result.length, periode: `${days} derniers jours` }
    }

    case 'emails_recents': {
      const days = filters ? parseInt(filters) || 7 : 7
      const since = new Date()
      since.setDate(since.getDate() - days)

      const { data } = await supabase
        .from('emails')
        .select('subject, from_email, to_email, gmail_date, direction, prospect_id')
        .gte('gmail_date', since.toISOString())
        .order('gmail_date', { ascending: false })
        .limit(20)

      if (!data || data.length === 0) return { emails: [], count: 0 }

      const prospectIds = [...new Set(data.map(e => e.prospect_id).filter(Boolean))]
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom')
        .in('id', prospectIds)

      const pMap = new Map((prospects || []).map(p => [p.id, p]))

      const result = data.map(e => {
        const p = e.prospect_id ? pMap.get(e.prospect_id) : null
        return {
          subject: e.subject,
          from: e.from_email,
          to: e.to_email,
          date: new Date(e.gmail_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          direction: e.direction === 'sent' ? 'Envoye' : 'Recu',
          prospect: p ? `${p.prenom} ${p.nom}` : null,
        }
      })

      return { emails: result, count: result.length }
    }

    case 'machines': {
      const { data } = await supabase
        .from('client_machines')
        .select('machine_type, quantity, installed_at, notes, prospect_id')
        .order('installed_at', { ascending: false, nullsFirst: false })

      if (!data || data.length === 0) return { machines: [], count: 0, total: 0 }

      const prospectIds = [...new Set(data.map(m => m.prospect_id))]
      const { data: prospects } = await supabase
        .from('prospects')
        .select('id, prenom, nom, entreprise')
        .in('id', prospectIds)

      const pMap = new Map((prospects || []).map(p => [p.id, p]))

      const result = data.map(m => {
        const p = pMap.get(m.prospect_id)
        return {
          machine_type: m.machine_type,
          quantity: m.quantity,
          notes: m.notes,
          installed_at: m.installed_at ? new Date(m.installed_at + 'T00:00:00').toLocaleDateString('fr-FR') : null,
          prospect: p ? `${p.prenom} ${p.nom}` : 'Inconnu',
          entreprise: p?.entreprise || '',
        }
      })

      return { machines: result, count: result.length, total: data.reduce((s, m) => s + m.quantity, 0) }
    }

    case 'pipeline_summary': {
      const { data } = await supabase
        .from('prospects')
        .select('pipeline_stage')

      if (!data) return { pipeline: {}, total: 0 }

      const counts: Record<string, number> = {}
      for (const p of data) {
        counts[p.pipeline_stage] = (counts[p.pipeline_stage] || 0) + 1
      }

      return { pipeline: counts, total: data.length }
    }

    case 'deals_bloques': {
      const threshold = new Date()
      threshold.setDate(threshold.getDate() - 21)

      // Exclude terminal + default stages (e.g. client, refuse, ciblage)
      const terminalAndDefaultSlugs = (dbStages || [])
        .filter(s => s.is_terminal || s.is_default)
        .map(s => `"${s.slug}"`).join(',') || '"client","refuse","ciblage"'

      const { data } = await supabase
        .from('prospects')
        .select('prenom, nom, entreprise, pipeline_stage, date_dernier_contact, date_prochaine_action')
        .lt('date_dernier_contact', threshold.toISOString().split('T')[0])
        .not('pipeline_stage', 'in', `(${terminalAndDefaultSlugs})`)
        .order('date_dernier_contact', { ascending: true })
        .limit(30)

      if (!data) return { bloques: [], count: 0 }

      const result = data.map(p => {
        const lastContact = p.date_dernier_contact ? new Date(p.date_dernier_contact) : null
        const daysSince = lastContact ? Math.floor((Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)) : null
        return {
          nom: `${p.prenom} ${p.nom}`,
          entreprise: p.entreprise,
          stage: p.pipeline_stage,
          dernier_contact: p.date_dernier_contact,
          jours_sans_contact: daysSince,
          prochaine_action: p.date_prochaine_action,
        }
      })

      return { bloques: result, count: result.length }
    }

    case 'calendar_this_week': {
      try {
        const calEvents = await getCalendarEvents(0, 7)
        if (!calEvents || calEvents.length === 0) return { events: [], count: 0, note: 'Aucun evenement cette semaine ou calendrier non connecte.' }

        const now = new Date()
        const day = now.getDay()
        const mondayOffset = day === 0 ? -6 : 1 - day
        const monday = new Date(now)
        monday.setDate(now.getDate() + mondayOffset)
        monday.setHours(0, 0, 0, 0)
        const sunday = new Date(monday)
        sunday.setDate(monday.getDate() + 6)
        sunday.setHours(23, 59, 59, 999)

        const thisWeek = calEvents.filter((e: CalendarEvent) => {
          const start = new Date(e.start.dateTime || e.start.date || '')
          return start >= monday && start <= sunday
        })

        const result = thisWeek.map((e: CalendarEvent) => {
          const start = new Date(e.start.dateTime || e.start.date || '')
          const dateStr = start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
          const timeStr = e.start.dateTime
            ? start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
            : 'journee entiere'
          const attendees = (e.attendees || [])
            .filter(a => !a.email?.includes('calendar.google.com'))
            .map(a => a.displayName || a.email)
          return {
            summary: e.summary,
            date: dateStr,
            time: timeStr,
            attendees: attendees.length > 0 ? attendees : undefined,
          }
        })

        return { events: result, count: result.length }
      } catch {
        return { events: [], count: 0, note: 'Calendrier non connecte.' }
      }
    }

    case 'next_actions_this_week': {
      const now = new Date()
      const day = now.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const monday = new Date(now)
      monday.setDate(now.getDate() + mondayOffset)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const mondayStr = monday.toISOString().split('T')[0]
      const sundayStr = sunday.toISOString().split('T')[0]

      const { data } = await supabase
        .from('prospects')
        .select('prenom, nom, entreprise, pipeline_stage, date_prochaine_action, type_prochaine_action, description_prochaine_action')
        .gte('date_prochaine_action', mondayStr)
        .lte('date_prochaine_action', sundayStr)
        .order('date_prochaine_action', { ascending: true })

      if (!data || data.length === 0) return { actions: [], count: 0 }

      const result = data.map(p => ({
        nom: `${p.prenom} ${p.nom}`,
        entreprise: p.entreprise,
        stage: p.pipeline_stage,
        date: p.date_prochaine_action,
        type: p.type_prochaine_action,
        description: p.description_prochaine_action,
      }))

      return { actions: result, count: result.length, semaine: `${mondayStr} au ${sundayStr}` }
    }

    case 'previous_week_tasks': {
      const now = new Date()
      const day = now.getDay()
      const mondayOffset = day === 0 ? -6 : 1 - day
      const thisMonday = new Date(now)
      thisMonday.setDate(now.getDate() + mondayOffset)
      const lastMonday = new Date(thisMonday)
      lastMonday.setDate(thisMonday.getDate() - 7)
      const lastMondayStr = lastMonday.toISOString().split('T')[0]

      const { data } = await supabase
        .from('weekly_tasks')
        .select('title, category, completed, week_start')
        .eq('week_start', lastMondayStr)
        .eq('completed', false)
        .order('category', { ascending: true })

      if (!data || data.length === 0) return { tasks: [], count: 0 }

      return { tasks: data, count: data.length, week_start: lastMondayStr }
    }

    case 'overdue_actions': {
      const today = new Date().toISOString().split('T')[0]

      // Exclude terminal stages dynamically
      const terminalSlugs = (dbStages || [])
        .filter(s => s.is_terminal)
        .map(s => `"${s.slug}"`).join(',') || '"client","refuse"'

      const { data } = await supabase
        .from('prospects')
        .select('prenom, nom, entreprise, pipeline_stage, date_prochaine_action, type_prochaine_action, description_prochaine_action, date_dernier_contact')
        .lt('date_prochaine_action', today)
        .not('pipeline_stage', 'in', `(${terminalSlugs})`)
        .order('date_prochaine_action', { ascending: true })
        .limit(20)

      if (!data || data.length === 0) return { overdue: [], count: 0 }

      const result = data.map(p => {
        const dueDate = new Date(p.date_prochaine_action + 'T00:00:00')
        const daysOverdue = Math.floor((Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        return {
          nom: `${p.prenom} ${p.nom}`,
          entreprise: p.entreprise,
          stage: p.pipeline_stage,
          date_prochaine_action: p.date_prochaine_action,
          jours_retard: daysOverdue,
          type: p.type_prochaine_action,
          description: p.description_prochaine_action,
          dernier_contact: p.date_dernier_contact,
        }
      })

      return { overdue: result, count: result.length }
    }

    case 'forecast': {
      const { data } = await supabase
        .from('prospect_forecasts')
        .select('*, prospect:prospects(prenom, nom, entreprise, pipeline_stage)')
        .order('expected_month')
        .order('probability', { ascending: false })

      if (!data || data.length === 0) return { forecast: [], count: 0, total_brut: 0, total_pondere: 0 }

      const result = data.map(f => ({
        prospect: `${f.prospect?.prenom || ''} ${f.prospect?.nom || ''}`.trim(),
        entreprise: f.prospect?.entreprise || '',
        stage: f.prospect?.pipeline_stage || '',
        produit: f.product_type,
        quantite: f.quantity,
        prix_unitaire: f.unit_price,
        total: f.total_amount,
        probabilite: f.probability,
        mois_prevu: f.expected_month,
        pondere: Math.round(f.total_amount * f.probability / 100),
        notes: f.notes,
      }))

      const totalBrut = result.reduce((s, f) => s + f.total, 0)
      const totalPondere = result.reduce((s, f) => s + f.pondere, 0)

      return {
        forecast: result,
        count: result.length,
        total_brut: totalBrut,
        total_pondere: totalPondere,
      }
    }

    default:
      return { error: `Type de donnees inconnu: ${data_type}` }
  }
}

// ─── Save Weekly Tasks executor ───

async function executeSaveWeeklyTasks(input: { tasks: Array<{ title: string; category: string }> }): Promise<unknown> {
  // Calculate current week's Monday
  const now = new Date()
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now)
  monday.setDate(diff)
  monday.setHours(0, 0, 0, 0)
  const weekStart = monday.toISOString().split('T')[0]

  // Fetch ALL uncompleted tasks (current week + carried over from previous weeks)
  // to avoid creating duplicates
  const { data: existingTasks } = await supabase
    .from('weekly_tasks')
    .select('title, completed, week_start')
    .eq('completed', false)
    .lte('week_start', weekStart)

  const existingTitles = new Set(
    (existingTasks || []).map(t => t.title.trim().toLowerCase())
  )

  // Filter out tasks that already exist (dedup by normalized title)
  const newTasks = input.tasks.filter(
    t => !existingTitles.has(t.title.trim().toLowerCase())
  )
  const skippedCount = input.tasks.length - newTasks.length

  if (newTasks.length === 0) {
    const weekNum = getISOWeekNumber(monday)
    return {
      success: true,
      message: `Aucune nouvelle tache ajoutee — les ${input.tasks.length} taches existent deja dans la checklist S${weekNum}.`,
    }
  }

  // Insert only new tasks
  const rows = newTasks.map(t => ({
    week_start: weekStart,
    category: t.category,
    title: t.title,
    completed: false,
  }))

  const { error } = await supabase.from('weekly_tasks').insert(rows)
  if (error) return { error: error.message }

  const weekNum = getISOWeekNumber(monday)

  if (skippedCount > 0) {
    return {
      success: true,
      message: `${newTasks.length} taches ajoutees a la checklist S${weekNum} (${skippedCount} deja existantes ignorees).`,
    }
  }
  return { success: true, message: `${newTasks.length} taches ajoutees a la checklist S${weekNum}.` }
}

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ─── Read Document Tool executor ───

async function executeReadDocument(input: { document_name: string }): Promise<unknown> {
  const { document_name } = input

  // Flexible search: try exact match first, then fuzzy
  let { data } = await supabase
    .from('knowledge_documents')
    .select('name, content, summary')
    .ilike('name', `%${document_name}%`)
    .limit(1)
    .maybeSingle()

  // If no match, try replacing separators with wildcards
  if (!data) {
    const fuzzyName = document_name.replace(/[_\-\.\s]+/g, '%')
    const result = await supabase
      .from('knowledge_documents')
      .select('name, content, summary')
      .ilike('name', `%${fuzzyName}%`)
      .limit(1)
      .maybeSingle()
    data = result.data
  }

  if (!data) {
    // Return list of available documents so the AI can retry
    const { data: allDocs } = await supabase
      .from('knowledge_documents')
      .select('name')
      .order('name')

    return {
      error: `Document "${document_name}" non trouve.`,
      documents_disponibles: (allDocs || []).map(d => d.name),
    }
  }

  return {
    name: data.name,
    content: data.content || '(Contenu vide)',
    summary: data.summary || null,
  }
}

// ─── Tool definitions ───

const READ_DOCUMENT_TOOL = {
  name: "read_document",
  description: "Charge le contenu complet d'un document de la base de connaissances par son nom (ou une partie du nom). Utilise cet outil systematiquement quand tu as besoin du contenu d'un document pour repondre a une question.",
  input_schema: {
    type: "object" as const,
    properties: {
      document_name: {
        type: "string",
        description: "Le nom (ou une partie du nom) du document a charger. Ex: 'Sodebo', 'offre commerciale', 'pricing'",
      },
    },
    required: ["document_name"],
  },
}

const SAVE_WEEKLY_TASKS_TOOL = {
  name: "save_weekly_tasks",
  description: "Sauvegarde une liste de taches dans la checklist hebdomadaire du dashboard. Utilise apres avoir genere un Monday Check-in ou une to-do list.",
  input_schema: {
    type: "object" as const,
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string", description: "Titre de la tache" },
            category: {
              type: "string",
              enum: ["key_priority", "follow_up", "meeting", "onboarding", "task"],
              description: "Categorie : key_priority (priorite cle), follow_up (relance), meeting (reunion), onboarding, task (autre tache)",
            },
          },
          required: ["title", "category"],
        },
        description: "Liste des taches a sauvegarder",
      },
    },
    required: ["tasks"],
  },
}

const CRM_TOOL = {
  name: "query_crm",
  description: "Interroge les donnees du CRM Boost et Google Calendar. Peut lister les prospects par etape, les clients, les entreprises, les activites recentes, les emails, les machines installees, les evenements calendrier de la semaine, les prochaines actions CRM, les taches non completees, et les actions en retard.",
  input_schema: {
    type: "object" as const,
    properties: {
      data_type: {
        type: "string",
        enum: ["prospects", "clients", "entreprises", "activites_recentes", "emails_recents", "machines", "pipeline_summary", "deals_bloques", "calendar_this_week", "next_actions_this_week", "previous_week_tasks", "overdue_actions", "forecast"],
        description: "Le type de donnees a recuperer. Pour le Monday Check-in, utilise dans cet ordre : calendar_this_week, next_actions_this_week, previous_week_tasks, overdue_actions. Pour le Sales Review, utilise aussi forecast pour le pipeline previsionnel.",
      },
      filters: {
        type: "string",
        description: "Filtre optionnel : nom d'entreprise, etape pipeline, ou nombre de jours pour les activites recentes. Ex: 'Dallmayr', 'devis', '7'",
      },
    },
    required: ["data_type"],
  },
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return Response.json(
        { error: 'Cle API Anthropic non configuree. Ajoutez ANTHROPIC_API_KEY dans .env.local' },
        { status: 500 },
      )
    }

    const budgetBlock = await enforceBudget()
    if (budgetBlock) return budgetBlock

    const body = await request.json()
    const { messages, prospectId, model: requestedModel, file } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      prospectId?: string
      model?: string
      file?: { name: string; base64: string; mimeType: string }
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Messages requis' }, { status: 400 })
    }

    // Load business context + prospect context + knowledge docs + emails in parallel
    let prospect: Prospect | null = null
    let activities: Awaited<ReturnType<typeof getActivities>> = []
    let businessContext: Awaited<ReturnType<typeof getBusinessContext>> = null
    let knowledgeDocs: Awaited<ReturnType<typeof getKnowledgeDocuments>> = []
    let allProspects: Awaited<ReturnType<typeof getProspectsSummary>> = []
    let prospectEmails: Email[] = []

    try {
      const results = await Promise.all([
        getBusinessContext(),
        getKnowledgeDocuments(),
        prospectId ? getProspect(prospectId) : Promise.resolve(null),
        prospectId ? getActivities(prospectId) : Promise.resolve([]),
        !prospectId ? getProspectsSummary() : Promise.resolve([]),
        prospectId ? getProspectEmails(prospectId) : Promise.resolve([]),
      ])

      businessContext = results[0]
      knowledgeDocs = results[1]
      prospect = results[2]
      activities = results[3]
      allProspects = results[4]
      prospectEmails = results[5] as Email[]
    } catch {
      // Continue without context
    }

    // Fetch deal group members if prospect has a deal_group
    let dealGroupMembers: Prospect[] = []
    if (prospect?.deal_group) {
      try {
        dealGroupMembers = await getDealGroupMembers(prospect.deal_group, prospect.id)
      } catch {
        // Continue without deal group context
      }
    }

    // Fetch pipeline stage slugs for dynamic stage ordering in prompts
    let stageOrderSlugs: string[] | undefined
    try {
      const { data: stageRows } = await supabase
        .from('pipeline_stages')
        .select('slug')
        .order('position')
      if (stageRows && stageRows.length > 0) {
        stageOrderSlugs = stageRows.map(s => s.slug)
      }
    } catch {
      // Continue without stage order
    }

    const systemPrompt = buildSystemPrompt(prospect, activities, businessContext, knowledgeDocs, allProspects, prospectEmails, dealGroupMembers.length > 0 ? dealGroupMembers : undefined, stageOrderSlugs)

    // Enhance system prompt with knowledge context when relevant
    const lastMessage = messages[messages.length - 1]?.content?.toLowerCase() || ''
    const wantsEnrichment = lastMessage.includes('recherche') ||
      lastMessage.includes('info') ||
      lastMessage.includes('touch 1') ||
      lastMessage.includes('premier message') ||
      lastMessage.includes('personnalis') ||
      lastMessage.includes('mail') ||
      lastMessage.includes('email') ||
      lastMessage.includes('entreprise') ||
      lastMessage.includes('societe') ||
      lastMessage.includes('société') ||
      (prospect?.entreprise && (
        lastMessage.includes('redige') ||
        lastMessage.includes('ecris') ||
        lastMessage.includes('rédige') ||
        lastMessage.includes('écris') ||
        lastMessage.includes('propose') ||
        lastMessage.includes('relance')
      ))

    let enhancedSystem = systemPrompt
    enhancedSystem += `\n\nTu as un outil query_crm() pour interroger les donnees du CRM en temps reel. Utilise-le pour repondre aux questions sur les prospects, clients, pipeline, machines, activites recentes. Ne demande JAMAIS a l'utilisateur de copier-coller des donnees — interroge le CRM directement.

Tu as un outil save_weekly_tasks() pour sauvegarder des taches dans la checklist hebdo du dashboard.

Tu as un outil read_document() pour charger le contenu complet de n'importe quel document de la base de connaissances. Utilise-le systematiquement quand l'utilisateur pose une question sur un document, demande de le lire, ou quand tu as besoin d'informations detaillees d'un document. Ne dis JAMAIS que tu n'as que le resume ou l'index — charge le document avec read_document().

## Monday Check-in
Quand l'utilisateur dit "check-in", "monday check-in", "prepare ma semaine", "to-do list", "priorites de la semaine" :

SOURCES DE DONNEES (dans cet ordre de priorite) :
1. GOOGLE CALENDAR — Appelle query_crm(data_type: "calendar_this_week"). Les meetings planifies sont la source #1. Si c'est dans le calendrier, c'est reel.
2. PROCHAINES ACTIONS CRM — Appelle query_crm(data_type: "next_actions_this_week"). Ce sont les actions que l'utilisateur a lui-meme planifiees dans le CRM.
3. TACHES NON COMPLETEES — Appelle query_crm(data_type: "previous_week_tasks"). Les taches de la semaine precedente pas encore cochees.
4. ACTIONS EN RETARD — Appelle query_crm(data_type: "overdue_actions"). Les prochaines actions dont la date est passee.

CE QUE TU NE FAIS PAS :
- Tu ne scannes PAS tous les prospects pour suggerer des follow-ups.
- Tu ne decides PAS que l'utilisateur devrait relancer quelqu'un.
- Tu ne generes PAS de taches a partir du pipeline.

GENERATION DE LA TO-DO LIST :
- Categorise chaque tache : meeting (depuis calendrier), follow_up (depuis actions CRM), key_priority (urgent/en retard), onboarding (si stage = onboarding), task (autre).
- Si moins de 5 taches apres les 4 sources, tu PEUX suggerer 2-3 follow-ups CLAIREMENT separes sous le titre "Suggestions (pas dans ton agenda) :" avec le nombre de jours depuis le dernier contact.
- Appelle save_weekly_tasks() avec UNIQUEMENT les taches des 4 sources concretes (pas les suggestions).
- Affiche la liste formatee dans le chat pour le Monday call.

## Commande : Sales Review
Quand l'utilisateur dit "sales review", "prepare mon sales review", "prepare mon meeting commercial", "regional review", "prepare Tuesday meeting" :
Tu lances le processus en 3 phases :

PHASE 1 — INTERVIEW RAPIDE
Pose ces questions en 3 batches de 2-3 questions. Adapte selon les reponses, skip ce qui est deja clair.
Batch 1 — Resultats :
- Des deals hardware signes ces 2 dernieres semaines ? (client, produit, quantite, montant)
- Des deals software ? (licences Vendlive, MRR)
- Tu as les marges ou je mets TBC ?
Batch 2 — Pipeline :
- Quels deals ont avance ?
- Des deals perdus ou refroidis ?
- Nouveaux prospects entres dans le pipe ?
Batch 3 — Projets & Blocages :
- Des deals qui n'ont pas bouge depuis le dernier review ?
- Les plus gros blocages en ce moment ?
- Autre chose a mentionner ?

PHASE 2 — SCAN DES DONNEES
Apres l'interview, utilise query_crm pour recuperer : pipeline_summary, forecast, clients (machines signees), deals_bloques, activites_recentes (14 jours), emails_recents.
Croise ces donnees avec les reponses de l'interview. Si tu trouves des infos non mentionnees, signale-les.

PHASE 3 — GENERER LE RAPPORT
Genere le rapport en anglais, ton factuel et concis, dans ce format :

FRANCE MARKET UPDATE — [Date debut] to [Date fin]
Presented by Louis

RESULTS
HW Sales: [montant] | Margin: [% ou TBC]
- [Client] — [produit] x[qty] — [montant]
SW Sales: [montant] | Margin: [% ou TBC]
- [Client] — [type licence] — [montant MRR]

FORECAST (Next 2-3 Months)
Hot (>70%):
- [prospect] — [product] x[qty] — [total] EUR — [month]
Warm (30-70%):
- [prospect] — [product] x[qty] — [total] EUR — [month]
Cold (<30%):
- [prospect] — [product] x[qty] — [total] EUR — [month]
Pipeline Total: [total_brut] EUR
Weighted Pipeline: [total_pondere] EUR

KEY PROJECTS & DEVELOPMENTS
Progress: [Client/Projet] — [avancement]
Blockers: [Client/Projet] — [blocage]
New Prospects: [Client] — [source] — [potentiel]
No Movement: [Client/Projet] — [date derniere activite]

Regles : HW et SW separes, montants exacts ou ~ ou TBC, 1 ligne max par bullet.
Apres le rapport, demande : "C'est bon ? Tu veux corriger quelque chose avant le meeting ?"`

    if (wantsEnrichment && prospect?.entreprise) {
      enhancedSystem += `\n\n## Recherche d'informations
Utilise tes connaissances sur ${prospect.entreprise} pour personnaliser ton message :
- Ce que tu sais sur cette entreprise (secteur, taille, localisation)
- Des elements qui pourraient rendre le message pertinent
- Si tu ne connais pas l'entreprise, propose un message generique mais professionnel`
    }

    // Detect content suggestion intent
    const wantsContent = lastMessage.includes('contenu') ||
      lastMessage.includes('content') ||
      lastMessage.includes('article') ||
      lastMessage.includes('ressource') ||
      lastMessage.includes('suggere') ||
      lastMessage.includes('recommande') ||
      lastMessage.includes('nurturing') ||
      lastMessage.includes('partager')

    // Detect calendar/availability intent
    const wantsCalendar = lastMessage.includes('calendrier') ||
      lastMessage.includes('calendar') ||
      lastMessage.includes('creneau') ||
      lastMessage.includes('créneau') ||
      lastMessage.includes('dispo') ||
      lastMessage.includes('meeting') ||
      lastMessage.includes('reunion') ||
      lastMessage.includes('réunion') ||
      lastMessage.includes('rdv') ||
      lastMessage.includes('rendez') ||
      lastMessage.includes('planifier') ||
      lastMessage.includes('quand') ||
      lastMessage.includes('semaine prochaine') ||
      lastMessage.includes('prochain call')

    if (wantsCalendar) {
      try {
        const calEvents = await getCalendarEvents(7, 14)
        if (calEvents.length > 0) {
          const now = new Date()
          const upcoming = calEvents.filter((e: CalendarEvent) => {
            const d = new Date(e.start.dateTime || e.start.date || '')
            return d >= now
          })

          if (upcoming.length > 0) {
            const eventLines = upcoming.slice(0, 20).map((e: CalendarEvent) => {
              const start = new Date(e.start.dateTime || e.start.date || '')
              const dateStr = start.toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
              const timeStr = e.start.dateTime
                ? start.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                : 'journee entiere'
              const endTime = e.end?.dateTime
                ? new Date(e.end.dateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
                : ''
              const attendeeList = (e.attendees || [])
                .filter(a => !a.email?.includes('calendar.google.com'))
                .map(a => a.displayName || a.email)
                .join(', ')
              return `- ${dateStr} ${timeStr}${endTime ? `-${endTime}` : ''} : "${e.summary}"${attendeeList ? ` (avec ${attendeeList})` : ''}`
            })

            enhancedSystem += `\n\n## Calendrier Google — Evenements a venir

Voici les evenements du calendrier des 2 prochaines semaines. Utilise ces informations pour :
- Proposer des creneaux libres au prospect (en evitant les conflits)
- Mentionner les meetings deja planifies avec ce prospect
- Suggerer le meilleur moment pour un call ou une reunion

${eventLines.join('\n')}

IMPORTANT : Quand tu proposes des creneaux, verifie qu'ils ne chevauchent pas les evenements ci-dessus. Propose 2-3 options en heures ouvrables (9h-18h, lundi-vendredi).`
          }
        }
      } catch {
        // Calendar not available, continue without
      }
    }

    if (wantsContent) {
      try {
        const { data: contents } = await supabase
          .from('contents')
          .select('id, title, content_type, url, body, themes, products, pipeline_stages')
          .order('created_at', { ascending: false })
          .limit(30)

        if (contents && contents.length > 0) {
          const contentList = contents.map(c => {
            const tags = [
              ...(c.themes || []),
              ...(c.products || []),
            ].join(', ')
            return `- [CONTENT:${c.id}] "${c.title}" (${c.content_type}${tags ? `, tags: ${tags}` : ''}${c.url ? `, url: ${c.url}` : ''})${c.body ? `\n  Resume: ${c.body.slice(0, 150)}` : ''}`
          }).join('\n')

          enhancedSystem += `\n\n## Contenus disponibles pour nurturing

Voici les contenus de notre base. Quand tu suggeres un contenu, utilise EXACTEMENT le format [CONTENT:id] dans ta reponse pour que l'utilisateur puisse envoyer le contenu par email directement.

Exemple de format de reponse :
"Je te recommande cet article : **Titre du contenu** [CONTENT:abc123] — il est pertinent parce que..."

Contenus :
${contentList}`
        }
      } catch {
        // Continue without content context
      }
    }

    const model = resolveModel('chat', requestedModel)
    const anthropic = getAnthropicClient()

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let apiMessages: any[] = messages.map((m, idx) => {
            // If this is the last user message and a file was attached, build multimodal content
            if (idx === messages.length - 1 && m.role === 'user' && file) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const contentParts: any[] = []

              if (file.mimeType === 'application/pdf') {
                contentParts.push({
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: file.base64,
                  },
                })
              } else if (file.mimeType.startsWith('image/')) {
                contentParts.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: file.mimeType,
                    data: file.base64,
                  },
                })
              } else {
                // Text files (.txt, .md, .csv) — decode base64 to text
                const textContent = Buffer.from(file.base64, 'base64').toString('utf-8')
                contentParts.push({
                  type: 'text',
                  text: `=== Fichier: ${file.name} ===\n${textContent}`,
                })
              }

              contentParts.push({
                type: 'text',
                text: m.content || 'Analyse ce document.',
              })

              return { role: 'user' as const, content: contentParts }
            }

            return {
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }
          })
          let totalInputTokens = 0
          let totalOutputTokens = 0

          // Agentic loop: stream text, handle tool_use for query_crm
          for (let round = 0; round < 6; round++) {
            const stream = anthropic.messages.stream({
              model: model.apiModelId,
              max_tokens: model.maxOutputTokens,
              system: [
                {
                  type: "text" as const,
                  text: enhancedSystem,
                  cache_control: { type: "ephemeral" as const },
                },
              ],
              tools: [
                {
                  type: "web_search_20250305" as const,
                  name: "web_search",
                },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                CRM_TOOL as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                SAVE_WEEKLY_TASKS_TOOL as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                READ_DOCUMENT_TOOL as any,
              ],
              messages: apiMessages,
            })

            stream.on('text', (text) => {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
              )
            })

            const finalMessage = await stream.finalMessage()
            totalInputTokens += finalMessage.usage.input_tokens
            totalOutputTokens += finalMessage.usage.output_tokens

            // If stop_reason is not tool_use, we're done
            if (finalMessage.stop_reason !== 'tool_use') break

            // Find custom tool calls (web_search is handled server-side by the API)
            const customToolBlocks = finalMessage.content.filter(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (b: any) => b.type === 'tool_use' && (b.name === 'query_crm' || b.name === 'save_weekly_tasks' || b.name === 'read_document')
            )

            if (customToolBlocks.length === 0) break

            // Execute tool calls and build tool results
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const toolResults: any[] = []
            for (const block of customToolBlocks) {
              if (block.type !== 'tool_use') continue
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              let result: unknown
              if (block.name === 'query_crm') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = await executeCrmQuery(block.input as any)
              } else if (block.name === 'save_weekly_tasks') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = await executeSaveWeeklyTasks(block.input as any)
              } else if (block.name === 'read_document') {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result = await executeReadDocument(block.input as any)
              }
              toolResults.push({
                type: 'tool_result' as const,
                tool_use_id: block.id,
                content: JSON.stringify(result),
              })
            }

            // Add assistant message + tool results to conversation
            apiMessages = [
              ...apiMessages,
              { role: 'assistant' as const, content: finalMessage.content },
              { role: 'user' as const, content: toolResults },
            ]
          }

          logApiUsage({
            endpoint: 'chat',
            model: model.apiModelId,
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
          })

          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (error) {
          const errorMessage = parseAnthropicError(error)
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMessage })}\n\n`,
            ),
          )
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    const message = parseAnthropicError(error)
    return Response.json({ error: message }, { status: 500 })
  }
}
