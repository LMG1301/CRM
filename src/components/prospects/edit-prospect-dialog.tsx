'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Sparkles, Loader2, Bot, Building2, Plus } from 'lucide-react'
import { updateProspect, getDealGroups } from '@/lib/actions'
import type { Prospect, Company } from '@/lib/types'

interface EditProspectDialogProps {
  prospect: Prospect
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (updated: Prospect) => void
}

const FIELD_GROUPS = [
  {
    title: 'Identite',
    fields: [
      { key: 'prenom', label: 'Prenom', placeholder: 'Jean' },
      { key: 'nom', label: 'Nom', placeholder: 'Dupont' },
      // entreprise is rendered as a custom autocomplete below
      { key: 'site_web', label: 'Site web', placeholder: 'https://www.acme.com', type: 'url' },
      { key: 'fonction', label: 'Fonction / Poste', placeholder: 'Directeur commercial' },
    ],
  },
  {
    title: 'Contact',
    fields: [
      { key: 'email', label: 'Email', placeholder: 'jean@exemple.com', type: 'email' },
      { key: 'email_pro', label: 'Email pro', placeholder: 'jean@acme.com', type: 'email' },
      { key: 'telephone', label: 'Telephone', placeholder: '+33 6 12 34 56 78', type: 'tel' },
      { key: 'linkedin_url', label: 'LinkedIn URL', placeholder: 'https://linkedin.com/in/jean-dupont', type: 'url' },
    ],
  },
  {
    title: 'Localisation',
    fields: [
      { key: 'localisation', label: 'Ville / Region', placeholder: 'Paris' },
      { key: 'pays', label: 'Pays', placeholder: 'France' },
    ],
  },
  {
    title: 'Commercial',
    fields: [
      { key: 'source', label: 'Source', placeholder: 'LinkedIn, Salon, Recommandation...' },
      { key: 'statut_commercial', label: 'Statut commercial', placeholder: 'Actif, En pause...' },
    ],
  },
  {
    title: 'Dates',
    fields: [
      { key: 'date_premier_contact', label: 'Premier contact', type: 'date' },
      { key: 'date_dernier_contact', label: 'Dernier contact', type: 'date' },
    ],
  },
] as const

export function EditProspectDialog({
  prospect,
  open,
  onOpenChange,
  onSave,
}: EditProspectDialogProps) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const group of FIELD_GROUPS) {
      for (const field of group.fields) {
        const val = prospect[field.key as keyof Prospect]
        initial[field.key] = val != null ? String(val) : ''
      }
    }
    // Add categorie and deal_group separately (rendered as custom controls, not Input)
    initial.categorie = prospect.categorie || ''
    initial.deal_group = prospect.deal_group || ''
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enrichResult, setEnrichResult] = useState<string | null>(null)
  const [enrichedFields, setEnrichedFields] = useState<Set<string>>(new Set())
  const [dealGroups, setDealGroups] = useState<string[]>([])
  const [dealGroupOpen, setDealGroupOpen] = useState(false)
  const dealGroupRef = useRef<HTMLDivElement>(null)

  // Company autocomplete state
  const [companyQuery, setCompanyQuery] = useState(prospect.entreprise || '')
  const [companySuggestions, setCompanySuggestions] = useState<Company[]>([])
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(prospect.company_id || null)
  const companyRef = useRef<HTMLDivElement>(null)
  const companyFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load existing deal groups for autocomplete
  useEffect(() => {
    getDealGroups().then(setDealGroups).catch(() => {})
  }, [])

  // Fetch company suggestions with debounce
  const fetchCompanySuggestions = (query: string) => {
    if (companyFetchTimer.current) clearTimeout(companyFetchTimer.current)
    if (!query || query.length < 2) {
      setCompanySuggestions([])
      return
    }
    companyFetchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies/search?q=${encodeURIComponent(query)}`)
        const data = await res.json()
        setCompanySuggestions(data.companies || [])
      } catch {
        setCompanySuggestions([])
      }
    }, 200)
  }

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // If user manually edits an enriched field, remove the IA badge
    setEnrichedFields((prev) => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  const handleEnrich = async () => {
    setEnriching(true)
    setEnrichResult(null)
    try {
      const res = await fetch('/api/ai/enrich-prospect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenom: form.prenom,
          nom: form.nom,
          entreprise: form.entreprise,
          fonction: form.fonction,
          email: form.email,
          linkedin_url: form.linkedin_url,
          site_web: form.site_web,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setEnrichResult(json.error || 'Erreur')
        return
      }

      const data = json.data as Record<string, string>
      if (!data || Object.keys(data).length === 0) {
        setEnrichResult('Aucune info trouvee')
        return
      }

      // Only fill empty fields (don't overwrite existing values)
      const enrichableFields = [
        'prenom', 'nom', 'entreprise', 'fonction',
        'email', 'email_pro', 'telephone', 'linkedin_url',
        'site_web', 'localisation', 'pays',
      ]
      let filled = 0
      const newEnrichedFields = new Set<string>()

      setForm((prev) => {
        const updated = { ...prev }
        for (const key of enrichableFields) {
          if (data[key] && !prev[key]) {
            updated[key] = data[key]
            newEnrichedFields.add(key)
            filled++
          }
        }
        return updated
      })

      setEnrichedFields((prev) => new Set([...prev, ...newEnrichedFields]))

      const sourceInfo = data.source_info || ''
      const webSearchUsed = json.web_search_used ? ' (recherche web)' : ''
      setEnrichResult(
        filled > 0
          ? `${filled} champ${filled > 1 ? 's' : ''} rempli${filled > 1 ? 's' : ''}${webSearchUsed}${sourceInfo ? ` — ${sourceInfo}` : ''}`
          : `Tous les champs sont deja remplis${sourceInfo ? ` — ${sourceInfo}` : ''}`
      )
    } catch {
      setEnrichResult('Erreur de connexion')
    } finally {
      setEnriching(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updates: Record<string, string | null> = {}
      for (const [key, value] of Object.entries(form)) {
        const original = prospect[key as keyof Prospect]
        const originalStr = original != null ? String(original) : ''
        if (value !== originalStr) {
          updates[key] = value || null
        }
      }

      // Handle company fields
      if (companyQuery !== (prospect.entreprise || '')) {
        updates.entreprise = companyQuery || null
      }
      if (selectedCompanyId !== (prospect.company_id || null)) {
        updates.company_id = selectedCompanyId
      }

      if (Object.keys(updates).length === 0) {
        onOpenChange(false)
        return
      }

      const updated = await updateProspect(prospect.id, updates as Partial<Prospect>)
      onSave(updated)
      onOpenChange(false)
    } catch (error) {
      console.error('Erreur mise a jour prospect:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Modifier le prospect</DialogTitle>
          <DialogDescription>
            Modifiez les informations de {prospect.prenom} {prospect.nom}
          </DialogDescription>
        </DialogHeader>

        {/* Auto-enrich button */}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleEnrich}
            disabled={enriching || (!form.nom && !form.entreprise)}
            className="w-full border-brand-accent/30 text-brand-accent hover:bg-brand-accent/10"
          >
            {enriching ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Recherche en cours...
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Remplir automatiquement
                <Search className="size-3.5 ml-1 opacity-60" />
              </>
            )}
          </Button>
          {enrichResult && (
            <p className="text-xs text-muted-foreground text-center px-2">
              {enrichResult}
            </p>
          )}
        </div>

        <div className="space-y-6 py-2">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {group.fields.map((field) => {
                  const isEnriched = enrichedFields.has(field.key)
                  return (
                    <div
                      key={field.key}
                      className={
                        field.key === 'linkedin_url' || field.key === 'site_web' || field.key === 'fonction' || field.key === 'source'
                          ? 'col-span-2'
                          : ''
                      }
                    >
                      <Label htmlFor={field.key} className="mb-1.5 text-xs flex items-center gap-1.5">
                        {field.label}
                        {isEnriched && (
                          <Badge
                            variant="outline"
                            className="h-4 px-1 text-[10px] font-medium border-violet-500/40 text-violet-400 bg-violet-500/10"
                          >
                            <Bot className="size-2.5 mr-0.5" />
                            IA
                          </Badge>
                        )}
                      </Label>
                      <Input
                        id={field.key}
                        type={'type' in field ? (field.type as string) : 'text'}
                        placeholder={'placeholder' in field ? field.placeholder : ''}
                        value={form[field.key] || ''}
                        onChange={(e) => handleChange(field.key, e.target.value)}
                        className={isEnriched ? 'border-violet-500/30 bg-violet-500/5' : ''}
                      />
                    </div>
                  )
                })}
                {/* Company autocomplete — only in Identite group */}
                {group.title === 'Identite' && (
                  <div className="col-span-2 relative" ref={companyRef}>
                    <Label htmlFor="entreprise" className="mb-1.5 text-xs flex items-center gap-1.5">
                      <Building2 className="size-3" />
                      Entreprise
                      {selectedCompanyId && (
                        <Badge variant="outline" className="h-4 px-1 text-[10px] font-medium border-brand-accent/40 text-brand-accent bg-brand-accent/10">
                          Liee
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id="entreprise"
                      placeholder="Rechercher ou creer une entreprise..."
                      value={companyQuery}
                      onChange={(e) => {
                        setCompanyQuery(e.target.value)
                        setSelectedCompanyId(null) // Reset link when typing
                        setCompanyDropdownOpen(true)
                        fetchCompanySuggestions(e.target.value)
                      }}
                      onFocus={() => {
                        setCompanyDropdownOpen(true)
                        fetchCompanySuggestions(companyQuery)
                      }}
                      onBlur={() => {
                        setTimeout(() => setCompanyDropdownOpen(false), 200)
                      }}
                      autoComplete="off"
                      className={selectedCompanyId ? 'border-brand-accent/30 bg-brand-accent/5' : ''}
                    />
                    {companyDropdownOpen && (companySuggestions.length > 0 || companyQuery.length >= 2) && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[180px] overflow-y-auto rounded-md border border-white/10 bg-popover shadow-md">
                        {companySuggestions.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent/50 transition-colors"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setCompanyQuery(c.name)
                              setSelectedCompanyId(c.id)
                              setCompanyDropdownOpen(false)
                            }}
                          >
                            <Building2 className="size-3 shrink-0 text-muted-foreground" />
                            <span>{c.name}</span>
                            {c.aliases && c.aliases.length > 0 && (
                              <span className="text-[10px] text-muted-foreground">
                                ({c.aliases.length} alias)
                              </span>
                            )}
                          </button>
                        ))}
                        {companyQuery.length >= 2 && !companySuggestions.some(c => c.name.toLowerCase() === companyQuery.toLowerCase()) && (
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-brand-accent hover:bg-accent/50 transition-colors border-t border-white/[0.06]"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/companies', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ name: companyQuery.trim() }),
                                })
                                const data = await res.json()
                                if (data.company) {
                                  setSelectedCompanyId(data.company.id)
                                  setCompanyQuery(data.company.name)
                                }
                              } catch { /* ignore */ }
                              setCompanyDropdownOpen(false)
                            }}
                          >
                            <Plus className="size-3 shrink-0" />
                            Creer &quot;{companyQuery.trim()}&quot;
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {/* Categorie Select — only in Commercial group */}
                {group.title === 'Commercial' && (
                  <>
                    <div>
                      <Label htmlFor="categorie" className="mb-1.5 text-xs">
                        Type de relation
                      </Label>
                      <Select
                        value={form.categorie || '_none'}
                        onValueChange={(v) => handleChange('categorie', v === '_none' ? '' : v)}
                      >
                        <SelectTrigger id="categorie">
                          <SelectValue placeholder="Prospect" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_none">Prospect</SelectItem>
                          <SelectItem value="Client">Client</SelectItem>
                          <SelectItem value="Partenaire">Partenaire</SelectItem>
                          <SelectItem value="Prescripteur / Reseau">Prescripteur / Reseau</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {/* Deal Group with autocomplete */}
                    <div className="col-span-2 relative" ref={dealGroupRef}>
                      <Label htmlFor="deal_group" className="mb-1.5 text-xs">
                        Groupe de deal
                      </Label>
                      <Input
                        id="deal_group"
                        placeholder="Ex: Pilote Smart Fridge Accor"
                        value={form.deal_group || ''}
                        onChange={(e) => {
                          handleChange('deal_group', e.target.value)
                          setDealGroupOpen(true)
                        }}
                        onFocus={() => setDealGroupOpen(true)}
                        onBlur={() => {
                          setTimeout(() => setDealGroupOpen(false), 200)
                        }}
                        autoComplete="off"
                      />
                      {dealGroupOpen && dealGroups.length > 0 && (() => {
                        const filtered = dealGroups.filter(
                          (g) =>
                            g.toLowerCase().includes((form.deal_group || '').toLowerCase()) &&
                            g !== form.deal_group
                        )
                        if (filtered.length === 0) return null
                        return (
                          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[140px] overflow-y-auto rounded-md border border-white/10 bg-popover shadow-md">
                            {filtered.map((g) => (
                              <button
                                key={g}
                                type="button"
                                className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent/50 transition-colors"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  handleChange('deal_group', g)
                                  setDealGroupOpen(false)
                                }}
                              >
                                {g}
                              </button>
                            ))}
                          </div>
                        )
                      })()}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        Lie ce prospect a d&apos;autres contacts sur la meme opportunite
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
