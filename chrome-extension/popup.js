// Boost CRM — Popup

const DEFAULT_CRM_URL = 'https://boost-crm-six.vercel.app'

document.addEventListener('DOMContentLoaded', async () => {
  const { crm_url, crm_password } = await chrome.storage.local.get(['crm_url', 'crm_password'])
  document.getElementById('crmUrl').value = crm_url || DEFAULT_CRM_URL
  document.getElementById('crmPassword').value = crm_password || ''

  // Test connection
  const statusDot = document.getElementById('status-dot')
  const statusText = document.getElementById('status-text')

  try {
    const url = crm_url || DEFAULT_CRM_URL
    const response = await fetch(url + '/api/health', { signal: AbortSignal.timeout(5000) })
    if (response.ok) {
      statusDot.className = 'status-dot connected'
      statusText.textContent = 'Connecte'
    } else {
      statusDot.className = 'status-dot disconnected'
      statusText.textContent = 'Erreur serveur'
    }
  } catch {
    statusDot.className = 'status-dot disconnected'
    statusText.textContent = 'Non connecte'
  }

  // Save settings
  document.getElementById('save').addEventListener('click', async () => {
    const url = document.getElementById('crmUrl').value.trim().replace(/\/$/, '')
    const password = document.getElementById('crmPassword').value.trim()

    await chrome.storage.local.set({
      crm_url: url || DEFAULT_CRM_URL,
      crm_password: password,
    })

    const feedback = document.getElementById('save-feedback')
    feedback.style.display = 'block'
    setTimeout(() => { feedback.style.display = 'none' }, 2000)
  })
})
