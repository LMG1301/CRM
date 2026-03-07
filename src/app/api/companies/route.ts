import { getCompanies } from '@/lib/actions'

export async function GET() {
  try {
    const companies = await getCompanies()
    return Response.json({ companies })
  } catch (error) {
    return Response.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
