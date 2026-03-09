'use client'

import { useState, useEffect } from 'react'
import { Bot, Search, ClipboardList, BarChart3, Users, Zap, FileText } from 'lucide-react'
import { AIChat } from '@/components/ai/ai-chat'
import { Input } from '@/components/ui/input'
import type { Prospect } from '@/lib/types'

const GLOBAL_QUICK_ACTIONS = [
  {
    label: '📋 Monday Check-in',
    prompt: 'Monday check-in : prepare ma to-do list de la semaine avec les priorites, relances, meetings et onboardings.',
    icon: <ClipboardList className="size-3" />,
  },
  {
    label: '📊 Resume pipeline',
    prompt: 'Fais-moi un resume du pipeline : combien de prospects par etape, deals bloques, et actions urgentes.',
    icon: <BarChart3 className="size-3" />,
  },
  {
    label: '👥 Prospects chauds',
    prompt: 'Quels sont les prospects les plus chauds en ce moment ? Ceux en devis, repondu ou onboarding avec des actions a faire.',
    icon: <Users className="size-3" />,
  },
  {
    label: '⚡ Deals bloques',
    prompt: 'Quels deals sont bloques depuis plus de 2 semaines ? Propose des actions pour les debloquer.',
    icon: <Zap className="size-3" />,
  },
  {
    label: '📊 Sales Review',
    prompt: 'Prepare mon sales review.',
    icon: <FileText className="size-3" />,
  },
]

export default function AssistantPage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [selectedProspect, setSelectedProspect] = useState<Prospect | null>(null)
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    fetch('/api/prospects')
      .then((res) => res.json())
      .then((data) => setProspects(data))
      .catch(() => {})
  }, [])

  const filtered = search.trim()
    ? prospects.filter((p) => {
        const q = search.toLowerCase()
        return (
          p.prenom?.toLowerCase().includes(q) ||
          p.nom?.toLowerCase().includes(q) ||
          p.entreprise?.toLowerCase().includes(q)
        )
      }).slice(0, 8)
    : []

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-white/[0.06] px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-accent/20">
              <Bot className="h-5 w-5 text-brand-accent" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Assistant IA
              </h1>
              <p className="text-xs text-muted-foreground">
                Boost Inc. — Aide a la prospection
              </p>
            </div>
          </div>

          {/* Prospect selector */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Charger un prospect..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setShowDropdown(true)
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              className="pl-9 text-sm"
            />
            {showDropdown && filtered.length > 0 && (
              <div className="absolute top-full left-0 z-50 mt-1 w-full rounded-lg border border-white/10 bg-[#0d1f1c] py-1 shadow-xl">
                {filtered.map((p) => (
                  <button
                    key={p.id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
                    onMouseDown={() => {
                      setSelectedProspect(p)
                      setSearch(`${p.prenom} ${p.nom}`)
                      setShowDropdown(false)
                    }}
                  >
                    <span className="font-medium text-foreground">
                      {p.prenom} {p.nom}
                    </span>
                    {p.entreprise && (
                      <span className="text-xs text-muted-foreground">
                        — {p.entreprise}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {selectedProspect && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSelectedProspect(null)
                  setSearch('')
                }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden">
        <AIChat
          key={selectedProspect?.id || 'global'}
          prospectId={selectedProspect?.id}
          quickActions={selectedProspect ? undefined : GLOBAL_QUICK_ACTIONS}
          placeholder={
            selectedProspect
              ? `Demande a l'IA a propos de ${selectedProspect.prenom}...`
              : "Demande a l'IA..."
          }
          className="h-full"
        />
      </div>
    </div>
  )
}
