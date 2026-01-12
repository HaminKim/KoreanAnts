import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  // 1. Supabase 클라이언트 생성 (await 필수!)
  const supabase = await createClient();

  // 2. 로그인 유저 확인
  // (supabase가 Promise가 아니어야 .auth에 접근 가능합니다)
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/'); 
  }

  // 3. 관리자 여부 확인
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-2xl font-bold text-red-600">접근 권한 없음</h1>
        <p>관리자만 접속 가능합니다.</p>
        <a href="/" className="underline">홈으로 가기</a>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">👑 관리자 페이지</h1>
      <p>환영합니다, 관리자님.</p>
    </div>
  );
}