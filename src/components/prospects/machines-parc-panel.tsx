'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Trash2, Loader2, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ClientMachine, MachineType } from '@/lib/types'
import { MACHINE_TYPE_LABELS } from '@/lib/types'
import { getClientMachines, addClientMachine, deleteClientMachine } from '@/lib/actions'

interface MachinesParcPanelProps {
  prospectId: string
  entreprise?: string
}

export function MachinesParcPanel({ prospectId, entreprise }: MachinesParcPanelProps) {
  const [machines, setMachines] = useState<ClientMachine[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Form state
  const [formType, setFormType] = useState<MachineType>('screenkit')
  const [formQuantity, setFormQuantity] = useState(1)
  const [formNotes, setFormNotes] = useState('')
  const [formDate, setFormDate] = useState('')

  const loadMachines = useCallback(async () => {
    try {
      const data = await getClientMachines(prospectId)
      setMachines(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [prospectId])

  useEffect(() => { loadMachines() }, [loadMachines])

  const handleAdd = async () => {
    if (formQuantity < 1) return
    setSaving(true)
    setError(null)
    try {
      await addClientMachine({
        prospect_id: prospectId,
        machine_type: formType,
        quantity: formQuantity,
        notes: formNotes || undefined,
        installed_at: formDate || undefined,
        entreprise: entreprise || undefined,
      })
      setShowForm(false)
      setFormType('screenkit')
      setFormQuantity(1)
      setFormNotes('')
      setFormDate('')
      await loadMachines()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'ajout de la machine')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    setError(null)
    try {
      await deleteClientMachine(id)
      setMachines(prev => prev.filter(m => m.id !== id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression')
    } finally {
      setDeletingId(null)
    }
  }

  const totalQuantity = machines.reduce((s, m) => s + m.quantity, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Monitor className="size-4" />
          Parc machines
          {totalQuantity > 0 && (
            <Badge variant="secondary" className="text-xs">
              {totalQuantity}
            </Badge>
          )}
        </CardTitle>
        {entreprise && (
          <p className="text-[11px] text-muted-foreground">
            Machines installees chez {entreprise}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {machines.length > 0 ? (
              <div className="space-y-2 mb-3">
                {machines.map(machine => (
                  <div
                    key={machine.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {MACHINE_TYPE_LABELS[machine.machine_type] || machine.machine_type}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          x{machine.quantity}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {machine.installed_at && (
                          <span>
                            Installe le{' '}
                            {new Date(machine.installed_at).toLocaleDateString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </span>
                        )}
                        {machine.notes && (
                          <span className="truncate max-w-[150px]">{machine.notes}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-red-400 hover:text-red-300 shrink-0"
                      onClick={() => handleDelete(machine.id)}
                      disabled={deletingId === machine.id}
                    >
                      {deletingId === machine.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mb-3 text-center text-xs text-muted-foreground py-2">
                Aucune machine enregistree
              </p>
            )}

            {/* Add form */}
            {showForm ? (
              <div className="space-y-3 rounded-lg border bg-white/[0.02] p-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Type de machine
                  </label>
                  <select
                    value={formType}
                    onChange={e => setFormType(e.target.value as MachineType)}
                    className="w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm focus:border-brand-accent/40 focus:outline-none focus:ring-1 focus:ring-brand-accent/20"
                  >
                    {(Object.entries(MACHINE_TYPE_LABELS) as [MachineType, string][]).map(([value, label]) => (
                      <option key={value} value={value} className="bg-[#112220] text-white">
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Quantite
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formQuantity}
                      onChange={e => setFormQuantity(parseInt(e.target.value) || 1)}
                      className="w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm focus:border-brand-accent/40 focus:outline-none focus:ring-1 focus:ring-brand-accent/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                      Date installation
                    </label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      className="w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm focus:border-brand-accent/40 focus:outline-none focus:ring-1 focus:ring-brand-accent/20"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    Notes (optionnel)
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Ex: Pilote 3 mois, site Paris..."
                    className="w-full rounded-md border border-white/[0.08] bg-transparent px-3 py-1.5 text-sm placeholder:text-white/20 focus:border-brand-accent/40 focus:outline-none focus:ring-1 focus:ring-brand-accent/20"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAdd}
                    disabled={saving}
                    className="flex-1"
                  >
                    {saving ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                    Ajouter
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowForm(false)}
                    disabled={saving}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowForm(true)}
              >
                <Plus className="size-4" />
                Ajouter une machine
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
