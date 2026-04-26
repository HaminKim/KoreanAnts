import { Suspense } from 'react'
import type { Metadata } from 'next'
import WatchlistKRClient from './WatchlistKRClient'

export const metadata: Metadata = {
  title: '한국 종목 히트맵 | ReAnt',
  description: '코스피/코스닥 섹터별 종목 히트맵 - 스탠 와인스타인 스테이지 분석',
}

export default function WatchlistKRPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
          분석 데이터 로딩 중...
        </div>
      }
    >
      <WatchlistKRClient />
    </Suspense>
  )
}
