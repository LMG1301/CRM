'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { updateProspect } from '@/lib/actions'
import type { Prospect } from '@/lib/types'

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
      { key: 'entreprise', label: 'Entreprise', placeholder: 'Acme Inc.' },
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
      { key: 'categorie', label: 'Categorie', placeholder: 'Prospect, Client...' },
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
    return initial
  })
  const [saving, setSaving] = useState(false)

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
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

        <div className="space-y-6 py-2">
          {FIELD_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-3 text-sm font-medium text-muted-foreground">
                {group.title}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {group.fields.map((field) => (
                  <div
                    key={field.key}
                    className={
                      field.key === 'linkedin_url' || field.key === 'entreprise' || field.key === 'fonction' || field.key === 'source'
                        ? 'col-span-2'
                        : ''
                    }
                  >
                    <Label htmlFor={field.key} className="mb-1.5 text-xs">
                      {field.label}
                    </Label>
                    <Input
                      id={field.key}
                      type={'type' in field ? (field.type as string) : 'text'}
                      placeholder={'placeholder' in field ? field.placeholder : ''}
                      value={form[field.key] || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                    />
                  </div>
                ))}
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
