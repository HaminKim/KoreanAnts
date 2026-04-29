import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

export async function middleware(request: NextRequest) {
  // 문지기 역할: 모든 요청마다 세션을 갱신해줌
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * 이미지나 아이콘 같은 건 검사 안 하고 통과시킴
     */
    '/((?!_next/static|_next/image|favicon.ico|data/.*\\.json$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}