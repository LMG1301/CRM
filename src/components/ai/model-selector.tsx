'use client'

import {
  AI_MODELS,
  type AIModelId,
  type AIEndpoint,
  DEFAULT_MODEL_ROUTING,
  estimateActionCost,
} from '@/lib/ai-models'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'

interface ModelSelectorProps {
  endpoint: AIEndpoint
  value?: AIModelId
  onChange: (model: AIModelId) => void
  showCostBadge?: boolean
  compact?: boolean
}

export function ModelSelector({
  endpoint,
  value,
  onChange,
  showCostBadge = true,
  compact = false,
}: ModelSelectorProps) {
  const currentModel = value || DEFAULT_MODEL_ROUTING[endpoint]
  const estimatedCost = estimateActionCost(endpoint, currentModel)

  return (
    <div className="flex items-center gap-2">
      <Select
        value={currentModel}
        onValueChange={(v) => onChange(v as AIModelId)}
      >
        <SelectTrigger
          className={compact ? 'h-7 text-xs w-[140px]' : 'w-[180px]'}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.values(AI_MODELS).map((model) => (
            <SelectItem key={model.id} value={model.id}>
              <div className="flex flex-col">
                <span>{model.displayName}</span>
                {!compact && (
                  <span className="text-[10px] text-muted-foreground">
                    {model.description}
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showCostBadge && (
        <Badge
          variant="outline"
          className="whitespace-nowrap font-mono text-[10px]"
        >
          ~${estimatedCost.toFixed(4)}
        </Badge>
      )}
    </div>
  )
}
