'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Mail, Clock, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Prospect } from '@/lib/types'
import { getCompanyColleagues } from '@/lib/actions'

interface CompanyContextPanelProps {
  prospect: Prospect
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'N/A'
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  })
}

export function CompanyContextPanel({ prospect }: CompanyContextPanelProps) {
  const [colleagues, setColleagues] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!prospect.entreprise) {
      setLoading(false)
      return
    }

    getCompanyColleagues(prospect.entreprise, prospect.id)
      .then(setColleagues)
      .catch(() => setColleagues([]))
      .finally(() => setLoading(false))
  }, [prospect.entreprise, prospect.id])

  if (!prospect.entreprise || (!loading && colleagues.length === 0)) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="size-4" />
          {prospect.entreprise}
          <Badge variant="secondary" className="ml-auto text-xs">
            {colleagues.length + 1} contact{colleagues.length > 0 ? 's' : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement...</p>
        ) : (
          <div className="space-y-3">
            {colleagues.map((c) => (
              <Link
                key={c.id}
                href={`/prospects/${c.id}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] p-2.5 transition-colors hover:border-white/20 hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {[c.prenom, c.nom].filter(Boolean).join(' ') || 'Sans nom'}
                  </p>
                  {c.fonction && (
                    <p className="truncate text-xs text-muted-foreground">
                      {c.fonction}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5"
                  >
                    {c.pipeline_stage.replace(/_/g, ' ')}
                  </Badge>
                  {c.date_dernier_contact && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="size-2.5" />
                      {formatDate(c.date_dernier_contact)}
                    </span>
                  )}
                </div>
              </Link>
            ))}

            {/* Aggregated stats */}
            <div className="mt-2 flex items-center gap-4 rounded-lg bg-white/[0.03] px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="size-3" />
                {colleagues.length + 1} contacts
              </span>
              <span className="flex items-center gap-1">
                <Mail className="size-3" />
                {new Set(colleagues.map(c => c.pipeline_stage)).size + 1} stages
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
