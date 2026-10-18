import type { Metadata } from 'next'
import LandingClient from './LandingClient'

export const metadata: Metadata = {
  title: '리앤트(REANT) | 지금 미국 주식은 어떨까?',
  description: 'S&P 500 · Nasdaq-100 흐름에서 시작해 매크로 지표, 섹터·종목 RS, 한국 투자자 수급까지 한 흐름으로 분석합니다.',
}

// 예전 메인 공유 링크(/?side=…)의 /ants 리다이렉트는 middleware.ts 에서 처리
export default function Page() {
  return <LandingClient />
}
