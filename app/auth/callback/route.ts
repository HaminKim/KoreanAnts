import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// ⚡️ [핵심] 이 한 줄이 없으면 로그인 페이지가 404 뜨거나 꼬입니다!
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  
  // 로그인 끝나고 어디로 갈지? (없으면 메인 '/'으로)
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const supabase = await createClient();
    
    // 카카오 인증 코드로 세션 교환 (로그인 처리)
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // ------------------------------------------------------------------
      // [기존 유지] 사장님이 짜신 DB 저장 로직 (완벽함 👍)
      // ------------------------------------------------------------------
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: existingUser } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        const roleToAssign = existingUser?.role || 'user';
        const metadata = user.user_metadata;

        const { error: dbError } = await supabase
          .from('users')
          .upsert({
            id: user.id,
            email: metadata.email || `kakao_${user.id.slice(0,8)}`,
            nickname: metadata.profile_nickname || metadata.name || '이름없음',
            profile_image: metadata.profile_image || '',
            role: roleToAssign 
          });

        if (dbError) {
          console.error('DB 저장 실패:', dbError);
        }
      }
      // ------------------------------------------------------------------

      // ✅ [수정] 로그인 성공! -> 메인화면(또는 원래 가려던 곳)으로 이동
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 실패 시 에러 페이지로
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}