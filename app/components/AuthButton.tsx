'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';

export default function AuthButton() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // 1. 현재 로그인 상태 확인
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    getUser();

    // 2. 로그인/로그아웃 상태 변화 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 🟡 카카오 로그인 (이메일 요청 X, 닉네임만 요청)
  const handleKakaoLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
        queryParams: {
          // 👇 여기가 핵심! 이메일(account_email) 절대 넣지 마세요.
          scope: 'profile_nickname,profile_image',
        },
      },
    });
  };

  // 🔴 로그아웃 (좀비 로그인 방지)
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.href = '/'; 
  };

  return (
    <div>
      {user ? (
        // 로그인 했을 때
        <div className="flex items-center gap-2">
          {/* 모바일에서는 이름 숨기고 로그아웃 버튼만 보여줌 */}
          <span className="text-xs text-gray-500 hidden md:block whitespace-nowrap">
            {/* 이메일이 없으므로 닉네임을 보여줌 */}
            {user.user_metadata.profile_nickname || user.user_metadata.full_name || '회원'}님
          </span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 rounded-md transition whitespace-nowrap"
          >
            로그아웃
          </button>
        </div>
      ) : (
        // 로그인 안 했을 때 (카카오 버튼)
        <div className="flex gap-2">
          <button
            onClick={handleKakaoLogin}
            className="flex items-center gap-2 px-4 py-2 bg-[#FEE500] hover:bg-[#FDD835] text-black text-sm font-bold rounded-md transition shadow-sm"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 3C7.58 3 4 5.79 4 9.24c0 1.96 1.15 3.7 2.98 4.9L6.5 17.5a.48.48 0 0 0 .7.56l3.67-2.43c.36.04.73.07 1.13.07 4.42 0 8-2.79 8-6.24C20 5.79 16.42 3 12 3z" />
            </svg>
            <span className="whitespace-nowrap">로그인</span>
          </button>
        </div>
      )}
    </div>
  );
}