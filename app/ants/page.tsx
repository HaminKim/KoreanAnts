import type { Metadata } from 'next'
import AntsHome from './AntsHome'

export const metadata: Metadata = {
  title: '한국 투자자 심리 동향 | ReAnt',
  description: '한국 개인투자자의 미국주식 누적 순매수 흐름과 순매수·순매도 랭킹',
}

export default function Page() {
  return <AntsHome />
}
