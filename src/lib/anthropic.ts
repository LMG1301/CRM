import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    })
  }
  return _client
}

export function parseAnthropicError(error: unknown): string {
  if (error instanceof Anthropic.APIError) {
    if (error.status === 401)
      return 'Cle API Anthropic invalide. Verifiez ANTHROPIC_API_KEY.'
    if (error.status === 429)
      return 'Quota API depasse. Reessayez dans quelques secondes.'
    if (error.status === 529)
      return 'API Anthropic surchargee. Reessayez dans un moment.'
    return `Erreur API : ${error.message}`
  }
  if (error instanceof Error) return `Erreur : ${error.message}`
  return 'Erreur inconnue'
}
