import { Suspense } from 'react';
import FlowClient from './FlowClient';

export default function FlowPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">불러오는 중…</div>}>
      <FlowClient />
    </Suspense>
  );
}
