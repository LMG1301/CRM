// ─── Prompts barrel — re-exports all prompt modules ───

// System prompt builders & types
export {
  buildSystemPrompt,
  buildKnowledgeContext,
  buildPipelineSummary,
  type KnowledgeDocument,
  type ProspectSummary,
} from './system'

// Domain-specific quick actions
export { emailQuickActions } from './emails'
export { linkedinQuickActions } from './linkedin'
export { contentQuickActions } from './content'
export { classificationQuickActions } from './classification'

// ─── Merged QUICK_ACTIONS (backward compatibility) ───

import { emailQuickActions } from './emails'
import { linkedinQuickActions } from './linkedin'
import { contentQuickActions } from './content'
import { classificationQuickActions } from './classification'

export const QUICK_ACTIONS = {
  ...emailQuickActions,
  ...linkedinQuickActions,
  ...contentQuickActions,
  ...classificationQuickActions,
} as const
