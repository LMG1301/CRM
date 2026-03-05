'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { updateProspect } from '@/lib/actions'
import type { Prospect } from '@/lib/types'

interface ScheduleActionProps {
  prospectId: string
  currentDate: string | null
  currentType: string
  onSaved: (prospect: Prospect) => void
}

const ACTION_TYPES = [
  { value: 'relance', label: 'Relance' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'autre', label: 'Autre' },
]

export function ScheduleAction({
  prospectId,
  currentDate,
  currentType,
  onSaved,
}: ScheduleActionProps) {
  const [date, setDate] = useState<Date | undefined>(
    currentDate ? new Date(currentDate) : undefined
  )
  const [actionType, setActionType] = useState(currentType || '')
  const [saving, setSaving] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)

  const hasChanges =
    (date?.toISOString().split('T')[0] || null) !== currentDate ||
    actionType !== (currentType || '')

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await updateProspect(prospectId, {
        date_prochaine_action: date
          ? date.toISOString().split('T')[0]
          : null,
        type_prochaine_action: actionType,
      })
      onSaved(updated)
    } catch (error) {
      console.error('Erreur planification action:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleClear = async () => {
    setSaving(true)
    try {
      const updated = await updateProspect(prospectId, {
        date_prochaine_action: null,
        type_prochaine_action: '',
      })
      setDate(undefined)
      setActionType('')
      onSaved(updated)
    } catch (error) {
      console.error('Erreur suppression action:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Date picker */}
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            Date
          </label>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !date && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="size-4" />
                {date
                  ? date.toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })
                  : 'Choisir une date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  setDate(d)
                  setCalendarOpen(false)
                }}
                disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Type selector */}
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            Type
          </label>
          <Select value={actionType} onValueChange={setActionType}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Type d'action" />
            </SelectTrigger>
            <SelectContent>
              {ACTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          size="sm"
        >
          {saving ? 'Sauvegarde...' : 'Planifier'}
        </Button>
        {(currentDate || currentType) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={saving}
            className="text-muted-foreground"
          >
            Supprimer
          </Button>
        )}
      </div>

      {/* Current scheduled action display */}
      {currentDate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">
            Action planifiee :{' '}
            {ACTION_TYPES.find((t) => t.value === currentType)?.label ||
              currentType || 'Non defini'}{' '}
            le{' '}
            {new Date(currentDate).toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      )}
    </div>
  )
}
