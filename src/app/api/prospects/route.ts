import { getProspects } from '@/lib/actions'

export async function GET() {
  try {
    const prospects = await getProspects()
    return Response.json(prospects)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur'
    return Response.json({ error: message }, { status: 500 })
  }
}
