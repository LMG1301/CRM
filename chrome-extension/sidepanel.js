console.log('[Boost] Side panel script loaded');

// === Config ===
const CRM_URL_KEY = 'crm_url';
const CRM_PASS_KEY = 'crm_password';

async function getCrmUrl() {
  const r = await chrome.storage.local.get(CRM_URL_KEY);
  return r[CRM_URL_KEY] || 'https://boost-crm-six.vercel.app';
}

async function crmFetch(endpoint, options = {}) {
  const url = await getCrmUrl();
  const stored = await chrome.storage.local.get(CRM_PASS_KEY);
  const pass = stored[CRM_PASS_KEY] || 'boost2024';
  try {
    const resp = await fetch(url + endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + pass,
        ...(options.headers || {}),
      }
    });
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}));
      return { error: body.error || 'Erreur ' + resp.status };
    }
    return await resp.json();
  } catch (e) {
    return { error: e.message };
  }
}

function esc(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// === Tabs ===
function showTab(name) {
  ['search', 'reply', 'add'].forEach(t => {
    document.getElementById('panel-' + t).style.display = t === name ? 'block' : 'none';
    document.getElementById('tab-' + t).classList.toggle('active', t === name);
  });
}

document.getElementById('tab-search').addEventListener('click', () => showTab('search'));
document.getElementById('tab-reply').addEventListener('click', () => showTab('reply'));
document.getElementById('tab-add').addEventListener('click', () => showTab('add'));

// === Connection check ===
async function checkConnection() {
  const el = document.getElementById('connection-status');
  const r = await crmFetch('/api/health');
  if (r.status === 'ok') {
    el.innerHTML = '<span style="color:#22c55e;">\u25CF Connecte</span>';
  } else {
    el.innerHTML = '<span style="color:#ef4444;">\u25CF Hors ligne</span>';
  }
}
checkConnection();

// === LinkedIn data auto-fill ===
try {
  chrome.storage.session.get('linkedinProfile', (data) => {
    if (data?.linkedinProfile) fillLinkedInData(data.linkedinProfile);
  });
  chrome.storage.session.onChanged.addListener((changes) => {
    if (changes.linkedinProfile?.newValue) fillLinkedInData(changes.linkedinProfile.newValue);
  });
} catch (e) {
  console.log('[Boost] LinkedIn auto-fill not available:', e.message);
}

function fillLinkedInData(p) {
  const parts = (p.name || '').split(/\s+/);
  document.getElementById('add-fn').value = parts[0] || '';
  document.getElementById('add-ln').value = parts.slice(1).join(' ') || '';
  document.getElementById('add-company').value = p.company || '';
  document.getElementById('add-linkedin').value = p.url || '';
  document.getElementById('add-location').value = p.location || '';
  document.getElementById('search-input').value = p.name || '';
}

// === SEARCH ===
document.getElementById('search-btn').addEventListener('click', searchContact);
document.getElementById('search-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchContact();
});

async function searchContact() {
  const input = document.getElementById('search-input').value.trim();
  if (!input) return;
  const resultEl = document.getElementById('search-result');
  resultEl.innerHTML = '<div class="status status-wait">Recherche...</div>';

  const isEmail = input.includes('@');
  const params = new URLSearchParams();
  if (isEmail) params.set('email', input);
  else params.set('name', input);

  const endpoint = '/api/prospects/by-email?' + params;
  console.log('[Boost] searching:', endpoint);

  let r;
  try {
    r = await crmFetch(endpoint);
    console.log('[Boost] result:', JSON.stringify(r).substring(0, 300));
  } catch (e) {
    console.error('[Boost] fetch error:', e);
    resultEl.innerHTML = '<div class="status status-err">Erreur reseau : ' + esc(e.message) + '</div>';
    return;
  }

  if (r.error) {
    resultEl.innerHTML = '<div class="status status-err">' + esc(r.error) + '</div>';
    return;
  }

  if (r.found) {
    const p = r.prospect;
    const crmUrl = await getCrmUrl();
    resultEl.innerHTML =
      '<div style="margin-top:10px;">' +
        '<div class="prospect-name">' + esc(p.prenom) + ' ' + esc(p.nom) + '</div>' +
        '<div class="prospect-company">' + esc(p.entreprise || '') + '</div>' +
        '<span class="badge">' + esc(p.pipeline_stage_label || p.pipeline_stage) + '</span>' +
        (p.derniere_note ? '<div class="note-block"><div class="note-label">Derniere note</div>' + esc(p.derniere_note.substring(0, 200)) + '</div>' : '') +
        '<div class="section">' +
          '<button class="btn btn-secondary" id="sr-reply">\uD83E\uDD16 Repondre a un email</button>' +
          '<button class="btn btn-secondary" id="sr-open">\uD83D\uDCC2 Ouvrir dans le CRM</button>' +
        '</div>' +
      '</div>';
    document.getElementById('sr-reply').addEventListener('click', () => {
      showTab('reply');
      document.getElementById('reply-email').value = p.email || p.email_pro || input;
      document.getElementById('reply-email').dataset.prospectId = p.id;
    });
    document.getElementById('sr-open').addEventListener('click', () => {
      window.open(crmUrl + '/prospects/' + p.id, '_blank');
    });
  } else {
    resultEl.innerHTML =
      '<div style="margin-top:10px; text-align:center;">' +
        '<div style="color:#8fa8a2; margin-bottom:8px;">Contact non trouve dans le CRM.</div>' +
        '<button class="btn btn-secondary" id="sr-add">+ Ajouter au CRM</button>' +
      '</div>';
    document.getElementById('sr-add').addEventListener('click', () => {
      showTab('add');
      if (isEmail) {
        document.getElementById('add-email').value = input;
      } else {
        const words = input.split(/\s+/);
        document.getElementById('add-fn').value = words[0] || '';
        document.getElementById('add-ln').value = words.slice(1).join(' ') || '';
      }
    });
  }
}

// === REPLY ===
document.getElementById('btn-auto-reply').addEventListener('click', () => doGenerate(null));
document.getElementById('btn-instruct-reply').addEventListener('click', () => {
  const instr = document.getElementById('reply-instruction').value.trim();
  if (instr) doGenerate(instr);
});
document.getElementById('reply-instruction').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const instr = document.getElementById('reply-instruction').value.trim();
    if (instr) doGenerate(instr);
  }
});

async function doGenerate(instruction) {
  const resultEl = document.getElementById('reply-result');
  resultEl.innerHTML = '<div class="status status-wait">\u23F3 Generation en cours...</div>';

  const email = document.getElementById('reply-email').value.trim();
  const body = document.getElementById('reply-body').value;
  const model = document.getElementById('reply-model').value;
  const prospectId = document.getElementById('reply-email').dataset.prospectId || null;

  const r = await crmFetch('/api/gmail-plugin/generate-reply', {
    method: 'POST',
    body: JSON.stringify({
      prospect_id: prospectId,
      prospect_email: email,
      email_subject: '',
      email_body: body,
      instruction: instruction,
      model: model,
    })
  });

  if (r.error) {
    resultEl.innerHTML = '<div class="status status-err">' + esc(r.error) + '</div>';
    return;
  }

  resultEl.innerHTML =
    '<div style="margin-top:10px;">' +
      '<textarea id="reply-text" style="width:100%;padding:10px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#f0f4f3;font-size:13px;height:200px;resize:vertical;font-family:inherit;outline:none;">' + esc(r.reply) + '</textarea>' +
      '<div style="display:flex;gap:6px;margin-top:6px;">' +
        '<button class="btn btn-primary" id="btn-copy" style="flex:1;">Copier</button>' +
        '<button class="btn btn-secondary" id="btn-regen" style="flex:1;">Regenerer</button>' +
      '</div>' +
    '</div>';

  document.getElementById('btn-copy').addEventListener('click', () => {
    const text = document.getElementById('reply-text').value;
    navigator.clipboard.writeText(text);
    const btn = document.getElementById('btn-copy');
    btn.textContent = 'Copie \u2713';
    setTimeout(() => { btn.textContent = 'Copier'; }, 2000);
  });

  document.getElementById('btn-regen').addEventListener('click', () => doGenerate(instruction));
}

// === ADD PROSPECT ===
document.getElementById('btn-save-prospect').addEventListener('click', saveProspect);

async function saveProspect() {
  const statusEl = document.getElementById('add-status');
  statusEl.innerHTML = '<div class="status status-wait">Enregistrement...</div>';

  const btn = document.getElementById('btn-save-prospect');
  btn.disabled = true;

  const r = await crmFetch('/api/prospects/quick-add', {
    method: 'POST',
    body: JSON.stringify({
      prenom: document.getElementById('add-fn').value.trim(),
      nom: document.getElementById('add-ln').value.trim(),
      email: document.getElementById('add-email').value.trim() || null,
      entreprise: document.getElementById('add-company').value.trim() || null,
      fonction: document.getElementById('add-title').value.trim() || null,
      linkedin_url: document.getElementById('add-linkedin').value.trim() || null,
      localisation: document.getElementById('add-location').value.trim() || null,
      pipeline_stage: document.getElementById('add-stage').value,
      source: 'Extension Chrome',
    })
  });

  btn.disabled = false;

  if (r.error) {
    statusEl.innerHTML = '<div class="status status-err">' + esc(r.error) + '</div>';
  } else if (r.status === 'duplicate') {
    statusEl.innerHTML = '<div class="status status-wait">' + esc(r.message || 'Prospect deja existant') + '</div>';
  } else {
    statusEl.innerHTML = '<div class="status status-ok">Enregistre \u2713</div>';
    btn.textContent = 'Enregistre \u2713';
    btn.style.background = '#22c55e';
    // Reset form after 2s
    setTimeout(() => {
      btn.textContent = 'Enregistrer dans le CRM';
      btn.style.background = '';
      document.getElementById('add-fn').value = '';
      document.getElementById('add-ln').value = '';
      document.getElementById('add-email').value = '';
      document.getElementById('add-company').value = '';
      document.getElementById('add-title').value = '';
      document.getElementById('add-linkedin').value = '';
      document.getElementById('add-location').value = '';
      document.getElementById('add-stage').value = 'ciblage';
      statusEl.innerHTML = '';
    }, 2000);
  }
}
