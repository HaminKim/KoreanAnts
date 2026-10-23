import type { Metadata } from 'next'
import HouseClient from './HouseClient'

export const metadata: Metadata = {
  title: '한국 부동산 | ReAnt',
  description: '17개 시도 지도로 보는 집값·가계부채·대출환경·미분양, 그리고 1975년부터의 전국 주택가격 사이클.',
}

export default function Page() {
  return <HouseClient />
}
