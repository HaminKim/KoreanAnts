import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (code) {
    // 1. Supabase 클라이언트 생성
    const supabase = await createClient();
    
    // 2. 카카오 인증 코드로 세션 교환 (로그인 처리)
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // 3. 현재 로그인된 유저 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // 4. [중요] 기존에 가입된 유저인지 확인 (권한 유지용)
        const { data: existingUser } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single();

        // 기존 유저면 기존 권한 유지, 신규 유저면 'user' 부여
        const roleToAssign = existingUser?.role || 'user';
        const metadata = user.user_metadata;

        // 5. DB에 정보 저장 (없으면 추가, 있으면 업데이트)
        const { error: dbError } = await supabase
          .from('users')
          .upsert({
            id: user.id,
            email: metadata.email || `kakao_${user.id.slice(0,8)}`, // 이메일 없으면 가짜 ID 생성
            nickname: metadata.profile_nickname || metadata.name || '이름없음',
            profile_image: metadata.profile_image || '',
            role: roleToAssign // 👈 여기가 핵심! (사장님은 admin 유지, 남들은 user)
          });

        if (dbError) {
          console.error('DB 저장 실패:', dbError);
        }
      }

      // 6. 로그인 성공 시 메인으로 이동
      return NextResponse.redirect(`${origin}`);
    }
  }

  // 실패 시 에러 페이지로
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}