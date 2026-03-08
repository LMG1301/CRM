// Boost CRM — Side Panel for Gmail

const DEFAULT_CRM_URL = 'http://localhost:3000'

// Views
const loadingView = document.getElementById('loading-view')
const emptyView = document.getElementById('empty-view')
const existingView = document.getElementById('existing-view')
const newView = document.getElementById('new-view')

function hideAllViews() {
  loadingView.style.display = 'none'
  emptyView.style.display = 'none'
  existingView.style.display = 'none'
  newView.style.display = 'none'
}

function showView(view) {
  hideAllViews()
  view.style.display = 'block'
}

async function getSettings() {
  const { crm_url, crm_password } = await chrome.storage.local.get(['crm_url', 'crm_password'])
  return { url: crm_url || DEFAULT_CRM_URL, password: crm_password || '' }
}

// Format date for display
function formatDate(dateStr) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

const stageLabels = {
  ciblage: 'Ciblage',
  touch_1: 'Touch 1',
  touch_2: 'Touch 2',
  touch_3: 'Touch 3',
  nurturing: 'Nurturing',
  repondu: 'Repondu',
  call_decouverte: 'Call decouverte',
  devis: 'Devis',
  client: 'Client',
  refuse: 'Refuse',
  bounced: 'Bounced',
}

// Show existing prospect (Mode A)
function showExistingProspect(prospect, lastActivity, crmUrl) {
  const name = [prospect.prenom, prospect.nom].filter(Boolean).join(' ') || 'Sans nom'
  document.getElementById('ex-name').textContent = name

  const stage = prospect.pipeline_stage || 'ciblage'
  const stageBadge = document.getElementById('ex-stage')
  stageBadge.textContent = stageLabels[stage] || stage
  stageBadge.className = `stage-badge stage-${stage}`

  document.getElementById('ex-entreprise').textContent = prospect.entreprise || '-'
  document.getElementById('ex-fonction').textContent = prospect.fonction || '-'
  document.getElementById('ex-email').textContent = prospect.email || prospect.email_pro || '-'
  document.getElementById('ex-telephone').textContent = prospect.telephone || '-'
  document.getElementById('ex-localisation').textContent = prospect.localisation || '-'

  // Last activity
  const activitySection = document.getElementById('ex-activity-section')
  if (lastActivity) {
    activitySection.style.display = 'block'
    const activityEl = document.getElementById('ex-activity')
    activityEl.innerHTML = `<strong>${lastActivity.type}</strong> — ${formatDate(lastActivity.created_at)}<br>${(lastActivity.content || '').slice(0, 100)}`
  } else {
    activitySection.style.display = 'none'
  }

  // Next action
  const actionSection = document.getElementById('ex-action-section')
  if (prospect.date_prochaine_action) {
    actionSection.style.display = 'block'
    document.getElementById('ex-next-action').innerHTML = `<strong>${prospect.type_prochaine_action || 'Action'}</strong> — ${formatDate(prospect.date_prochaine_action)}`
  } else {
    actionSection.style.display = 'none'
  }

  // CRM link
  const btnCrm = document.getElementById('btn-open-crm')
  btnCrm.onclick = () => {
    chrome.tabs.create({ url: crmUrl })
  }

  showView(existingView)
}

// Show new prospect form (Mode B)
function showNewProspect(contactData, parsedSignature) {
  document.getElementById('n-prenom').value = contactData.prenom || ''
  document.getElementById('n-nom').value = contactData.nom || ''
  document.getElementById('n-email').value = contactData.email || ''

  // Fill from parsed signature
  if (parsedSignature) {
    if (parsedSignature.entreprise) document.getElementById('n-entreprise').value = parsedSignature.entreprise
    if (parsedSignature.fonction) document.getElementById('n-fonction').value = parsedSignature.fonction
    if (parsedSignature.telephone) document.getElementById('n-telephone').value = parsedSignature.telephone
    if (parsedSignature.site_web) document.getElementById('n-site_web').value = parsedSignature.site_web
    if (parsedSignature.localisation) document.getElementById('n-localisation').value = parsedSignature.localisation
  }

  showView(newView)
}

// Create prospect from form
document.getElementById('btn-create').addEventListener('click', async () => {
  const { url, password } = await getSettings()
  if (!password) {
    showStatus('create-status', 'error', 'Configurez votre mot de passe dans le popup Boost CRM')
    return
  }

  const prospect = {
    prenom: document.getElementById('n-prenom').value.trim(),
    nom: document.getElementById('n-nom').value.trim(),
    email: document.getElementById('n-email').value.trim(),
    entreprise: document.getElementById('n-entreprise').value.trim(),
    fonction: document.getElementById('n-fonction').value.trim(),
    telephone: document.getElementById('n-telephone').value.trim(),
    site_web: document.getElementById('n-site_web').value.trim(),
    localisation: document.getElementById('n-localisation').value.trim(),
    source: 'Gmail',
  }

  if (!prospect.nom && !prospect.entreprise && !prospect.email) {
    showStatus('create-status', 'error', 'Remplissez au moins un champ')
    return
  }

  const btn = document.getElementById('btn-create')
  btn.disabled = true
  btn.innerHTML = '<span class="spinner"></span> Creation...'

  try {
    const res = await fetch(`${url}/api/prospects/quick-add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${password}`,
      },
      body: JSON.stringify(prospect),
    })

    const json = await res.json()

    if (!res.ok) {
      showStatus('create-status', 'error', json.error || 'Erreur serveur')
      return
    }

    if (json.status === 'duplicate') {
      showStatus('create-status', 'warning', json.message)
      if (json.crm_url) {
        // Switch to existing view by re-fetching
        await handleContact({ email: prospect.email, prenom: prospect.prenom, nom: prospect.nom })
      }
    } else {
      showStatus('create-status', 'success', json.message)
      // Switch to existing view after creation
      if (json.crm_url) {
        setTimeout(async () => {
          await handleContact({ email: prospect.email, prenom: prospect.prenom, nom: prospect.nom })
        }, 1000)
      }
    }
  } catch (err) {
    showStatus('create-status', 'error', 'Connexion impossible: ' + err.message)
  } finally {
    btn.disabled = false
    btn.textContent = 'Creer ce prospect'
  }
})

function showStatus(elementId, type, msg) {
  const el = document.getElementById(elementId)
  el.className = 'status ' + type
  el.textContent = msg
  el.style.display = 'block'
}

// Main handler when a contact is detected
async function handleContact(contactData) {
  showView(loadingView)

  const { url, password } = await getSettings()
  if (!password) {
    showView(emptyView)
    return
  }

  try {
    // Step 1: Lookup prospect by email
    const params = new URLSearchParams()
    if (contactData.email) params.set('email', contactData.email)
    if (contactData.nom) params.set('nom', contactData.nom)

    const res = await fetch(`${url}/api/prospects/lookup?${params}`, {
      headers: { 'Authorization': `Bearer ${password}` },
    })

    if (!res.ok) {
      showView(emptyView)
      return
    }

    const data = await res.json()

    if (data.found) {
      // Mode A: existing prospect
      showExistingProspect(data.prospect, data.last_activity, data.crm_url)
    } else {
      // Mode B: new prospect — try to parse signature for enrichment
      let parsedSignature = null
      if (contactData.signatureText && contactData.signatureText.length > 10) {
        try {
          const sigRes = await fetch(`${url}/api/ai/parse-signature`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${password}`,
            },
            body: JSON.stringify({ signature_text: contactData.signatureText }),
          })
          if (sigRes.ok) {
            parsedSignature = await sigRes.json()
          }
        } catch {
          // Signature parsing is best-effort
        }
      }

      showNewProspect(contactData, parsedSignature)
    }
  } catch {
    showView(emptyView)
  }
}

// Listen for messages from content script via background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'GMAIL_CONTACT_DETECTED') {
    handleContact(message.data)
  }
})

// On side panel open, check if there's already a detected contact
async function init() {
  try {
    const contact = await chrome.runtime.sendMessage({ type: 'GET_GMAIL_CONTACT' })
    if (contact && contact.email) {
      await handleContact(contact)
    } else {
      showView(emptyView)
    }
  } catch {
    showView(emptyView)
  }
}

init()
