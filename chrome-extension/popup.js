// Boost CRM — Chrome Extension Popup

const DEFAULT_CRM_URL = 'https://boost-crm-six.vercel.app'

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

    // Name from the main h1
    const h1 = document.querySelector('h1.text-heading-xlarge') ||
               document.querySelector('h1.inline.t-24') ||
               document.querySelector('h1')
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

    // Headline (often contains function/title)
    const headline = document.querySelector('.text-body-medium.break-words') ||
                     document.querySelector('div.text-body-medium')
    if (headline) {
      data.fonction = headline.textContent.trim()
    }

    // Location
    const location = document.querySelector('.text-body-small.inline.t-black--light.break-words') ||
                     document.querySelector('span.text-body-small.inline')
    if (location) {
      data.localisation = location.textContent.trim()
    }

    // Company — from experience or from the headline subtext
    const companyLink = document.querySelector('button[aria-label*="entreprise actuelle"]') ||
                        document.querySelector('div.inline-show-more-text--is-collapsed span[aria-hidden="true"]') ||
                        document.querySelector('.pv-text-details__right-panel .text-body-small')
    if (companyLink) {
      data.entreprise = companyLink.textContent.trim()
    }

    // Try experience section for company
    if (!data.entreprise) {
      const expSection = document.querySelector('#experience ~ .pvs-list__outer-container')
      if (expSection) {
        const firstExp = expSection.querySelector('.t-bold span[aria-hidden="true"]')
        if (firstExp) {
          // This might be the job title, the company is usually the parent group or next sibling
          const companyEl = expSection.querySelector('.t-normal:not(.t-black--light) span[aria-hidden="true"]')
          if (companyEl) {
            data.entreprise = companyEl.textContent.trim()
          }
        }
      }
    }

    data.source = 'LinkedIn'
  }

  // Gmail — reading an email
  if (url.includes('mail.google.com')) {
    // Try to get sender name and email from the open email
    const senderEl = document.querySelector('[email]') ||
                     document.querySelector('.gD')
    if (senderEl) {
      const email = senderEl.getAttribute('email')
      const name = senderEl.getAttribute('name') || senderEl.textContent.trim()
      if (email) data.email = email
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

    // Alternative: try the expanded header
    if (!data.email) {
      const headerTable = document.querySelector('.ajA')
      if (headerTable) {
        const emailMatch = headerTable.textContent.match(/[\w.-]+@[\w.-]+\.\w+/)
        if (emailMatch) data.email = emailMatch[0]
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
      showStatus(saveStatus, 'warning', json.message)
    } else {
      showStatus(saveStatus, 'success', json.message)
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
