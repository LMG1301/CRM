import { createContent, updateContent, deleteContent } from '@/lib/actions'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const content = await createContent(body)
    return Response.json(content)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const { id, ...updates } = await request.json()
    if (!id) return Response.json({ error: 'id requis' }, { status: 400 })
    const content = await updateContent(id, updates)
    return Response.json(content)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { id } = await request.json()
    if (!id) return Response.json({ error: 'id requis' }, { status: 400 })
    await deleteContent(id)
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
