'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Prospect } from '@/lib/types'

interface DealGroupMoveDialogProps {
  open: boolean
  prospect: Prospect
  members: Prospect[]
  targetStageName: string
  onConfirm: (moveAll: boolean) => void
  onClose: () => void
}

export function DealGroupMoveDialog({
  open,
  prospect,
  members,
  targetStageName,
  onConfirm,
  onClose,
}: DealGroupMoveDialogProps) {
  if (!open) return null

  const prospectName = prospect.prenom || prospect.nom || 'Ce prospect'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => {
          // If user dismisses, move only the dragged prospect
          onConfirm(false)
        }}
      />

      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-xl border border-white/[0.1] bg-[#112220] p-6 shadow-2xl">
        <h3 className="mb-1 text-base font-semibold text-white">
          Groupe de deal
        </h3>
        <p className="mb-4 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{prospectName}</span> fait partie du groupe{' '}
          <Badge variant="secondary" className="inline-flex bg-amber-500/10 text-amber-400 border-0 text-xs">
            {prospect.deal_group}
          </Badge>{' '}
          avec {members.length} autre{members.length > 1 ? 's' : ''} contact{members.length > 1 ? 's' : ''} :
        </p>

        {/* Members list */}
        <div className="mb-5 space-y-1.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
          {members.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-foreground">
                {[m.prenom, m.nom].filter(Boolean).join(' ')}
                {m.entreprise && (
                  <span className="ml-1 text-muted-foreground">({m.entreprise})</span>
                )}
              </span>
              <Badge variant="outline" className="shrink-0 text-[10px] px-1.5">
                {m.pipeline_stage.replace(/_/g, ' ')}
              </Badge>
            </div>
          ))}
        </div>

        <p className="mb-4 text-sm text-muted-foreground">
          Deplacer tout le groupe vers <span className="font-medium text-foreground">{targetStageName}</span> ?
        </p>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onConfirm(false)}
          >
            {prospectName} uniquement
          </Button>
          <Button
            className="flex-1"
            onClick={() => onConfirm(true)}
          >
            Tout le groupe
          </Button>
        </div>
      </div>
    </div>
  )
}
