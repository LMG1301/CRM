// Boost CRM — Shared API client

const BoostAPI = {
  async fetch(endpoint, options = {}) {
    const { url, password } = await BoostConfig.getSettings()
    const fullUrl = url + endpoint

    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(password ? { 'Authorization': `Bearer ${password}` } : {}),
          ...(options.headers || {}),
        },
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(body.error || `API error: ${response.status}`)
      }

      return await response.json()
    } catch (error) {
      console.error('[Boost CRM] API error:', error)
      return { error: error.message }
    }
  },

  // Chercher un prospect par email (+ nom pour fuzzy matching)
  async findProspectByEmail(email, name) {
    const params = new URLSearchParams({ email })
    if (name) params.set('name', name)
    return this.fetch(`/api/prospects/by-email?${params}`)
  },

  // Chercher un prospect par nom (lookup existant)
  async lookupProspect(email, nom) {
    const params = new URLSearchParams()
    if (email) params.set('email', email)
    if (nom) params.set('nom', nom)
    return this.fetch(`/api/prospects/lookup?${params}`)
  },

  // Enregistrer un nouveau prospect
  async createProspect(data) {
    return this.fetch('/api/prospects/quick-add', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Generer une reponse email (Gmail)
  async generateReply(data) {
    return this.fetch('/api/gmail-plugin/generate-reply', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Ajouter une note
  async addNote(prospectId, note) {
    return this.fetch('/api/gmail-plugin/add-note', {
      method: 'POST',
      body: JSON.stringify({ prospect_id: prospectId, note }),
    })
  },

  // Health check
  async healthCheck() {
    const { url } = await BoostConfig.getSettings()
    try {
      const res = await fetch(url + '/api/health', { signal: AbortSignal.timeout(5000) })
      return res.ok
    } catch {
      return false
    }
  },
}
