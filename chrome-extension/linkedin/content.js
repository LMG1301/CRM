// Boost CRM — LinkedIn Content Script
// Auto-detects LinkedIn profiles and shows a capture panel

let boostLinkedInInitialized = false
let lastProfileUrl = null

function isProfilePage() {
  return window.location.pathname.startsWith('/in/')
}

function extractProfileData() {
  const data = { source: 'LinkedIn' }

  // LinkedIn URL (clean, no query params)
  data.linkedin = window.location.href.split('?')[0]

  // === Name from h1 (most reliable) ===
  const h1 = document.querySelector('h1')
  if (h1) {
    const fullName = h1.textContent.trim()
    const parts = fullName.split(/\s+/)
    if (parts.length >= 2) {
      data.prenom = parts[0]
      data.nom = parts.slice(1).join(' ')
    } else if (fullName) {
      data.nom = fullName
    }
  }

  // === Headline (job title) from DOM ===
  const headlineEl = document.querySelector('div.text-body-medium')
    || document.querySelector('.pv-text-details__left-panel div.text-body-medium')
    || document.querySelector('[data-generated-suggestion-target] + div')
  if (headlineEl) {
    const headline = headlineEl.textContent.trim()
    if (headline) data.fonction = headline
  }

  // === Fallback: document.title ===
  const title = document.title || ''
  if (title.includes('LinkedIn')) {
    const withoutLinkedin = title.replace(/\s*[|]\s*LinkedIn\s*$/, '').trim()
    const dashMatch = withoutLinkedin.match(/^(.+?)\s+[\-\u2013\u2014]\s+(.+)$/)
    if (dashMatch) {
      if (!data.prenom && !data.nom) {
        const parts = dashMatch[1].trim().split(/\s+/)
        if (parts.length >= 2) {
          data.prenom = parts[0]
          data.nom = parts.slice(1).join(' ')
        } else {
          data.nom = dashMatch[1].trim()
        }
      }
      if (!data.fonction && dashMatch[2]) {
        data.fonction = dashMatch[2].trim()
      }
    }
  }

  // === Location from meta description ===
  const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || ''
  if (metaDesc) {
    const metaParts = metaDesc.split(/\s*[·]\s*/)
    for (let i = 2; i < metaParts.length; i++) {
      const part = metaParts[i].trim()
      if (part && !/^\d/.test(part) && !/relation|connection|follower|profil|Voir/i.test(part)) {
        data.localisation = part
        break
      }
    }
  }

  // === Company extraction (multiple strategies) ===

  // Strategy A: Company links in top profile section
  const expLinks = document.querySelectorAll(
    '.pv-text-details__right-panel a[href*="/company/"],'
    + ' .inline-show-more-text a[href*="/company/"],'
    + ' .experience-group-position a[href*="/company/"]'
  )
  for (const link of expLinks) {
    const text = link.textContent.trim()
    if (text && text.length > 1 && text.length < 100) {
      data.entreprise = text
      break
    }
  }

  // Strategy B: Visible company link in top 800px
  if (!data.entreprise) {
    const allCompanyLinks = document.querySelectorAll('a[href*="/company/"]')
    for (const link of allCompanyLinks) {
      const rect = link.getBoundingClientRect()
      if (rect.top > 0 && rect.top < 800 && rect.width > 0 && rect.height > 0) {
        const text = link.textContent.trim()
        if (text && text.length > 1 && text.length < 100
          && !/LinkedIn|Voir|See |Show /i.test(text)) {
          data.entreprise = text
          break
        }
      }
    }
  }

  // Strategy C: Parse headline for company
  if (!data.entreprise && data.fonction) {
    const headline = data.fonction
    const chez = headline.match(/\bchez\s+(.+?)(?:\s*[|]|$)/i)
    const at = headline.match(/\bat\s+(.+?)(?:\s*[|]|$)/i)
    const arobase = headline.match(/\s+@\s+(.+?)(?:\s*[|]|$)/i)
    const dashSep = headline.match(/\s+[\-\u2013\u2014]\s+(.+?)(?:\s*[|]|$)/)

    if (chez) {
      data.entreprise = chez[1].trim()
      data.fonction = headline.replace(/\s*\bchez\s+.+$/i, '').trim()
    } else if (at) {
      data.entreprise = at[1].trim()
      data.fonction = headline.replace(/\s*\bat\s+.+$/i, '').trim()
    } else if (arobase) {
      data.entreprise = arobase[1].trim()
      data.fonction = headline.replace(/\s*@\s+.+$/i, '').trim()
    } else if (dashSep) {
      data.entreprise = dashSep[1].trim()
      data.fonction = headline.replace(/\s*[\-\u2013\u2014]\s+.+$/, '').trim()
    }
  }

  // Strategy D: meta description fallback
  if (!data.entreprise && metaDesc) {
    const metaParts = metaDesc.split(/\s*[·]\s*/)
    if (metaParts.length >= 2) {
      const metaHeadline = metaParts[1].trim()
      const chezMeta = metaHeadline.match(/\bchez\s+(.+?)(?:\s*[|]|$)/i)
      const atMeta = metaHeadline.match(/\bat\s+(.+?)(?:\s*[|]|$)/i)
      if (chezMeta) data.entreprise = chezMeta[1].trim()
      else if (atMeta) data.entreprise = atMeta[1].trim()
    }
  }

  return data
}

// Check if prospect already exists in CRM
async function checkExistingProspect(data) {
  if (data.linkedin) {
    const result = await BoostAPI.lookupProspect(null, null)
    // Try by LinkedIn URL — use the lookup endpoint with email fallback
  }
  // Try by name + company
  if (data.nom) {
    const result = await BoostAPI.lookupProspect(null, data.nom)
    if (result.found) return result.prospect
  }
  return null
}

function removePanel() {
  const existing = document.getElementById('boost-crm-panel')
  if (existing) existing.remove()
}

function showAlreadyInCRM(prospect) {
  removePanel()

  const name = [prospect.prenom, prospect.nom].filter(Boolean).join(' ')
  const stage = prospect.pipeline_stage || 'ciblage'
  const stageLabels = {
    ciblage: 'Ciblage', touch_1: 'Touch 1', touch_2: 'Touch 2', touch_3: 'Touch 3',
    nurturing: 'Nurturing', repondu: 'Repondu', call_decouverte: 'Call decouverte',
    devis: 'Devis', client: 'Client', refuse: 'Refuse', bounced: 'Bounced',
  }

  const panel = document.createElement('div')
  panel.id = 'boost-crm-panel'
  panel.innerHTML = `
    <div class="boost-panel">
      <div class="boost-panel-header">
        <span class="boost-logo">\u26A1</span>
        <span class="boost-title">Boost CRM</span>
        <button class="boost-close" id="boost-close">\u2715</button>
      </div>
      <div class="boost-prospect-info">
        <div class="boost-name">${name}</div>
        <div class="boost-company">${prospect.entreprise || ''}</div>
        <span class="boost-stage boost-stage-${stage}">
          ${stageLabels[stage] || stage}
        </span>
      </div>
      <div style="text-align:center; padding:8px 0; color:#22c55e; font-size:13px; font-weight:600;">
        \u2713 Deja dans le CRM
      </div>
      <div class="boost-buttons">
        <button class="boost-btn boost-btn-primary" id="boost-open-crm">
          Ouvrir dans le CRM
        </button>
      </div>
    </div>
  `
  document.body.appendChild(panel)

  document.getElementById('boost-close').addEventListener('click', removePanel)
  document.getElementById('boost-open-crm').addEventListener('click', async () => {
    const crmUrl = await BoostConfig.getCrmUrl()
    window.open(crmUrl + '/prospects/' + prospect.id, '_blank')
  })
}

function showCapturePanel(data) {
  removePanel()

  const panel = document.createElement('div')
  panel.id = 'boost-crm-panel'
  panel.innerHTML = `
    <div class="boost-panel">
      <div class="boost-panel-header">
        <span class="boost-logo">\u26A1</span>
        <span class="boost-title">Boost CRM</span>
        <button class="boost-close" id="boost-close">\u2715</button>
      </div>
      <div class="boost-form">
        <div class="boost-form-row">
          <div class="boost-form-field">
            <label>Prenom</label>
            <input type="text" id="boost-prenom" value="${data.prenom || ''}">
          </div>
          <div class="boost-form-field">
            <label>Nom</label>
            <input type="text" id="boost-nom" value="${data.nom || ''}">
          </div>
        </div>
        <div class="boost-form-field">
          <label>Entreprise</label>
          <input type="text" id="boost-entreprise" value="${data.entreprise || ''}">
        </div>
        <div class="boost-form-field">
          <label>Fonction</label>
          <input type="text" id="boost-fonction" value="${data.fonction || ''}">
        </div>
        <div class="boost-form-field">
          <label>Email</label>
          <input type="email" id="boost-email" value="${data.email || ''}">
        </div>
        <div class="boost-form-field">
          <label>Telephone</label>
          <input type="tel" id="boost-telephone" value="${data.telephone || ''}">
        </div>
        <div class="boost-form-field">
          <label>LinkedIn</label>
          <input type="text" id="boost-linkedin" value="${data.linkedin || ''}" readonly style="opacity:0.7;">
        </div>
        <div class="boost-form-field">
          <label>Localisation</label>
          <input type="text" id="boost-localisation" value="${data.localisation || ''}">
        </div>
        <div class="boost-form-field">
          <label>Stage pipeline</label>
          <select id="boost-pipeline-stage">
            <option value="ciblage">Ciblage</option>
            <option value="touch_1">Touch 1</option>
            <option value="nurturing">Nurturing</option>
          </select>
        </div>
      </div>
      <div class="boost-buttons">
        <button class="boost-btn boost-btn-primary" id="boost-save">
          Enregistrer dans le CRM
        </button>
      </div>
      <div id="boost-status" style="display:none;"></div>
    </div>
  `
  document.body.appendChild(panel)

  document.getElementById('boost-close').addEventListener('click', removePanel)
  document.getElementById('boost-save').addEventListener('click', handleSave)
}

async function handleSave() {
  const btn = document.getElementById('boost-save')
  const status = document.getElementById('boost-status')
  btn.disabled = true
  btn.textContent = 'Enregistrement...'

  const prospect = {
    prenom: document.getElementById('boost-prenom').value.trim(),
    nom: document.getElementById('boost-nom').value.trim(),
    entreprise: document.getElementById('boost-entreprise').value.trim(),
    fonction: document.getElementById('boost-fonction').value.trim(),
    email: document.getElementById('boost-email').value.trim(),
    telephone: document.getElementById('boost-telephone').value.trim(),
    linkedin_url: document.getElementById('boost-linkedin').value.trim(),
    localisation: document.getElementById('boost-localisation').value.trim(),
    pipeline_stage: document.getElementById('boost-pipeline-stage').value,
    source: 'LinkedIn',
  }

  if (!prospect.nom && !prospect.entreprise && !prospect.email) {
    status.style.display = 'block'
    status.className = 'boost-error'
    status.textContent = 'Remplissez au moins un champ: nom, entreprise ou email'
    btn.disabled = false
    btn.textContent = 'Enregistrer dans le CRM'
    return
  }

  const result = await BoostAPI.createProspect(prospect)

  if (result.error) {
    status.style.display = 'block'
    status.className = 'boost-error'
    status.textContent = result.error
  } else if (result.status === 'duplicate') {
    status.style.display = 'block'
    status.className = 'boost-warning'
    status.textContent = result.message || 'Ce prospect existe deja'
    if (result.crm_url) {
      setTimeout(() => window.open(result.crm_url, '_blank'), 1500)
    }
  } else {
    status.style.display = 'block'
    status.className = 'boost-success'
    status.textContent = '\u2713 ' + (result.message || 'Prospect enregistre !')
    if (result.crm_url) {
      const link = document.createElement('a')
      link.href = result.crm_url
      link.target = '_blank'
      link.textContent = ' Ouvrir dans le CRM \u2192'
      link.style.cssText = 'color:#4ade80; text-decoration:underline; margin-left:4px; font-size:12px;'
      status.appendChild(link)
    }
  }

  btn.disabled = false
  btn.textContent = 'Enregistrer dans le CRM'
}

// Main: detect profile and show panel
async function initLinkedIn() {
  if (!isProfilePage()) {
    removePanel()
    return
  }

  const currentUrl = window.location.href.split('?')[0]
  if (currentUrl === lastProfileUrl) return
  lastProfileUrl = currentUrl

  // Wait for page content to load
  await new Promise(r => setTimeout(r, 1500))

  const data = extractProfileData()
  if (!data.nom && !data.prenom) return

  // Check if already in CRM
  const password = await BoostConfig.getPassword()
  if (password) {
    try {
      const result = await BoostAPI.lookupProspect(null, data.nom)
      if (result.found) {
        showAlreadyInCRM(result.prospect)
        return
      }
    } catch {
      // Lookup failed, show capture form anyway
    }
  }

  showCapturePanel(data)
}

// Watch for SPA navigation (LinkedIn is a SPA)
let lastUrl = window.location.href
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href
    setTimeout(initLinkedIn, 1000)
  }
})

urlObserver.observe(document.body, { childList: true, subtree: true })

// Initial run
setTimeout(initLinkedIn, 2000)
