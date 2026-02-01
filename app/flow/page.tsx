import { Suspense } from 'react';
import FlowClient from './FlowClient'; // 경로 확인 필요

export default function FlowPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center text-sm text-gray-500">차트 불러오는 중...</div>}>
      <FlowClient />
    </Suspense>
  );
}