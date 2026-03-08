// Boost CRM — Chrome Extension Popup

const DEFAULT_CRM_URL = 'http://localhost:3000'

// DOM refs
const extractSection = document.getElementById('extract-section')
const emptySection = document.getElementById('empty-section')
const btnExtract = document.getElementById('btn-extract')
const btnSave = document.getElementById('btn-save')
const saveStatus = document.getElementById('save-status')
const settingsToggle = document.getElementById('settings-toggle')
const settingsPanel = document.getElementById('settings-panel')
const btnSaveSettings = document.getElementById('btn-save-settings')
const settingsStatus = document.getElementById('settings-status')

const aiSuggestion = document.getElementById('ai-suggestion')

// Field IDs
const FIELDS = ['prenom', 'nom', 'entreprise', 'fonction', 'email', 'telephone', 'linkedin', 'localisation', 'source']

function getFieldValue(id) {
  return document.getElementById('f-' + id)?.value?.trim() || ''
}

function setFieldValue(id, value) {
  const el = document.getElementById('f-' + id)
  if (el && value) el.value = value
}

function showStatus(el, type, msg) {
  el.className = 'status ' + type
  el.textContent = msg
  el.style.display = 'block'
}

// Settings
settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('open')
})

async function loadSettings() {
  const { crm_url, crm_password } = await chrome.storage.local.get(['crm_url', 'crm_password'])
  document.getElementById('s-url').value = crm_url || DEFAULT_CRM_URL
  document.getElementById('s-password').value = crm_password || ''
  return { url: crm_url || DEFAULT_CRM_URL, password: crm_password || '' }
}

btnSaveSettings.addEventListener('click', async () => {
  const url = document.getElementById('s-url').value.trim().replace(/\/$/, '')
  const password = document.getElementById('s-password').value.trim()
  if (!password) {
    showStatus(settingsStatus, 'error', 'Mot de passe requis')
    return
  }
  await chrome.storage.local.set({ crm_url: url || DEFAULT_CRM_URL, crm_password: password })
  showStatus(settingsStatus, 'success', 'Parametres sauvegardes')
  setTimeout(() => { settingsStatus.style.display = 'none' }, 2000)
})

// Extract from current page
btnExtract.addEventListener('click', extractFromPage)

async function extractFromPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractPageData,
    })

    if (results && results[0]?.result) {
      fillForm(results[0].result)
    } else {
      showStatus(saveStatus, 'warning', 'Aucune donnee trouvee sur cette page')
      saveStatus.style.display = 'block'
    }
  } catch (err) {
    showStatus(saveStatus, 'error', 'Impossible de lire cette page: ' + err.message)
  }
}

// The function injected into the page to extract data
function extractPageData() {
  const url = window.location.href
  const data = { source: 'Extension Chrome' }

  // LinkedIn profile
  if (url.includes('linkedin.com/in/')) {
    data.linkedin = url.split('?')[0]

    // === SOURCE 1: document.title (most reliable, always present) ===
    // Format: "Prenom Nom - Headline | LinkedIn"
    const title = document.title || ''
    if (title.includes('LinkedIn')) {
      const withoutLinkedin = title.replace(/\s*\|\s*LinkedIn\s*$/, '').trim()
      const dashIdx = withoutLinkedin.indexOf(' - ')
      if (dashIdx > 0) {
        const namePart = withoutLinkedin.substring(0, dashIdx).trim()
        const headlinePart = withoutLinkedin.substring(dashIdx + 3).trim()
        const parts = namePart.split(/\s+/)
        if (parts.length >= 2) {
          data.prenom = parts[0]
          data.nom = parts.slice(1).join(' ')
        } else {
          data.nom = namePart
        }
        if (headlinePart) {
          data.fonction = headlinePart
        }
      }
    }

    // === SOURCE 2: meta description for location ===
    // Format: "Nom · Headline · Location · 500+ relations"
    const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
    if (metaDesc) {
      const parts = metaDesc.split(/\s*·\s*/)
      // Find the location part (not name, not headline, not "X relations/connections")
      for (let i = 2; i < parts.length; i++) {
        const part = parts[i].trim()
        if (part && !/^\d/.test(part) && !/relation|connection|follower|profil|Voir/i.test(part)) {
          data.localisation = part
          break
        }
      }
    }

    // === SOURCE 3: h1 fallback for name ===
    if (!data.prenom && !data.nom) {
      const h1 = document.querySelector('h1')
      if (h1) {
        const fullName = h1.textContent.trim()
        const parts = fullName.split(/\s+/)
        if (parts.length >= 2) {
          data.prenom = parts[0]
          data.nom = parts.slice(1).join(' ')
        } else {
          data.nom = fullName
        }
      }
    }

    // === SOURCE 4: Company from /company/ links ===
    const allCompanyLinks = document.querySelectorAll('a[href*="/company/"]')
    for (const link of allCompanyLinks) {
      const rect = link.getBoundingClientRect()
      if (rect.top > 0 && rect.top < 700 && rect.width > 0) {
        const text = link.textContent.trim()
        if (text && text.length > 1 && text.length < 100) {
          data.entreprise = text
          break
        }
      }
    }

    // Company fallback: parse from headline ("chez X", "at X")
    if (!data.entreprise && data.fonction) {
      const chez = data.fonction.match(/\bchez\s+(.+?)(?:\s*[|\-]|$)/i)
      const at = data.fonction.match(/\bat\s+(.+?)(?:\s*[|\-]|$)/i)
      if (chez) data.entreprise = chez[1].trim()
      else if (at) data.entreprise = at[1].trim()
    }

    data.source = 'LinkedIn'
  }

  // Gmail — reading an email
  if (url.includes('mail.google.com')) {
    // .gD is Gmail's specific sender element in opened emails (has email + name attrs)
    // IMPORTANT: Do NOT use generic [email] — it matches random Gmail UI elements
    let senderEl = null
    const senders = document.querySelectorAll('.gD[email]')

    if (senders.length === 1) {
      senderEl = senders[0]
    } else if (senders.length > 1) {
      // Multiple senders (thread view) — take the first visible one
      for (const el of senders) {
        const rect = el.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight) {
          senderEl = el
          break
        }
      }
      if (!senderEl) senderEl = senders[0]
    }

    if (senderEl) {
      const email = senderEl.getAttribute('email')
      const name = senderEl.getAttribute('name') || senderEl.textContent?.trim()
      if (email) {
        data.email = email
        // Extract company from professional email domain
        const domain = email.split('@')[1]
        const freeProviders = ['gmail.com','yahoo.com','yahoo.fr','hotmail.com','hotmail.fr','outlook.com','outlook.fr','live.com','live.fr','icloud.com','orange.fr','free.fr','sfr.fr','wanadoo.fr','laposte.net','protonmail.com','aol.com','msn.com','me.com','mail.com']
        if (domain && !freeProviders.includes(domain.toLowerCase())) {
          const companyPart = domain.split('.')[0]
          data.entreprise = companyPart.charAt(0).toUpperCase() + companyPart.slice(1)
        }
      }
      if (name && name !== email) {
        const parts = name.split(/\s+/)
        if (parts.length >= 2) {
          data.prenom = parts[0]
          data.nom = parts.slice(1).join(' ')
        } else {
          data.nom = name
        }
      }
    }

    data.source = 'Gmail'
  }

  return data
}

function fillForm(data) {
  emptySection.style.display = 'none'
  extractSection.style.display = 'block'

  for (const key of FIELDS) {
    const apiKey = key === 'linkedin' ? 'linkedin' : key
    if (data[apiKey]) {
      setFieldValue(key, data[apiKey])
    }
  }

  // Trigger AI suggestion for LinkedIn profiles
  if (data.source === 'LinkedIn' && (data.fonction || data.entreprise)) {
    fetchAISuggestion(data.fonction, data.entreprise, data.localisation)
  }
}

async function fetchAISuggestion(fonction, entreprise, localisation) {
  try {
    const { crm_url, crm_password } = await chrome.storage.local.get(['crm_url', 'crm_password'])
    if (!crm_password) return

    const url = crm_url || DEFAULT_CRM_URL
    aiSuggestion.className = 'status info'
    aiSuggestion.textContent = 'Analyse IA en cours...'
    aiSuggestion.style.display = 'block'

    const res = await fetch(`${url}/api/ai/suggest-stage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${crm_password}`,
      },
      body: JSON.stringify({ fonction, entreprise, localisation }),
    })

    if (!res.ok) {
      aiSuggestion.style.display = 'none'
      return
    }

    const data = await res.json()
    if (data.pipeline_stage) {
      const stageLabels = { ciblage: 'Ciblage', touch_1: 'Touch 1', nurturing: 'Nurturing' }
      const products = (data.products || []).join(', ')
      const label = stageLabels[data.pipeline_stage] || data.pipeline_stage

      aiSuggestion.className = 'status ai-suggest'
      aiSuggestion.innerHTML = `
        <span>💡 Suggestion : <b>${label}</b>${products ? ' — ' + products : ''}<br>
        <i>${data.reasoning || ''}</i></span>
        <button class="btn-accept" id="btn-accept-suggestion">Accepter</button>
      `

      document.getElementById('btn-accept-suggestion').addEventListener('click', () => {
        const select = document.getElementById('f-pipeline_stage')
        if (select) {
          select.value = data.pipeline_stage
        }
        aiSuggestion.className = 'status success'
        aiSuggestion.textContent = 'Suggestion appliquee'
        setTimeout(() => { aiSuggestion.style.display = 'none' }, 1500)
      })
    }
  } catch {
    aiSuggestion.style.display = 'none'
  }
}

// Save to CRM
btnSave.addEventListener('click', async () => {
  const { crm_url, crm_password } = await chrome.storage.local.get(['crm_url', 'crm_password'])
  const url = crm_url || DEFAULT_CRM_URL
  const password = crm_password

  if (!password) {
    showStatus(saveStatus, 'error', 'Configurez votre mot de passe dans les parametres')
    settingsPanel.classList.add('open')
    return
  }

  const prospect = {
    prenom: getFieldValue('prenom'),
    nom: getFieldValue('nom'),
    entreprise: getFieldValue('entreprise'),
    fonction: getFieldValue('fonction'),
    email: getFieldValue('email'),
    telephone: getFieldValue('telephone'),
    linkedin_url: getFieldValue('linkedin'),
    localisation: getFieldValue('localisation'),
    source: getFieldValue('source'),
    pipeline_stage: document.getElementById('f-pipeline_stage')?.value || 'ciblage',
  }

  if (!prospect.nom && !prospect.entreprise && !prospect.email) {
    showStatus(saveStatus, 'error', 'Remplissez au moins un champ: nom, entreprise ou email')
    return
  }

  btnSave.disabled = true
  btnSave.innerHTML = '<span class="spinner"></span> Enregistrement...'

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
      showStatus(saveStatus, 'error', json.error || 'Erreur serveur')
      return
    }

    if (json.status === 'duplicate') {
      const link = json.crm_url ? `<br><a href="${json.crm_url}" target="_blank" class="crm-link">Ouvrir dans le CRM →</a>` : ''
      saveStatus.className = 'status warning'
      saveStatus.innerHTML = json.message + link
      saveStatus.style.display = 'block'
    } else {
      const link = json.crm_url ? `<br><a href="${json.crm_url}" target="_blank" class="crm-link">Ouvrir dans le CRM →</a>` : ''
      saveStatus.className = 'status success'
      saveStatus.innerHTML = json.message + link
      saveStatus.style.display = 'block'
    }
  } catch (err) {
    showStatus(saveStatus, 'error', 'Connexion impossible: ' + err.message)
  } finally {
    btnSave.disabled = false
    btnSave.textContent = 'Enregistrer dans le CRM'
  }
})

// On popup open: load settings and auto-extract
async function init() {
  await loadSettings()

  // Check if settings are configured
  const { crm_password } = await chrome.storage.local.get(['crm_password'])
  if (!crm_password) {
    settingsPanel.classList.add('open')
    showStatus(settingsStatus, 'info', 'Configurez votre mot de passe pour commencer')
  }

  // Auto-extract from current page
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (tab?.url?.includes('linkedin.com/in/') || tab?.url?.includes('mail.google.com')) {
      await extractFromPage()
    }
  } catch {
    // Silently fail if we can't access the tab
  }
}

init()
