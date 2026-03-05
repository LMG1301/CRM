import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { password } = await request.json()
  const correctPassword = process.env.CRM_PASSWORD

  if (!correctPassword) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })
  }

  if (password === correctPassword) {
    const response = NextResponse.json({ success: true })
    response.cookies.set('crm_auth', 'authenticated', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
    return response
  }

  return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 })
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })
  response.cookies.delete('crm_auth')
  return response
}
