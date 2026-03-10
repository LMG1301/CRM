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
    apiModelId: 'claude-sonnet-4-6',
    displayName: 'Claude Sonnet',
    inputPricePerMTok: 3.0,
    outputPricePerMTok: 15.0,
    maxOutputTokens: 4096,
    description: 'Equilibre — chat, enrichissement, redaction',
  },
  'claude-opus': {
    id: 'claude-opus',
    apiModelId: 'claude-opus-4-6',
    displayName: 'Claude Opus',
    inputPricePerMTok: 5.0,
    outputPricePerMTok: 25.0,
    maxOutputTokens: 4096,
    description: 'Premium — analyses strategiques, rapports',
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
  | 'generate-report'
  | 'summarize-url'
  | 'suggest-stage'
  | 'parse-signature'
  | 'personalize-template'
  | 'generate-sequence-email'
  | 'knowledge-summary'

export const DEFAULT_MODEL_ROUTING: Record<AIEndpoint, AIModelId> = {
  chat: 'claude-haiku',
  'analyze-pipeline': 'claude-sonnet',
  'enrich-prospect': 'claude-haiku',
  summarize: 'claude-haiku',
  'transcribe-structure': 'claude-haiku',
  'tag-content': 'claude-haiku',
  'match-content': 'claude-haiku',
  'generate-email': 'claude-haiku',
  'generate-report': 'claude-sonnet',
  'summarize-url': 'claude-haiku',
  'suggest-stage': 'claude-haiku',
  'parse-signature': 'claude-haiku',
  'personalize-template': 'claude-haiku',
  'generate-sequence-email': 'claude-sonnet',
  'knowledge-summary': 'claude-haiku',
}

// Background/automated routes that ALWAYS use Haiku regardless of user selection
export const FORCE_HAIKU_ENDPOINTS: Set<AIEndpoint> = new Set([
  'suggest-stage',
  'tag-content',
  'parse-signature',
  'summarize',
  'summarize-url',
  'match-content',
  'knowledge-summary',
  'transcribe-structure',
])

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
    'generate-report': { input: 3000, output: 800 },
    'summarize-url': { input: 2000, output: 300 },
    'suggest-stage': { input: 500, output: 200 },
    'parse-signature': { input: 500, output: 200 },
    'personalize-template': { input: 1500, output: 600 },
    'generate-sequence-email': { input: 2000, output: 600 },
    'knowledge-summary': { input: 2000, output: 200 },
  }
  const est = estimates[endpoint]
  return estimateCost(model, est.input, est.output)
}

export function resolveModel(
  endpoint: AIEndpoint,
  requestedModel?: string,
): AIModelConfig {
  // Background/automated endpoints always use Haiku regardless of user selection
  if (FORCE_HAIKU_ENDPOINTS.has(endpoint)) {
    return AI_MODELS['claude-haiku']
  }

  const modelId =
    requestedModel && requestedModel in AI_MODELS
      ? (requestedModel as AIModelId)
      : DEFAULT_MODEL_ROUTING[endpoint]
  return AI_MODELS[modelId]
}
