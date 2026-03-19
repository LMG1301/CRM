// Boost CRM — Options page

const DEFAULT_CRM_URL = 'https://boost-crm-six.vercel.app'

document.addEventListener('DOMContentLoaded', async () => {
  const { crm_url, crm_password } = await chrome.storage.local.get(['crm_url', 'crm_password'])
  document.getElementById('crmUrl').value = crm_url || DEFAULT_CRM_URL
  document.getElementById('crmPassword').value = crm_password || ''

  document.getElementById('save').addEventListener('click', async () => {
    const url = document.getElementById('crmUrl').value.trim().replace(/\/$/, '')
    const password = document.getElementById('crmPassword').value.trim()

    await chrome.storage.local.set({
      crm_url: url || DEFAULT_CRM_URL,
      crm_password: password,
    })

    const status = document.getElementById('status')
    status.style.display = 'block'
    setTimeout(() => { status.style.display = 'none' }, 2000)
  })
})
