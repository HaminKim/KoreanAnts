import type { Metadata } from 'next'
import AntsHome from './AntsHome'

export const metadata: Metadata = {
  title: '개미지수 · 한국인 미국주식 수급 | ReAnt',
  description: '한국 개인투자자의 미국주식 순매수/순매도 랭킹과 개미지수',
}

export default function Page() {
  return <AntsHome />
}
