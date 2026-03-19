// Boost CRM — Gmail Content Script
// Auto-detects opened emails and shows prospect panel with AI reply

let lastProcessedEmail = null

// === Email detection ===

function extractSenderEmail() {
  // .gD[email] is Gmail's specific sender element in opened emails
  const senders = document.querySelectorAll('.gD[email]')
  let senderEl = null

  if (senders.length === 1) {
    senderEl = senders[0]
  } else if (senders.length > 1) {
    for (const el of senders) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.top < window.innerHeight) {
        senderEl = el
        break
      }
    }
    if (!senderEl) senderEl = senders[0]
  }

  if (!senderEl) return null

  const email = senderEl.getAttribute('email')
  const name = senderEl.getAttribute('name') || senderEl.textContent?.trim()

  if (!email) return null

  let prenom = ''
  let nom = ''
  if (name && name !== email) {
    const parts = name.split(/\s+/)
    if (parts.length >= 2) {
      prenom = parts[0]
      nom = parts.slice(1).join(' ')
    } else {
      nom = name
    }
  }

  return { email, prenom, nom }
}

function extractSubject() {
  const subjectEl = document.querySelector('h2[data-thread-perm-id]')
    || document.querySelector('.hP')
  return subjectEl?.textContent?.trim() || ''
}

function extractLastMessageBody() {
  // Gmail message bodies
  const messages = document.querySelectorAll('[data-message-id] [dir="ltr"]')
  if (messages.length > 0) {
    return messages[messages.length - 1].innerText?.substring(0, 2000) || ''
  }

  // Fallback: .a3s is Gmail's message body class
  const bodies = document.querySelectorAll('.a3s.aiL')
  if (bodies.length > 0) {
    return bodies[bodies.length - 1].innerText?.substring(0, 2000) || ''
  }

  return ''
}

// === Panel rendering ===

function removePanel() {
  const existing = document.getElementById('boost-crm-panel')
  if (existing) existing.remove()
}

function showProspectPanel(prospect, senderEmail, subject, body) {
  removePanel()

  const stageLabels = {
    ciblage: 'Ciblage', touch_1: 'Touch 1', touch_2: 'Touch 2', touch_3: 'Touch 3',
    nurturing: 'Nurturing', repondu: 'Repondu', call_decouverte: 'Call decouverte',
    devis: 'Devis', client: 'Client', refuse: 'Refuse', bounced: 'Bounced',
  }
  const stage = prospect.pipeline_stage || 'ciblage'

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
        <div class="boost-name">${prospect.prenom || ''} ${prospect.nom || ''}</div>
        <div class="boost-company">${prospect.entreprise || ''}</div>
        <span class="boost-stage boost-stage-${stage}">
          ${prospect.pipeline_stage_label || stageLabels[stage] || stage}
        </span>
      </div>

      ${prospect.derniere_note ? `
        <div class="boost-note">
          <div class="boost-note-label">Derniere note</div>
          <div class="boost-note-text">${prospect.derniere_note.substring(0, 150)}${prospect.derniere_note.length > 150 ? '...' : ''}</div>
        </div>
      ` : ''}

      ${prospect.prochaine_action_desc ? `
        <div class="boost-action">
          <div class="boost-action-label">Prochaine action</div>
          <div class="boost-action-text">${prospect.prochaine_action_desc}</div>
        </div>
      ` : ''}

      <div class="boost-buttons">
        <button class="boost-btn boost-btn-primary" id="boost-generate-reply">
          \uD83E\uDD16 Generer une reponse
        </button>
        <button class="boost-btn boost-btn-secondary" id="boost-add-note">
          \uD83D\uDCDD Ajouter une note
        </button>
        <button class="boost-btn boost-btn-secondary" id="boost-open-crm">
          \uD83D\uDCC2 Ouvrir dans le CRM
        </button>
      </div>

      <div id="boost-reply-area" style="display:none;"></div>
      <div id="boost-note-area" style="display:none;"></div>
    </div>
  `

  // Insert in Gmail (alongside the thread)
  const gmailMain = document.querySelector('[role="main"]')
  if (gmailMain && gmailMain.parentElement) {
    gmailMain.parentElement.appendChild(panel)
  } else {
    document.body.appendChild(panel)
  }

  // Event listeners
  document.getElementById('boost-close').addEventListener('click', removePanel)

  document.getElementById('boost-generate-reply').addEventListener('click',
    () => handleGenerateReply(prospect, senderEmail, subject, body))

  document.getElementById('boost-add-note').addEventListener('click',
    () => handleAddNote(prospect))

  document.getElementById('boost-open-crm').addEventListener('click', async () => {
    const crmUrl = await BoostConfig.getCrmUrl()
    window.open(crmUrl + '/prospects/' + prospect.id, '_blank')
  })
}

function showUnknownPanel(email) {
  removePanel()

  const panel = document.createElement('div')
  panel.id = 'boost-crm-panel'
  panel.innerHTML = `
    <div class="boost-panel boost-panel-small">
      <div class="boost-panel-header">
        <span class="boost-logo">\u26A1</span>
        <span class="boost-title">Boost CRM</span>
        <button class="boost-close" id="boost-close">\u2715</button>
      </div>
      <div class="boost-unknown">
        <div class="boost-unknown-text">Contact inconnu</div>
        <div class="boost-unknown-email">${email}</div>
      </div>
    </div>
  `

  const gmailMain = document.querySelector('[role="main"]')
  if (gmailMain && gmailMain.parentElement) {
    gmailMain.parentElement.appendChild(panel)
  } else {
    document.body.appendChild(panel)
  }

  document.getElementById('boost-close').addEventListener('click', removePanel)
}

// === AI Reply Generation ===

async function handleGenerateReply(prospect, email, subject, body) {
  const replyArea = document.getElementById('boost-reply-area')
  replyArea.style.display = 'block'
  replyArea.innerHTML = '<div class="boost-loading">\u23F3 Generation en cours...</div>'

  const result = await BoostAPI.generateReply({
    prospect_id: prospect.id,
    prospect_email: email,
    email_subject: subject,
    email_body: body,
  })

  if (result.error) {
    replyArea.innerHTML = `<div class="boost-error">Erreur : ${result.error}</div>`
    return
  }

  replyArea.innerHTML = `
    <div class="boost-reply">
      <div class="boost-reply-label">Reponse generee :</div>
      <textarea class="boost-reply-text" id="boost-reply-text" rows="10">${escapeHtml(result.reply || '')}</textarea>
      <div class="boost-reply-buttons">
        <button class="boost-btn boost-btn-primary" id="boost-insert-reply">
          Inserer dans Gmail
        </button>
        <button class="boost-btn boost-btn-secondary" id="boost-regenerate">
          Regenerer
        </button>
      </div>
    </div>
  `

  document.getElementById('boost-insert-reply').addEventListener('click', insertReplyInGmail)
  document.getElementById('boost-regenerate').addEventListener('click',
    () => handleGenerateReply(prospect, email, subject, body))
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// === Insert reply into Gmail compose ===

function insertReplyInGmail() {
  const replyText = document.getElementById('boost-reply-text').value

  // Click Gmail's Reply button if compose area isn't open
  const replyButton = document.querySelector('[data-tooltip="R\u00e9pondre"]')
    || document.querySelector('[data-tooltip="Reply"]')
    || document.querySelector('[aria-label="R\u00e9pondre"]')
    || document.querySelector('[aria-label="Reply"]')

  if (replyButton) {
    replyButton.click()
  }

  // Wait for the compose area to open
  setTimeout(() => {
    const replyBox = document.querySelector('[role="textbox"][aria-label*="R\u00e9pondre"]')
      || document.querySelector('[role="textbox"][aria-label*="Reply"]')
      || document.querySelector('[role="textbox"][g_editable="true"]')
      || document.querySelector('.editable[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"][aria-label]')

    if (replyBox) {
      replyBox.focus()
      replyBox.innerHTML = replyText
        .split('\n')
        .map(line => `<div>${line || '<br>'}</div>`)
        .join('')

      // Trigger input event so Gmail detects the change
      replyBox.dispatchEvent(new Event('input', { bubbles: true }))

      // Visual feedback
      const insertBtn = document.getElementById('boost-insert-reply')
      if (insertBtn) {
        insertBtn.textContent = '\u2713 Insere !'
        insertBtn.disabled = true
        insertBtn.style.background = '#22c55e'
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(replyText).then(() => {
        const insertBtn = document.getElementById('boost-insert-reply')
        if (insertBtn) {
          insertBtn.textContent = '\u2713 Copie dans le presse-papier'
          insertBtn.disabled = true
        }
      }).catch(() => {
        alert('Impossible de trouver le champ de reponse Gmail. Copiez le texte manuellement.')
      })
    }
  }, 600)
}

// === Note handling ===

function handleAddNote(prospect) {
  const noteArea = document.getElementById('boost-note-area')
  noteArea.style.display = 'block'
  noteArea.innerHTML = `
    <div class="boost-note-input">
      <textarea class="boost-note-textarea" id="boost-note-input"
        rows="3" placeholder="Ajouter une note..."></textarea>
      <div class="boost-note-buttons">
        <button class="boost-btn boost-btn-primary" id="boost-save-note">
          Sauvegarder
        </button>
        <button class="boost-btn boost-btn-secondary" id="boost-cancel-note">
          Annuler
        </button>
      </div>
    </div>
  `

  document.getElementById('boost-save-note').addEventListener('click', async () => {
    const note = document.getElementById('boost-note-input').value
    if (!note.trim()) return

    const btn = document.getElementById('boost-save-note')
    btn.disabled = true
    btn.textContent = 'Sauvegarde...'

    const result = await BoostAPI.addNote(prospect.id, note)
    if (!result.error) {
      noteArea.innerHTML = '<div class="boost-success">\u2713 Note sauvegardee</div>'
      setTimeout(() => { noteArea.style.display = 'none' }, 2000)
    } else {
      noteArea.innerHTML = `<div class="boost-error">Erreur : ${result.error}</div>`
    }
  })

  document.getElementById('boost-cancel-note').addEventListener('click', () => {
    noteArea.style.display = 'none'
  })
}

// === Main observer ===

const observer = new MutationObserver(async () => {
  const sender = extractSenderEmail()
  if (!sender || sender.email === lastProcessedEmail) return

  lastProcessedEmail = sender.email

  // Small delay to let the email body render
  await new Promise(r => setTimeout(r, 500))

  const subject = extractSubject()
  const body = extractLastMessageBody()

  // Look up prospect in CRM
  const result = await BoostAPI.findProspectByEmail(sender.email)

  if (result.found) {
    showProspectPanel(result.prospect, sender.email, subject, body)
  } else {
    showUnknownPanel(sender.email)
  }
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})
