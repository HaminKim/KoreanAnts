import type { Metadata } from 'next'
import SectorRSPage from './SectorRSPage'

export const metadata: Metadata = {
  title: '섹터 RS 한눈에 | ReAnt',
  description: '전체 섹터의 SPY 대비 상대강도(RS) 추이를 한 화면에서 비교',
}

export default function Page() {
  return <SectorRSPage />
}
