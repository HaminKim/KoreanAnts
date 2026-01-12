'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';

export default function AuthButton() {
  const supabase = createClient();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback`,
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    window.location.reload();
  };

  return (
    <div>
      {user ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 hidden md:block">
            {user.email?.split('@')[0]}님
          </span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-bold bg-gray-100 hover:bg-gray-200 rounded-md transition"
          >
            로그아웃
          </button>
        </div>
      ) : (
        <button
          onClick={handleLogin}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-blue-500 hover:bg-blue-700 rounded-md transition"
        >
          로그인
        </button>
      )}
    </div>
  );
}