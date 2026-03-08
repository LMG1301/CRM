// Boost CRM — Gmail content script
// Detects when an email is opened and extracts sender info + signature

let lastDetectedEmail = null

function extractSenderInfo() {
  // Use .gD[email] specifically — Gmail's sender element in opened emails
  // Do NOT use generic [email] which matches random Gmail UI elements
  let senderEl = null
  const senders = document.querySelectorAll('.gD[email]')

  if (senders.length === 1) {
    senderEl = senders[0]
  } else if (senders.length > 1) {
    // Multiple senders (thread) — take the first visible one
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

  // Parse name into prenom/nom
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

  // Extract company from professional email domain
  let entreprise = ''
  const domain = email.split('@')[1]
  const freeProviders = ['gmail.com','yahoo.com','yahoo.fr','hotmail.com','hotmail.fr','outlook.com','outlook.fr','live.com','live.fr','icloud.com','orange.fr','free.fr','sfr.fr','wanadoo.fr','laposte.net','protonmail.com','aol.com','msn.com','me.com','mail.com']
  if (domain && !freeProviders.includes(domain.toLowerCase())) {
    const companyPart = domain.split('.')[0]
    entreprise = companyPart.charAt(0).toUpperCase() + companyPart.slice(1)
  }

  // Extract signature text
  const signatureText = extractSignature()

  return { email, prenom, nom, entreprise, signatureText }
}

function extractSignature() {
  // Method 1: Gmail signature div
  const sigDiv = document.querySelector('div.gmail_signature')
  if (sigDiv) {
    return sigDiv.textContent?.trim().slice(0, 1000) || ''
  }

  // Method 2: Heuristic — look for the last part of the email body
  // that contains phone numbers, URLs, or job titles
  const emailBody = document.querySelector('.a3s.aiL') || document.querySelector('.ii.gt')
  if (!emailBody) return ''

  const text = emailBody.textContent || ''
  const lines = text.split('\n').filter(l => l.trim())

  // Take the last ~10 lines and check if they look like a signature
  const lastLines = lines.slice(-10)
  const sigPatterns = [
    /[\+\(]?\d[\d\s\-\(\)]{7,}/,  // Phone numbers
    /https?:\/\/\S+/,              // URLs
    /www\.\S+/,                    // www URLs
    /\.(com|fr|net|org|io)/,       // Domain extensions
    /@/,                           // Email addresses
    /directeur|manager|ceo|cto|vp|head|responsable|chef/i,  // Job titles
  ]

  const sigLines = []
  let foundSig = false
  for (const line of lastLines) {
    const trimmed = line.trim()
    if (sigPatterns.some(p => p.test(trimmed))) {
      foundSig = true
    }
    if (foundSig) {
      sigLines.push(trimmed)
    }
  }

  return sigLines.join('\n').slice(0, 1000)
}

// Watch for email opens using MutationObserver
const observer = new MutationObserver(() => {
  // Use .gD[email] specifically — do NOT use generic [email]
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
  if (!senderEl) return

  const currentEmail = senderEl.getAttribute('email')
  if (currentEmail && currentEmail !== lastDetectedEmail) {
    lastDetectedEmail = currentEmail

    // Small delay to let the email body render
    setTimeout(() => {
      const data = extractSenderInfo()
      if (data) {
        chrome.runtime.sendMessage({
          type: 'GMAIL_CONTACT_DETECTED',
          data,
        })
      }
    }, 500)
  }
})

observer.observe(document.body, {
  childList: true,
  subtree: true,
})
