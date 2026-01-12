import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminPage() {
  const supabase = createClient();

  // 1. 로그인 했는지 확인
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/'); // 로그인 안 했으면 홈으로 쫓아냄
  }

  // 2. 관리자(admin)인지 DB 조회
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  // 3. 관리자가 아니면(user) 쫓아냄
  if (!userData || userData.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <h1 className="text-4xl">🚨</h1>
        <h2 className="text-2xl font-bold text-red-600">접근 권한이 없습니다</h2>
        <p className="text-gray-600">관리자만 들어올 수 있는 공간입니다.</p>
        <a href="/" className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition">
          홈으로 돌아가기
        </a>
      </div>
    );
  }

  // 4. 통과! (관리자 화면)
  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">👑 관리자 대시보드</h1>
        <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">ADMIN</span>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow border border-gray-200">
        <h2 className="text-xl font-bold mb-4">데이터 관리</h2>
        <p className="text-gray-600 mb-4">여기서 주식 데이터를 입력하고 수정할 수 있습니다.</p>
        
        <button className="bg-black text-white px-4 py-2 rounded hover:bg-gray-800 transition">
          + 새 데이터 추가 (준비중)
        </button>
      </div>
    </div>
  );
}