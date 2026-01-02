import { Suspense } from 'react';
import HomeClient from './HomeClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">불러오는 중…</div>}>
      <HomeClient />
    </Suspense>
  );
}
