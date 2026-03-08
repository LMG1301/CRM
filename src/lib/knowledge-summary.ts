/**
 * Generate a short summary of a knowledge document using Claude Haiku.
 * Used at upload time and for batch re-indexing.
 *
 * IMPORTANT: This function never throws — if the API call fails,
 * it returns null so the upload can still succeed.
 */

import { getAnthropicClient } from '@/lib/anthropic'
import { resolveModel } from '@/lib/ai-models'
import { logApiUsage } from '@/lib/api-usage'

const SUMMARY_MIN_CHARS = 2000
const CONTENT_PREVIEW_CHARS = 8000

/**
 * Generate a 2-3 sentence summary for a document.
 * Returns null if content is too short or if the API call fails.
 */
export async function generateDocumentSummary(
  name: string,
  content: string,
): Promise<string | null> {
  // Skip short documents — no need for a summary
  if (!content || content.length < SUMMARY_MIN_CHARS) {
    return null
  }

  try {
    const model = resolveModel('knowledge-summary')
    const anthropic = getAnthropicClient()

    // Only send the first ~8000 chars to keep token usage low
    const preview = content.length > CONTENT_PREVIEW_CHARS
      ? content.substring(0, CONTENT_PREVIEW_CHARS) + '\n[... document tronque]'
      : content

    const response = await anthropic.messages.create({
      model: model.apiModelId,
      max_tokens: 200,
      messages: [
        {
          role: 'user',
          content: `Resume ce document en 2 a 3 phrases maximum. Le resume doit permettre de savoir rapidement de quoi parle le document et quel type d'information il contient.

Titre du document : ${name}

Contenu :
${preview}`,
        },
      ],
    })

    logApiUsage({
      endpoint: 'knowledge-summary',
      model: model.apiModelId,
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    })

    const summary = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    return summary || null
  } catch (error) {
    // Never block upload if summary generation fails
    console.error(`[knowledge-summary] Failed for "${name}":`, error)
    return null
  }
}
