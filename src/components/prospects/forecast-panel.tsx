'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingUp, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ProspectForecast, ForecastProductType } from '@/lib/types'
import {
  FORECAST_PRODUCT_LABELS,
  FORECAST_PROBABILITY_OPTIONS,
} from '@/lib/types'

const FRENCH_MONTHS = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

function generateNext12Months(): { value: string; label: string }[] {
  const now = new Date()
  const months: { value: string; label: string }[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const label = `${FRENCH_MONTHS[d.getMonth()]} ${d.getFullYear()}`
    months.push({ value, label })
  }
  return months
}

function formatEUR(amount: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount)
}

function getProbOption(value: number) {
  return FORECAST_PROBABILITY_OPTIONS.find((o) => o.value === value)
}

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr)
  return `${FRENCH_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

interface ForecastFormData {
  product_type: ForecastProductType | ''
  unit_price: string
  quantity: string
  probability: string
  expected_month: string
  notes: string
}

const emptyForm: ForecastFormData = {
  product_type: '',
  unit_price: '',
  quantity: '',
  probability: '',
  expected_month: '',
  notes: '',
}

export function ForecastPanel({ prospectId }: { prospectId: string }) {
  const [forecasts, setForecasts] = useState<ProspectForecast[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ForecastFormData>(emptyForm)
  const [saving, setSaving] = useState(false)

  const monthOptions = generateNext12Months()

  const loadForecasts = useCallback(() => {
    setLoading(true)
    fetch(`/api/forecasts?prospect_id=${prospectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.forecasts) setForecasts(data.forecasts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [prospectId])

  useEffect(() => {
    loadForecasts()
  }, [loadForecasts])

  const computedTotal = (() => {
    const price = parseFloat(form.unit_price) || 0
    const qty = parseInt(form.quantity) || 0
    return price * qty
  })()

  const handleOpenAdd = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  const handleOpenEdit = (f: ProspectForecast) => {
    setEditingId(f.id)
    setForm({
      product_type: f.product_type,
      unit_price: String(f.unit_price),
      quantity: String(f.quantity),
      probability: String(f.probability),
      expected_month: f.expected_month,
      notes: f.notes || '',
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const handleSubmit = async () => {
    if (!form.product_type || !form.unit_price || !form.quantity || !form.probability || !form.expected_month) return
    setSaving(true)
    try {
      if (editingId) {
        await fetch(`/api/forecasts/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_type: form.product_type,
            unit_price: form.unit_price,
            quantity: form.quantity,
            probability: Number(form.probability),
            expected_month: form.expected_month,
            notes: form.notes,
          }),
        })
      } else {
        await fetch('/api/forecasts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prospect_id: prospectId,
            product_type: form.product_type,
            unit_price: form.unit_price,
            quantity: form.quantity,
            probability: Number(form.probability),
            expected_month: form.expected_month,
            notes: form.notes,
          }),
        })
      }
      handleCancel()
      loadForecasts()
    } catch {
      /* ignore */
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const ok = window.confirm('Supprimer cette ligne de forecast ?')
    if (!ok) return
    try {
      await fetch(`/api/forecasts/${id}`, { method: 'DELETE' })
      loadForecasts()
    } catch {
      /* ignore */
    }
  }

  const totalBrut = forecasts.reduce((sum, f) => sum + (f.total_amount ?? f.unit_price * f.quantity), 0)
  const totalPondere = forecasts.reduce(
    (sum, f) => sum + ((f.total_amount ?? f.unit_price * f.quantity) * f.probability) / 100,
    0
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="size-4" />
          Forecast
          {forecasts.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {forecasts.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* Existing forecast lines */}
            {forecasts.length > 0 && (
              <div className="space-y-2">
                {forecasts.map((f) => {
                  const probOpt = getProbOption(f.probability)
                  const total = f.total_amount ?? f.unit_price * f.quantity
                  return (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">
                        {FORECAST_PRODUCT_LABELS[f.product_type] || f.product_type}
                      </span>
                      <span className="text-muted-foreground">
                        {formatEUR(f.unit_price)} x {f.quantity}
                      </span>
                      <span className="font-semibold">{formatEUR(total)}</span>
                      {probOpt && (
                        <Badge
                          variant="secondary"
                          className="border-0 text-xs"
                          style={{
                            backgroundColor: probOpt.color + '20',
                            color: probOpt.color,
                          }}
                        >
                          {f.probability}% {probOpt.label}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatMonthLabel(f.expected_month)}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => handleOpenEdit(f)}
                          title="Modifier"
                        >
                          <Pencil className="size-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-400/50 hover:text-red-400"
                          onClick={() => handleDelete(f.id)}
                          title="Supprimer"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Inline form */}
            {showForm && (
              <div className="rounded-lg border border-brand-accent/20 bg-brand-accent/5 p-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Produit</label>
                    <Select
                      value={form.product_type}
                      onValueChange={(v) => setForm({ ...form, product_type: v as ForecastProductType })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.entries(FORECAST_PRODUCT_LABELS) as [ForecastProductType, string][]).map(
                          ([key, label]) => (
                            <SelectItem key={key} value={key}>
                              {label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Prix unitaire</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      className="h-8 text-xs"
                      placeholder="0.00"
                      value={form.unit_price}
                      onChange={(e) => setForm({ ...form, unit_price: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Quantite</label>
                    <Input
                      type="number"
                      min={1}
                      className="h-8 text-xs"
                      placeholder="1"
                      value={form.quantity}
                      onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Total</label>
                    <Input
                      type="text"
                      className="h-8 text-xs bg-muted/50"
                      value={formatEUR(computedTotal)}
                      disabled
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Probabilite</label>
                    <Select
                      value={form.probability}
                      onValueChange={(v) => setForm({ ...form, probability: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent>
                        {FORECAST_PROBABILITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.value}% {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Mois prevu</label>
                    <Select
                      value={form.expected_month}
                      onValueChange={(v) => setForm({ ...form, expected_month: v })}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Choisir..." />
                      </SelectTrigger>
                      <SelectContent>
                        {monthOptions.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                  <Textarea
                    className="min-h-[60px] text-xs resize-y"
                    placeholder="Notes optionnelles..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleSubmit}
                    disabled={saving || !form.product_type || !form.unit_price || !form.quantity || !form.probability || !form.expected_month}
                  >
                    {saving && <Loader2 className="size-3 animate-spin" />}
                    {editingId ? 'Modifier' : 'Ajouter'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleCancel}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            )}

            {/* Add button */}
            {!showForm && (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={handleOpenAdd}
              >
                <Plus className="size-4" />
                Ajouter au forecast
              </Button>
            )}

            {/* Summary */}
            {forecasts.length > 0 && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2 space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total brut</span>
                  <span className="font-semibold">{formatEUR(totalBrut)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Total pondere</span>
                  <span className="font-semibold text-brand-accent">{formatEUR(totalPondere)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
