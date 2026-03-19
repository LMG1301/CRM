// Boost CRM — LinkedIn Profile Scraper (minimal)
// Scrapes basic info and sends it to the side panel via background.js

function scrapeProfile() {
  const name = document.querySelector('h1')?.innerText?.trim() || '';
  if (!name) return;

  const headline = document.querySelector('.text-body-medium')?.innerText?.trim() || '';
  const url = window.location.href.split('?')[0];

  // Company: first /company/ link in the top 600px
  let company = '';
  document.querySelectorAll('a[href*="/company/"]').forEach(link => {
    if (!company && link.getBoundingClientRect().top < 600) {
      const t = link.innerText?.trim()?.split('\n')[0];
      if (t && t.length > 1 && t.length < 80) company = t;
    }
  });

  // Fallback: extract from headline
  if (!company && headline) {
    const match = headline.match(/(?:at|chez|@)\s+(.+?)(?:\s*[|]|$)/i);
    if (match) company = match[1].trim();
  }

  // Location
  const location = document.querySelector('.text-body-small.inline.t-black--light.break-words')?.innerText?.trim() || '';

  chrome.runtime.sendMessage({
    type: 'LINKEDIN_PROFILE',
    data: { name, headline, company, url, location }
  });
}

// Watch URL changes (LinkedIn is a SPA)
let lastUrl = '';
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    if (lastUrl.includes('/in/')) {
      setTimeout(scrapeProfile, 2000);
    }
  }
}, 1000);

if (window.location.pathname.includes('/in/')) {
  setTimeout(scrapeProfile, 2000);
}
