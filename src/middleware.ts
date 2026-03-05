import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow login page and auth API
  if (pathname === '/login' || pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Check auth cookie
  const authCookie = request.cookies.get('crm_auth')
  if (authCookie?.value === 'authenticated') {
    return NextResponse.next()
  }

  // Redirect to login
  const loginUrl = new URL('/login', request.url)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
