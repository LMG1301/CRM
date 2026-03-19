console.log('BOOST CRM: LinkedIn content script loaded');

// === State ===
let currentUrl = '';
let panelOpen = false;

// === Tab injection (always visible on right edge) ===
function injectTab() {
  if (document.getElementById('boost-crm-tab')) return;
  const tab = document.createElement('div');
  tab.id = 'boost-crm-tab';
  tab.textContent = '\u26A1 CRM';
  tab.addEventListener('click', togglePanel);
  document.body.appendChild(tab);
}

function togglePanel() {
  if (panelOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

function openPanel() {
  let panel = document.getElementById('boost-crm-panel');
  if (panel) {
    panel.classList.remove('hidden');
  } else {
    // Scrape and create
    const data = scrapeProfile();
    if (!data.name) {
      // Not on a profile page, show empty state
      createEmptyPanel();
    } else {
      createLinkedInPanel(data);
    }
  }
  panelOpen = true;
  const tab = document.getElementById('boost-crm-tab');
  if (tab) tab.style.display = 'none';
}

function closePanel() {
  const panel = document.getElementById('boost-crm-panel');
  if (panel) panel.classList.add('hidden');
  panelOpen = false;
  const tab = document.getElementById('boost-crm-tab');
  if (tab) tab.style.display = 'flex';
}

function removePanel() {
  const existing = document.getElementById('boost-crm-panel');
  if (existing) existing.remove();
  panelOpen = false;
  const tab = document.getElementById('boost-crm-tab');
  if (tab) tab.style.display = 'flex';
}

// === Profile detection ===
function isOnProfile() {
  return !!window.location.pathname.match(/\/in\/[^/]+/);
}

// Watch URL changes (LinkedIn SPA)
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== currentUrl) {
    currentUrl = window.location.href;
    // Remove old panel when navigating
    removePanel();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// === Company scraping (clean, avoids DOM concatenation) ===
function scrapeCompany() {
  // PRIORITE 1 : le lien company avec data-field (logo experience)
  const sideCompany = document.querySelector(
    'a[href*="/company/"][data-field="experience_company_logo"]'
  );
  if (sideCompany) {
    const text = sideCompany.querySelector('span')?.innerText
      || sideCompany.innerText;
    if (text?.trim()) return text.trim().split('\n')[0];
  }

  // PRIORITE 2 : liens /company/ dans la premiere section (header profil)
  // Prendre le PREMIER span avec texte court et propre
  const companyLinks = document.querySelectorAll(
    'section:first-of-type a[href*="/company/"]'
  );
  for (const link of companyLinks) {
    const spans = link.querySelectorAll('span');
    for (const span of spans) {
      const t = span.innerText?.trim();
      if (t && t.length > 1 && t.length < 60 && !t.match(/^\d+$/)) {
        return t.split('\n')[0];
      }
    }
  }

  // PRIORITE 3 : texte a cote du premier logo company
  const logos = document.querySelectorAll('img[alt*="logo"]');
  for (const logo of logos) {
    const parent = logo.closest('a[href*="/company/"]');
    if (parent) {
      const t = parent.innerText?.trim();
      if (t && t.length > 1 && t.length < 60) return t.split('\n')[0];
    }
  }

  // PRIORITE 4 : extraire depuis le headline
  const headline = document.querySelector('.text-body-medium')?.innerText || '';
  const match = headline.match(/(?:at|chez|@)\s+(.+?)(?:\s*[|]|$)/i);
  if (match) return match[1].trim();

  return '';
}

function scrapeProfile() {
  // NAME
  const nameEl = document.querySelector('h1.text-heading-xlarge')
    || document.querySelector('h1');
  const fullName = nameEl?.innerText?.trim() || '';

  // HEADLINE
  const headlineEl = document.querySelector('.text-body-medium.break-words')
    || document.querySelector('div.text-body-medium');
  const headline = headlineEl?.innerText?.trim() || '';

  // COMPANY (aggressive)
  const company = scrapeCompany();

  // TITLE: extract from headline
  let title = headline;
  if (headline && company) {
    // Remove company from headline to get just the title
    const separators = [
      { regex: /^(.+?)\s+chez\s+.+$/i, titleIdx: 1 },
      { regex: /^(.+?)\s+at\s+.+$/i, titleIdx: 1 },
      { regex: /^(.+?)\s+@\s+.+$/i, titleIdx: 1 },
      { regex: /^(.+?)\s*\|\s*.+$/, titleIdx: 1 },
      { regex: /^(.+?)\s+[-\u2013\u2014]\s+.+$/, titleIdx: 1 },
    ];
    for (const sep of separators) {
      const match = headline.match(sep.regex);
      if (match) {
        title = match[sep.titleIdx].trim();
        break;
      }
    }
  }

  // LOCATION
  const locationEl = document.querySelector('.text-body-small.inline.t-black--light.break-words')
    || document.querySelector('span.text-body-small[class*="t-black--light"]');
  const location = locationEl?.innerText?.trim() || '';

  // LINKEDIN URL
  const linkedinUrl = window.location.href.split('?')[0];

  // Split name
  const nameParts = fullName.split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  return {
    name: fullName,
    firstName,
    lastName,
    company,
    title,
    location,
    linkedinUrl,
    headline,
  };
}

// === Panel creation ===
function createEmptyPanel() {
  removePanel();
  const panel = document.createElement('div');
  panel.id = 'boost-crm-panel';
  panel.innerHTML = `
    <div class="boost-header">
      <span>\u26A1 Boost CRM</span>
      <button class="boost-close" id="boost-close">\u2715</button>
    </div>
    <div style="text-align:center; padding:20px 0; color:#8fa8a2;">
      Naviguez vers un profil LinkedIn pour capturer un prospect.
    </div>
  `;
  document.body.appendChild(panel);
  document.getElementById('boost-close').addEventListener('click', closePanel);
}

function createLinkedInPanel(data) {
  removePanel();

  const panel = document.createElement('div');
  panel.id = 'boost-crm-panel';
  panel.innerHTML = `
    <div class="boost-header">
      <span>\u26A1 Boost CRM</span>
      <button class="boost-close" id="boost-close">\u2715</button>
    </div>

    <div class="boost-form" id="boost-form-body">
      <div class="boost-row">
        <div class="boost-field">
          <label>Prenom</label>
          <input type="text" id="boost-firstname" value="${escapeAttr(data.firstName)}">
        </div>
        <div class="boost-field">
          <label>Nom</label>
          <input type="text" id="boost-lastname" value="${escapeAttr(data.lastName)}">
        </div>
      </div>

      <div class="boost-field">
        <label>Entreprise</label>
        <input type="text" id="boost-company" value="${escapeAttr(data.company)}">
      </div>

      <div class="boost-field">
        <label>Fonction</label>
        <input type="text" id="boost-title" value="${escapeAttr(data.title)}">
      </div>

      <div class="boost-field">
        <label>Email</label>
        <input type="text" id="boost-email" placeholder="email@exemple.com">
      </div>

      <div class="boost-field">
        <label>Telephone</label>
        <input type="text" id="boost-phone" placeholder="+33 6 ...">
      </div>

      <div class="boost-field">
        <label>LinkedIn</label>
        <input type="text" id="boost-linkedin" value="${escapeAttr(data.linkedinUrl)}" readonly>
      </div>

      <div class="boost-field">
        <label>Localisation</label>
        <input type="text" id="boost-location" value="${escapeAttr(data.location)}">
      </div>

      <div class="boost-field">
        <label>Stage pipeline</label>
        <select id="boost-stage">
          <option value="ciblage" selected>Ciblage</option>
          <option value="contacte">Contacte</option>
          <option value="repondu">Repondu</option>
        </select>
      </div>

      <button class="boost-btn-save" id="boost-save">
        Enregistrer dans le CRM
      </button>

      <div id="boost-status"></div>
    </div>
  `;

  document.body.appendChild(panel);
  panelOpen = true;
  const tab = document.getElementById('boost-crm-tab');
  if (tab) tab.style.display = 'none';

  document.getElementById('boost-close').addEventListener('click', closePanel);
  document.getElementById('boost-save').addEventListener('click', saveProspect);
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function saveProspect() {
  const statusEl = document.getElementById('boost-status');
  statusEl.innerHTML = '<span style="color:#fbbf24;">Enregistrement...</span>';

  const btn = document.getElementById('boost-save');
  btn.disabled = true;

  const data = {
    prenom: document.getElementById('boost-firstname').value.trim(),
    nom: document.getElementById('boost-lastname').value.trim(),
    entreprise: document.getElementById('boost-company').value.trim(),
    fonction: document.getElementById('boost-title').value.trim(),
    email: document.getElementById('boost-email').value.trim() || null,
    telephone: document.getElementById('boost-phone').value.trim() || null,
    linkedin_url: document.getElementById('boost-linkedin').value.trim(),
    localisation: document.getElementById('boost-location').value.trim(),
    pipeline_stage: document.getElementById('boost-stage').value,
    source: 'LinkedIn',
  };

  const result = await BoostAPI.createProspect(data);

  if (result.error) {
    statusEl.innerHTML = `<span style="color:#ef4444;">Erreur : ${result.error}</span>`;
    btn.disabled = false;
  } else if (result.status === 'duplicate') {
    statusEl.innerHTML = `<span style="color:#fbbf24;">${result.message || 'Prospect deja existant'}</span>`;
    btn.disabled = false;
  } else {
    statusEl.innerHTML = '<span style="color:#22c55e;">Enregistre \u2713</span>';
    btn.textContent = 'Enregistre \u2713';
    btn.style.background = '#22c55e';
  }
}

// === Init ===
injectTab();
