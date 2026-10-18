import type { Metadata } from 'next'
import WorkspaceClient from './WorkspaceClient'

export const metadata: Metadata = {
  title: '매크로 워크스페이스 | ReAnt',
  description: '여러 매크로 지표와 주가지수를 같은 시간축에 세로로 나열해 비교하고, 분석 구성을 저장합니다.',
}

export default function Page() {
  return <WorkspaceClient />
}
