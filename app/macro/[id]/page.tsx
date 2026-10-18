import { readFileSync } from 'fs'
import path from 'path'
import type { Metadata } from 'next'
import type { Catalog } from '@/app/lib/macro'
import IndicatorDetailClient from './IndicatorDetailClient'

// 빌드 시점에 catalog 를 읽어 지표별 페이지를 정적으로 만든다 (데이터 자체는 브라우저에서 최신 JSON 로드)
function readCatalog(): Catalog {
  const p = path.join(process.cwd(), 'public', 'data', 'macro', 'catalog.json')
  return JSON.parse(readFileSync(p, 'utf-8')) as Catalog
}

export const dynamicParams = false

export function generateStaticParams() {
  return readCatalog().indicators.filter(i => i.status !== 'pending').map(i => ({ id: i.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const ind = readCatalog().indicators.find(i => i.id === id)
  if (!ind) return { title: '매크로 지표 | ReAnt' }
  return {
    title: `${ind.ko} (${ind.name}) | ReAnt 매크로`,
    description: `${ind.what}. ${ind.read}`,
  }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <IndicatorDetailClient id={id} />
}
