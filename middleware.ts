import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

// 예전 메인(개미지수)으로 공유된 링크(/?side=netBuy&days=5&top=30)는 /ants 로 보낸다
const LEGACY_HOME_KEYS = ['side', 'days', 'top']

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl
  if (pathname === '/' && LEGACY_HOME_KEYS.some(k => searchParams.has(k))) {
    const url = request.nextUrl.clone()
    url.pathname = '/ants'
    return NextResponse.redirect(url)
  }
  // 문지기 역할: 모든 요청마다 세션을 갱신해줌
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * 이미지나 아이콘 같은 건 검사 안 하고 통과시킴
     */
    '/((?!_next/static|_next/image|favicon.ico|data/.*\.json$|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
