'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { toLocalDateString } from '@/lib/utils'
import {
  Building2,
  Search,
  Users,
  Clock,
  ChevronDown,
  ChevronRight,
  Mail,
  CalendarClock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import type { CompanySummary } from '@/lib/actions'

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const STAGE_COLORS: Record<string, string> = {
  ciblage: '#6B7280',
  touch_1: '#3B82F6',
  repondu: '#06B6D4',
  devis: '#EC4899',
  onboarding: '#F97316',
  client: '#22C55E',
  a_recontacter: '#94A3B8',
  refuse: '#EF4444',
}

function CompanyRow({ company }: { company: CompanySummary }) {
  const [expanded, setExpanded] = useState(false)

  const actionsDue = company.contacts.filter(
    (c) => c.date_prochaine_action && c.date_prochaine_action <= toLocalDateString(new Date())
  )

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        )}

        <Building2 className="size-5 shrink-0 text-brand-accent" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">
            {company.entreprise}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Contact count */}
          <Badge variant="secondary" className="text-xs">
            <Users className="size-3 mr-1" />
            {company.contacts.length}
          </Badge>

          {/* Stages */}
          <div className="hidden sm:flex items-center gap-1">
            {company.stages.map((stage) => (
              <Badge
                key={stage}
                className="text-[10px] px-1.5 py-0 border-0"
                style={{
                  backgroundColor: (STAGE_COLORS[stage] || '#6B7280') + '20',
                  color: STAGE_COLORS[stage] || '#6B7280',
                }}
              >
                {stage.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>

          {/* Actions due indicator */}
          {actionsDue.length > 0 && (
            <Badge variant="destructive" className="text-[10px]">
              {actionsDue.length} action{actionsDue.length > 1 ? 's' : ''}
            </Badge>
          )}

          {/* Last contact */}
          <span className="hidden md:flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" />
            {formatDate(company.lastContact)}
          </span>
        </div>
      </button>

      {expanded && (
        <CardContent className="border-t border-white/[0.06] pt-3 pb-3">
          <div className="space-y-2">
            {company.contacts.map((contact) => (
              <Link
                key={contact.id}
                href={`/prospects/${contact.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] px-3 py-2 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {[contact.prenom, contact.nom].filter(Boolean).join(' ') || 'Sans nom'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {contact.fonction && <span>{contact.fonction}</span>}
                    {contact.email && (
                      <>
                        {contact.fonction && <span>&middot;</span>}
                        <span className="flex items-center gap-1">
                          <Mail className="size-2.5" />
                          {contact.email}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge
                    className="text-[10px] px-1.5 py-0 border-0"
                    style={{
                      backgroundColor: (STAGE_COLORS[contact.pipeline_stage] || '#6B7280') + '20',
                      color: STAGE_COLORS[contact.pipeline_stage] || '#6B7280',
                    }}
                  >
                    {contact.pipeline_stage.replace(/_/g, ' ')}
                  </Badge>

                  {contact.date_prochaine_action && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <CalendarClock className="size-2.5" />
                      {formatDate(contact.date_prochaine_action)}
                    </span>
                  )}

                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="size-2.5" />
                    {formatDate(contact.date_dernier_contact)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function EntreprisesPage() {
  const [companies, setCompanies] = useState<CompanySummary[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/companies')
      .then((r) => r.json())
      .then((data) => setCompanies(data.companies || []))
      .catch(() => setCompanies([]))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    if (!search) return companies
    const q = search.toLowerCase()
    return companies.filter(
      (c) =>
        c.entreprise.toLowerCase().includes(q) ||
        c.contacts.some(
          (p) =>
            p.prenom?.toLowerCase().includes(q) ||
            p.nom?.toLowerCase().includes(q)
        )
    )
  }, [companies, search])

  const totalContacts = useMemo(
    () => filtered.reduce((sum, c) => sum + c.contacts.length, 0),
    [filtered]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Entreprises</h1>
        <p className="text-sm text-muted-foreground">
          {loading
            ? 'Chargement...'
            : `${filtered.length} entreprise${filtered.length !== 1 ? 's' : ''} — ${totalContacts} contacts`}
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher une entreprise..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {filtered.map((company) => (
          <CompanyRow key={company.entreprise} company={company} />
        ))}
        {!loading && filtered.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">
            Aucune entreprise trouvee.
          </p>
        )}
      </div>
    </div>
  )
}
