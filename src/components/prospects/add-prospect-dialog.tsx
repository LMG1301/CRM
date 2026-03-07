'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { createProspect } from '@/lib/actions'
import type { PipelineStage } from '@/lib/types'

interface AddProspectDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  stages: PipelineStage[]
}

const EMPTY_FORM = {
  prenom: '',
  nom: '',
  entreprise: '',
  fonction: '',
  email: '',
  email_pro: '',
  telephone: '',
  linkedin_url: '',
  localisation: '',
  pays: '',
  source: '',
  pipeline_stage: 'ciblage',
}

export function AddProspectDialog({
  open,
  onOpenChange,
  stages,
}: AddProspectDialogProps) {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    if (!form.nom.trim() && !form.email.trim()) return
    setSaving(true)
    try {
      const prospect: Record<string, string> = {}
      for (const [key, value] of Object.entries(form)) {
        if (value.trim()) prospect[key] = value.trim()
      }
      if (!prospect.pipeline_stage) prospect.pipeline_stage = 'ciblage'
      prospect.date_premier_contact = new Date().toISOString().split('T')[0]

      await createProspect(prospect)
      setForm(EMPTY_FORM)
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      console.error('Erreur creation prospect:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajouter un prospect</DialogTitle>
          <DialogDescription>
            Remplissez les informations du nouveau prospect.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Identite */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Identite</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Prenom</label>
                <Input
                  placeholder="Jean"
                  value={form.prenom}
                  onChange={(e) => set('prenom', e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Nom *</label>
                <Input
                  placeholder="Dupont"
                  value={form.nom}
                  onChange={(e) => set('nom', e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Entreprise</label>
                <Input
                  placeholder="Acme Corp"
                  value={form.entreprise}
                  onChange={(e) => set('entreprise', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Fonction</label>
                <Input
                  placeholder="Directeur commercial"
                  value={form.fonction}
                  onChange={(e) => set('fonction', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Contact */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Contact</h4>
            <div>
              <label className="mb-1 block text-xs font-medium">Email</label>
              <Input
                type="email"
                placeholder="jean@example.com"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Telephone</label>
                <Input
                  type="tel"
                  placeholder="06 12 34 56 78"
                  value={form.telephone}
                  onChange={(e) => set('telephone', e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">LinkedIn URL</label>
                <Input
                  type="url"
                  placeholder="https://linkedin.com/in/..."
                  value={form.linkedin_url}
                  onChange={(e) => set('linkedin_url', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Commercial */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Commercial</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Stage pipeline</label>
                <Select
                  value={form.pipeline_stage}
                  onValueChange={(v) => set('pipeline_stage', v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => (
                      <SelectItem key={s.id} value={s.slug}>
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block size-2 rounded-full"
                            style={{ backgroundColor: s.color }}
                          />
                          {s.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Source</label>
                <Input
                  placeholder="LinkedIn, Salon, Referral..."
                  value={form.source}
                  onChange={(e) => set('source', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Annuler
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || (!form.nom.trim() && !form.email.trim())}
          >
            {saving ? 'Creation...' : 'Creer le prospect'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
