// Centralized AI model configuration, routing, and cost estimation

export type AIModelId = 'claude-haiku' | 'claude-sonnet' | 'claude-opus'

export interface AIModelConfig {
  id: AIModelId
  apiModelId: string
  displayName: string
  inputPricePerMTok: number
  outputPricePerMTok: number
  maxOutputTokens: number
  description: string
}

export const AI_MODELS: Record<AIModelId, AIModelConfig> = {
  'claude-haiku': {
    id: 'claude-haiku',
    apiModelId: 'claude-haiku-4-5-20251001',
    displayName: 'Claude Haiku',
    inputPricePerMTok: 1.0,
    outputPricePerMTok: 5.0,
    maxOutputTokens: 4096,
    description: 'Rapide et economique — analyses, resume',
  },
  'claude-sonnet': {
    id: 'claude-sonnet',
    apiModelId: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet',
    inputPricePerMTok: 3.0,
    outputPricePerMTok: 15.0,
    maxOutputTokens: 4096,
    description: 'Equilibre — chat, enrichissement, redaction',
  },
  'claude-opus': {
    id: 'claude-opus',
    apiModelId: 'claude-opus-4-20250514',
    displayName: 'Claude Opus',
    inputPricePerMTok: 15.0,
    outputPricePerMTok: 75.0,
    maxOutputTokens: 4096,
    description: 'Premium — strategies complexes (usage rare)',
  },
}

export type AIEndpoint =
  | 'chat'
  | 'analyze-pipeline'
  | 'enrich-prospect'
  | 'summarize'
  | 'transcribe-structure'
  | 'tag-content'
  | 'match-content'
  | 'generate-email'

export const DEFAULT_MODEL_ROUTING: Record<AIEndpoint, AIModelId> = {
  chat: 'claude-sonnet',
  'analyze-pipeline': 'claude-haiku',
  'enrich-prospect': 'claude-sonnet',
  summarize: 'claude-haiku',
  'transcribe-structure': 'claude-haiku',
  'tag-content': 'claude-haiku',
  'match-content': 'claude-haiku',
  'generate-email': 'claude-sonnet',
}

export const BUDGET_CONFIG = {
  warningThresholdUsd: 8.0,
  hardStopThresholdUsd: 10.0,
  monthlyBudgetUsd: 10.0,
}

export function estimateCost(
  modelId: AIModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  const model = AI_MODELS[modelId]
  return (
    (inputTokens / 1_000_000) * model.inputPricePerMTok +
    (outputTokens / 1_000_000) * model.outputPricePerMTok
  )
}

export function estimateActionCost(
  endpoint: AIEndpoint,
  modelId?: AIModelId,
): number {
  const model = modelId || DEFAULT_MODEL_ROUTING[endpoint]
  const estimates: Record<AIEndpoint, { input: number; output: number }> = {
    chat: { input: 2000, output: 500 },
    'analyze-pipeline': { input: 1500, output: 200 },
    'enrich-prospect': { input: 800, output: 400 },
    summarize: { input: 3000, output: 300 },
    'transcribe-structure': { input: 1000, output: 300 },
    'tag-content': { input: 800, output: 200 },
    'match-content': { input: 2000, output: 400 },
    'generate-email': { input: 1500, output: 600 },
  }
  const est = estimates[endpoint]
  return estimateCost(model, est.input, est.output)
}

export function resolveModel(
  endpoint: AIEndpoint,
  requestedModel?: string,
): AIModelConfig {
  const modelId =
    requestedModel && requestedModel in AI_MODELS
      ? (requestedModel as AIModelId)
      : DEFAULT_MODEL_ROUTING[endpoint]
  return AI_MODELS[modelId]
}
