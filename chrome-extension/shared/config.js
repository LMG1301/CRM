// Boost CRM — Shared configuration

const BoostConfig = {
  DEFAULT_URL: 'https://boost-crm-six.vercel.app',

  async getCrmUrl() {
    const result = await chrome.storage.local.get('crm_url')
    return result.crm_url || this.DEFAULT_URL
  },

  async setCrmUrl(url) {
    await chrome.storage.local.set({ crm_url: url })
  },

  async getPassword() {
    const result = await chrome.storage.local.get('crm_password')
    return result.crm_password || ''
  },

  async getSettings() {
    const { crm_url, crm_password } = await chrome.storage.local.get(['crm_url', 'crm_password'])
    return {
      url: crm_url || this.DEFAULT_URL,
      password: crm_password || '',
    }
  },
}
