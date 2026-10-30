import type { Metadata } from 'next'
import LandingClient from './LandingClient'

export const metadata: Metadata = {
  title: 'REANT | My Economics Professor',
  description: "You made it here, you're a lucky guy. Check the data, and get some ideas.",
}

// 예전 메인 공유 링크(/?side=…)의 /ants 리다이렉트는 middleware.ts 에서 처리
export default function Page() {
  return <LandingClient />
}
