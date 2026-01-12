import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    // 1. Supabase 클라이언트 생성
    const supabase = await createClient();
    
    // 2. 카카오가 준 'code'를 진짜 '로그인 세션'으로 교환
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // 3. 성공하면 원래 있던 페이지(메인)로 이동
      return NextResponse.redirect(`${origin}`);
    }
  }

  // 실패하면 에러 페이지로 이동 (혹은 메인으로)
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}