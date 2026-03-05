'use client'

import { Badge } from '@/components/ui/badge'
import type { PipelineStage } from '@/lib/types'

interface StageBadgeProps {
  stage: string
  stages: PipelineStage[]
}

export function StageBadge({ stage, stages }: StageBadgeProps) {
  const matched = stages.find((s) => s.slug === stage)

  if (!matched) {
    return (
      <Badge variant="secondary" className="text-xs">
        {stage}
      </Badge>
    )
  }

  return (
    <Badge
      className="text-xs border-0"
      style={{
        backgroundColor: matched.color + '20',
        color: matched.color,
      }}
    >
      {matched.name}
    </Badge>
  )
}
