'use client'

import { useState } from 'react'
import { CalendarIcon, CalendarPlus, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
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
import { cn, toLocalDateString } from '@/lib/utils'
import { updateProspect } from '@/lib/actions'
import type { Prospect } from '@/lib/types'

interface ScheduleActionProps {
  prospectId: string
  prospectName: string
  prospectEmail?: string
  currentDate: string | null
  currentType: string
  currentDescription: string | null
  onSaved: (prospect: Prospect) => void
}

const ACTION_TYPES = [
  { value: 'relance', label: 'Relance' },
  { value: 'call', label: 'Call' },
  { value: 'email', label: 'Email' },
  { value: 'meeting', label: 'Reunion' },
  { value: 'autre', label: 'Autre' },
]

// Types that make sense to add to calendar
const CALENDAR_TYPES = ['call', 'meeting']

export function ScheduleAction({
  prospectId,
  prospectName,
  prospectEmail,
  currentDate,
  currentType,
  currentDescription,
  onSaved,
}: ScheduleActionProps) {
  const [date, setDate] = useState<Date | undefined>(
    currentDate ? new Date(currentDate + 'T12:00:00') : undefined
  )
  const [actionType, setActionType] = useState(currentType || '')
  const [description, setDescription] = useState(currentDescription || '')
  const [addToCalendar, setAddToCalendar] = useState(false)
  const [saving, setSaving] = useState(false)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarResult, setCalendarResult] = useState<string | null>(null)

  const hasChanges =
    (date ? toLocalDateString(date) : null) !== currentDate ||
    actionType !== (currentType || '') ||
    description !== (currentDescription || '')

  const handleSave = async () => {
    setSaving(true)
    setCalendarResult(null)
    try {
      const dateStr = date ? toLocalDateString(date) : null

      const updated = await updateProspect(prospectId, {
        date_prochaine_action: dateStr,
        type_prochaine_action: actionType,
        description_prochaine_action: description || null,
      })

      // Create Google Calendar event if requested
      if (addToCalendar && dateStr && actionType) {
        try {
          const typeLabel = ACTION_TYPES.find(t => t.value === actionType)?.label || actionType
          const summary = `${typeLabel} — ${prospectName}`

          // Build a timed event at 10:00 (30 min) — no prospect invite (personal reminder)
          const startDateTime = `${dateStr}T10:00:00`

          const res = await fetch('/api/calendar/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              summary,
              description: description || `Action CRM : ${typeLabel} avec ${prospectName}`,
              startDate: startDateTime,
              durationMinutes: 30,
            }),
          })

          if (res.ok) {
            const data = await res.json()
            setCalendarResult(data.htmlLink || 'ok')
          } else {
            const err = await res.json().catch(() => ({}))
            setCalendarResult(`Erreur Calendar: ${err.error || 'Inconnue'}`)
          }
        } catch {
          setCalendarResult('Erreur de connexion au Calendar')
        }
      }

      setAddToCalendar(false)
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
        description_prochaine_action: null,
      })
      setDate(undefined)
      setActionType('')
      setDescription('')
      setAddToCalendar(false)
      setCalendarResult(null)
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
          <label className="mb-1.5 block text-sm font-medium text-foreground">
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
          <label className="mb-1.5 block text-sm font-medium text-foreground">
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

      {/* Description */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Description <span className="text-muted-foreground font-normal">(optionnel)</span>
        </label>
        <Textarea
          placeholder="Objet du call, points a aborder, lieu de la reunion..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {/* Add to Google Calendar checkbox */}
      {date && CALENDAR_TYPES.includes(actionType) && (
        <div className="flex items-center space-x-2">
          <Checkbox
            id="add-calendar"
            checked={addToCalendar}
            onCheckedChange={(checked) => setAddToCalendar(checked === true)}
          />
          <label
            htmlFor="add-calendar"
            className="text-sm font-medium leading-none flex items-center gap-1.5 cursor-pointer"
          >
            <CalendarPlus className="size-3.5 text-blue-500" />
            Ajouter au Google Calendar
          </label>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          size="sm"
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              Sauvegarde...
            </>
          ) : (
            'Planifier'
          )}
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

      {/* Calendar result */}
      {calendarResult && (
        <div className={cn(
          'rounded-md px-3 py-2 text-xs',
          calendarResult.startsWith('http')
            ? 'border border-blue-200 bg-blue-50 text-blue-800'
            : calendarResult === 'ok'
              ? 'border border-green-200 bg-green-50 text-green-800'
              : 'border border-red-200 bg-red-50 text-red-800'
        )}>
          {calendarResult.startsWith('http') ? (
            <a
              href={calendarResult}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 font-medium hover:underline"
            >
              <CalendarPlus className="size-3.5" />
              Evenement cree dans Google Calendar
              <ExternalLink className="size-3" />
            </a>
          ) : calendarResult === 'ok' ? (
            'Evenement cree dans Google Calendar'
          ) : (
            calendarResult
          )}
        </div>
      )}

      {/* Current scheduled action display */}
      {currentDate && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-800">
            Action planifiee :{' '}
            {ACTION_TYPES.find((t) => t.value === currentType)?.label ||
              currentType || 'Non defini'}{' '}
            le{' '}
            {new Date(currentDate + 'T12:00:00').toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
          {currentDescription && (
            <p className="text-xs text-amber-700 mt-1">{currentDescription}</p>
          )}
        </div>
      )}
    </div>
  )
}
