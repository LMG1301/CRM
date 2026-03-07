import { NextRequest } from 'next/server'
import { getBusinessContext, updateBusinessContext } from '@/lib/actions'

export async function GET() {
  try {
    const context = await getBusinessContext()
    return Response.json(context || {})
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const updated = await updateBusinessContext(body)
    return Response.json(updated)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
