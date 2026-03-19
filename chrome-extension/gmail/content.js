console.log('BOOST CRM: Gmail content script loaded');

let lastSenderEmail = '';

// Injecter l'onglet au chargement
injectTab();

// Observer les changements d'email (debounced)
const observer = new MutationObserver(debounce(() => {
  const sender = getSenderInfo();
  if (sender.email && sender.email !== lastSenderEmail) {
    lastSenderEmail = sender.email;
    const panel = document.getElementById('boost-crm-panel');
    if (panel && !panel.classList.contains('hidden')) {
      loadProspectPanel(sender.email, sender.name);
    }
  }
}, 1000));
observer.observe(document.body, { childList: true, subtree: true });

function debounce(fn, ms) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

// === Email detection ===

function getSenderInfo() {
  // Prefer .gD[email] (Gmail sender element) as it's more reliable
  const senders = document.querySelectorAll('.gD[email]');
  let el = null;
  if (senders.length === 1) {
    el = senders[0];
  } else if (senders.length > 1) {
    // Pick the visible one
    for (const s of senders) {
      const rect = s.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) { el = s; break; }
    }
    if (!el) el = senders[0];
  }
  // Fallback
  if (!el) el = document.querySelector('[data-message-id] [email]');

  const email = el?.getAttribute('email') || '';
  const name = el?.getAttribute('name') || el?.textContent?.trim() || '';
  console.log('[Boost CRM] getSenderInfo:', email, name);
  return { email, name };
}

function getEmailContent() {
  const subjectEl = document.querySelector('h2[data-thread-perm-id]')
    || document.querySelector('.hP');
  const subject = subjectEl?.textContent || '';

  const messages = document.querySelectorAll('[data-message-id] [dir="ltr"]');
  const lastBody = messages.length > 0
    ? messages[messages.length - 1].innerText?.substring(0, 2000)
    : '';

  return { subject, body: lastBody || '' };
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// === Tab + Panel (same pattern as LinkedIn) ===

function injectTab() {
  if (document.getElementById('boost-crm-tab')) return;
  const tab = document.createElement('div');
  tab.id = 'boost-crm-tab';
  tab.textContent = '\u26A1 CRM';
  tab.onclick = () => {
    const sender = getSenderInfo();
    openPanel();
    loadProspectPanel(sender.email, sender.name);
  };
  document.body.appendChild(tab);
}

function openPanel() {
  let panel = document.getElementById('boost-crm-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'boost-crm-panel';
    document.body.appendChild(panel);
  }
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="boost-loading">Chargement...</div>';
  const tab = document.getElementById('boost-crm-tab');
  if (tab) tab.style.display = 'none';
}

function closePanel() {
  const panel = document.getElementById('boost-crm-panel');
  if (panel) panel.classList.add('hidden');
  const tab = document.getElementById('boost-crm-tab');
  if (tab) tab.style.display = 'flex';
}

// === Load prospect panel ===

async function loadProspectPanel(email, name) {
  const panel = document.getElementById('boost-crm-panel');
  if (!panel) return;

  panel.innerHTML = '<div class="boost-loading">Recherche du contact...</div>';

  let prospect = null;
  if (email) {
    console.log('[Boost CRM] Looking up:', email, name);
    const result = await BoostAPI.findProspectByEmail(email, name);
    console.log('[Boost CRM] Lookup result:', JSON.stringify(result).substring(0, 300));
    if (result.found) prospect = result.prospect;
  }

  if (prospect) {
    showFoundProspect(panel, prospect, email, name);
  } else {
    showUnknownContact(panel, email, name);
  }
}

// === Model selector HTML ===

function modelSelectorHtml() {
  return `
    <select id="boost-model" style="
      width:100%; padding:6px; margin-bottom:8px;
      background:rgba(255,255,255,0.08);
      border:1px solid rgba(255,255,255,0.15);
      border-radius:4px; color:#f0f4f3; font-size:12px;
      -webkit-text-fill-color:#f0f4f3;
    ">
      <option value="claude-haiku-4-5-20251001">Haiku (rapide)</option>
      <option value="claude-sonnet-4-20250514" selected>Sonnet (qualite)</option>
    </select>
  `;
}

// === Prospect found ===

function showFoundProspect(panel, prospect, email, senderName) {
  const stageLabels = {
    ciblage: 'Ciblage', touch_1: 'Touch 1', touch_2: 'Touch 2', touch_3: 'Touch 3',
    nurturing: 'Nurturing', repondu: 'Repondu', call_decouverte: 'Call decouverte',
    devis: 'Devis', client: 'Client', refuse: 'Refuse', bounced: 'Bounced',
  };
  const stage = prospect.pipeline_stage || 'ciblage';

  panel.innerHTML = `
    <div class="boost-header">
      <span>\u26A1 Boost CRM</span>
      <button class="boost-close" id="boost-close">\u2715</button>
    </div>

    <div class="boost-prospect-info">
      <div class="boost-name">${escapeHtml(prospect.prenom || '')} ${escapeHtml(prospect.nom || '')}</div>
      <div class="boost-company">${escapeHtml(prospect.entreprise || '')}</div>
      <span class="boost-stage boost-stage-${stage}">
        ${escapeHtml(prospect.pipeline_stage_label || stageLabels[stage] || stage)}
      </span>
    </div>

    ${prospect.derniere_note ? `
      <div class="boost-note-block">
        <div class="boost-note-label">Derniere note</div>
        <div class="boost-note-text">${escapeHtml(prospect.derniere_note.substring(0, 200))}${prospect.derniere_note.length > 200 ? '...' : ''}</div>
      </div>
    ` : ''}

    ${prospect.prochaine_action_desc ? `
      <div class="boost-note-block">
        <div class="boost-note-label">Prochaine action</div>
        <div class="boost-note-text">${escapeHtml(prospect.prochaine_action_desc)}</div>
      </div>
    ` : ''}

    <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:12px; margin-top:8px;">
      <div style="font-size:11px; color:#8fa8a2; font-weight:600; margin-bottom:8px;">Repondre a cet email</div>
      ${modelSelectorHtml()}
      <button class="boost-btn boost-btn-primary" id="boost-auto-reply">
        \uD83E\uDD16 Generer automatiquement
      </button>
      <div style="margin-top:8px;">
        <textarea id="boost-instruction" placeholder="Ex: dis-lui qu'on est dispo mardi..."
          style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#f0f4f3; font-size:12px; resize:none; height:45px; font-family:inherit; box-sizing:border-box; -webkit-text-fill-color:#f0f4f3;"></textarea>
        <button class="boost-btn boost-btn-primary" id="boost-instruct-reply" style="margin-top:4px;">
          Rediger avec cette instruction
        </button>
      </div>
    </div>

    <div id="boost-reply-result"></div>

    <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:8px; margin-top:12px;">
      <button class="boost-btn boost-btn-secondary" id="boost-add-note">\uD83D\uDCDD Ajouter une note</button>
      <button class="boost-btn boost-btn-secondary" id="boost-open-crm" style="margin-top:4px;">\uD83D\uDCC2 Ouvrir dans le CRM</button>
    </div>
    <div id="boost-note-area"></div>
  `;

  document.getElementById('boost-close').addEventListener('click', closePanel);

  document.getElementById('boost-auto-reply').addEventListener('click',
    () => generateReply(prospect.id, email, senderName, null));

  document.getElementById('boost-instruct-reply').addEventListener('click', () => {
    const instr = document.getElementById('boost-instruction').value;
    if (instr.trim()) generateReply(prospect.id, email, senderName, instr);
  });

  document.getElementById('boost-instruction').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('boost-instruct-reply').click();
    }
  });

  document.getElementById('boost-add-note').addEventListener('click',
    () => showNoteInput(prospect.id));

  document.getElementById('boost-open-crm').addEventListener('click', async () => {
    const url = await BoostConfig.getCrmUrl();
    window.open(url + '/prospects/' + prospect.id, '_blank');
  });
}

// === Unknown contact ===

function showUnknownContact(panel, email, name) {
  const domain = (email || '').split('@')[1] || '';
  const freeProviders = ['gmail.com','yahoo.com','yahoo.fr','hotmail.com','hotmail.fr','outlook.com','outlook.fr','live.com','live.fr','icloud.com','orange.fr','free.fr','sfr.fr','wanadoo.fr','laposte.net','protonmail.com','aol.com','msn.com','me.com','mail.com'];
  let entrepriseHint = '';
  if (domain && !freeProviders.includes(domain.toLowerCase())) {
    const companyPart = domain.split('.')[0];
    entrepriseHint = companyPart.charAt(0).toUpperCase() + companyPart.slice(1);
  }

  // Extract company from Gmail display name: "Celia TRAYNARD - DAVANTAGE"
  const nameParts = (name || '').split(/[-\u2013|]/);
  const companyFromName = nameParts.length > 1 ? nameParts[nameParts.length - 1].trim() : '';
  if (companyFromName && !entrepriseHint) entrepriseHint = companyFromName;

  const nameWords = (name || '').split(/[-\u2013|]/)[0].trim().split(/\s+/);
  const firstName = nameWords[0] || '';
  const lastName = nameWords.slice(1).join(' ') || '';

  panel.innerHTML = `
    <div class="boost-header">
      <span>\u26A1 Boost CRM</span>
      <button class="boost-close" id="boost-close">\u2715</button>
    </div>

    <div class="boost-unknown">
      <div class="boost-unknown-text">Contact non enregistre</div>
      <div class="boost-unknown-email">${escapeHtml(email)}</div>
      ${name ? `<div style="font-size:13px; color:#f0f4f3; font-weight:600; margin-top:2px;">${escapeHtml(name)}</div>` : ''}
    </div>

    <div class="boost-buttons">
      <button class="boost-btn boost-btn-primary" id="boost-add-prospect">\u2795 Ajouter au CRM</button>
    </div>
    <div id="boost-add-form" style="display:none;"></div>

    <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:12px; margin-top:12px;">
      <div style="font-size:11px; color:#8fa8a2; font-weight:600; margin-bottom:8px;">Repondre a cet email</div>
      ${modelSelectorHtml()}
      <button class="boost-btn boost-btn-secondary" id="boost-auto-reply">
        \uD83E\uDD16 Generer automatiquement
      </button>
      <div style="margin-top:8px;">
        <textarea id="boost-instruction" placeholder="Ex: dis-lui qu'on est dispo mardi..."
          style="width:100%; padding:8px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#f0f4f3; font-size:12px; resize:none; height:45px; font-family:inherit; box-sizing:border-box; -webkit-text-fill-color:#f0f4f3;"></textarea>
        <button class="boost-btn boost-btn-primary" id="boost-instruct-reply" style="margin-top:4px;">
          Rediger avec cette instruction
        </button>
      </div>
    </div>
    <div id="boost-reply-result"></div>
  `;

  document.getElementById('boost-close').addEventListener('click', closePanel);

  document.getElementById('boost-add-prospect').addEventListener('click',
    () => showAddForm(email, name, firstName, lastName, entrepriseHint));

  document.getElementById('boost-auto-reply').addEventListener('click',
    () => generateReply(null, email, name, null));

  document.getElementById('boost-instruct-reply').addEventListener('click', () => {
    const instr = document.getElementById('boost-instruction').value;
    if (instr.trim()) generateReply(null, email, name, instr);
  });

  document.getElementById('boost-instruction').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('boost-instruct-reply').click();
    }
  });
}

// === Generate reply (works with or without prospect_id) ===

async function generateReply(prospectId, email, senderName, instruction) {
  const resultDiv = document.getElementById('boost-reply-result');
  resultDiv.innerHTML = '<div class="boost-loading">\u23F3 Generation en cours...</div>';

  const { subject, body } = getEmailContent();
  const model = document.getElementById('boost-model')?.value || 'claude-sonnet-4-20250514';

  const payload = {
    prospect_id: prospectId,
    prospect_email: email,
    sender_name: senderName || '',
    email_subject: subject,
    email_body: body,
    instruction: instruction,
    model: model,
  };

  console.log('[Boost CRM] generateReply payload:', JSON.stringify(payload).substring(0, 500));

  const result = await BoostAPI.generateReply(payload);

  console.log('[Boost CRM] generateReply result:', result.error || (result.reply || '').substring(0, 100));

  if (result.error) {
    resultDiv.innerHTML = `<div class="boost-error">Erreur : ${escapeHtml(result.error)}</div>`;
    return;
  }

  resultDiv.innerHTML = `
    <div style="margin-top:8px;">
      <textarea id="boost-reply-text" class="boost-reply-text" rows="10">${escapeHtml(result.reply || '')}</textarea>
      <div style="display:flex; gap:6px; margin-top:6px;">
        <button class="boost-btn boost-btn-primary" id="boost-copy" style="flex:1;">
          Copier
        </button>
        <button class="boost-btn boost-btn-secondary" id="boost-regen" style="flex:1;">
          Regenerer
        </button>
      </div>
    </div>
  `;

  document.getElementById('boost-copy').addEventListener('click', () => {
    const text = document.getElementById('boost-reply-text').value;
    navigator.clipboard.writeText(text);
    const btn = document.getElementById('boost-copy');
    btn.textContent = 'Copie \u2713';
    setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
  });

  document.getElementById('boost-regen').addEventListener('click',
    () => generateReply(prospectId, email, senderName, instruction));
}

// === Add to CRM form ===

function showAddForm(email, name, firstName, lastName, entrepriseHint) {
  const form = document.getElementById('boost-add-form');
  form.style.display = 'block';
  form.innerHTML = `
    <div class="boost-form" style="margin-top:8px;">
      <div class="boost-form-row">
        <div class="boost-form-field">
          <label>Prenom</label>
          <input type="text" id="boost-fn" value="${escapeHtml(firstName)}">
        </div>
        <div class="boost-form-field">
          <label>Nom</label>
          <input type="text" id="boost-ln" value="${escapeHtml(lastName)}">
        </div>
      </div>
      <div class="boost-form-field">
        <label>Entreprise</label>
        <input type="text" id="boost-comp" value="${escapeHtml(entrepriseHint)}">
      </div>
      <div class="boost-form-row" style="margin-top:4px;">
        <button class="boost-btn boost-btn-primary" id="boost-save-prospect" style="flex:1;">Enregistrer</button>
        <button class="boost-btn boost-btn-secondary" id="boost-cancel-add" style="flex:1;">Annuler</button>
      </div>
      <div id="boost-save-status" style="font-size:11px; margin-top:4px; text-align:center; min-height:16px;"></div>
    </div>
  `;

  document.getElementById('boost-save-prospect').addEventListener('click', async () => {
    const status = document.getElementById('boost-save-status');
    status.innerHTML = '<span style="color:#fbbf24;">Enregistrement...</span>';

    const result = await BoostAPI.createProspect({
      prenom: document.getElementById('boost-fn').value.trim(),
      nom: document.getElementById('boost-ln').value.trim(),
      email: email,
      entreprise: document.getElementById('boost-comp').value.trim(),
      pipeline_stage: 'ciblage',
      source: 'Gmail',
    });

    if (result.error) {
      status.innerHTML = `<span style="color:#ef4444;">${escapeHtml(result.error)}</span>`;
    } else {
      status.innerHTML = '<span style="color:#22c55e;">Enregistre \u2713</span>';
      setTimeout(() => loadProspectPanel(email, name), 1000);
    }
  });

  document.getElementById('boost-cancel-add').addEventListener('click', () => {
    form.style.display = 'none';
  });
}

// === Note input ===

function showNoteInput(prospectId) {
  const area = document.getElementById('boost-note-area');
  area.innerHTML = `
    <div style="margin-top:8px;">
      <textarea id="boost-note-text" class="boost-note-textarea" rows="3" placeholder="Ajouter une note..."></textarea>
      <div style="display:flex; gap:6px; margin-top:4px;">
        <button class="boost-btn boost-btn-primary" id="boost-save-note" style="flex:1;">Sauvegarder</button>
        <button class="boost-btn boost-btn-secondary" id="boost-cancel-note" style="flex:1;">Annuler</button>
      </div>
    </div>
  `;

  document.getElementById('boost-save-note').addEventListener('click', async () => {
    const note = document.getElementById('boost-note-text').value;
    if (!note.trim()) return;
    const btn = document.getElementById('boost-save-note');
    btn.disabled = true;
    btn.textContent = 'Sauvegarde...';
    const result = await BoostAPI.addNote(prospectId, note);
    if (!result.error) {
      area.innerHTML = '<div class="boost-success">\u2713 Note sauvegardee</div>';
      setTimeout(() => { area.innerHTML = ''; }, 2000);
    } else {
      area.innerHTML = `<div class="boost-error">Erreur : ${escapeHtml(result.error)}</div>`;
    }
  });

  document.getElementById('boost-cancel-note').addEventListener('click', () => {
    area.innerHTML = '';
  });
}
