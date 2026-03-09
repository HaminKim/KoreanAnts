import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import JournalClient from './JournalClient';

export const metadata: Metadata = {
  title: '매매일지 | ReAnt',
  robots: { index: false },
};

export default async function JournalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!userData || userData.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
        <p className="text-2xl">🔒</p>
        <p className="text-gray-500 text-sm">접근 권한이 없습니다.</p>
        <a href="/" className="text-sm text-blue-500 underline">홈으로</a>
      </div>
    );
  }

  return <JournalClient userId={user.id} />;
}
