import type { Metadata } from 'next'
import MacroHomeClient from './MacroHomeClient'

export const metadata: Metadata = {
  title: '매크로 지표 | ReAnt',
  description: '경기·고용·소비·물가·금리·신용·유동성·밸류에이션 — 미국 매크로 지표를 카테고리별로 탐색합니다.',
}

export default function Page() {
  return <MacroHomeClient />
}
