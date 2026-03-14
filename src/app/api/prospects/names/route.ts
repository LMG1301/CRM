import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('prospects')
      .select('entreprise')
      .neq('entreprise', '')
      .order('entreprise')

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const names = [...new Set(data.map((p) => p.entreprise))]

    return Response.json({ names, count: names.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur serveur'
    return Response.json({ error: message }, { status: 500 })
  }
}
