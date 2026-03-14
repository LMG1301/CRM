import { searchCompanies } from '@/lib/actions'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''

  try {
    const results = await searchCompanies(q)
    return Response.json({ companies: results })
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
