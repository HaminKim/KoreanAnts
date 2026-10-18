import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '무엇을 분석할까요? | ReAnt',
  description: '매크로 시장 분석 또는 개별종목 분석을 선택하세요.',
}

// 02. ANALYSIS HUB — 명료한 2분기 선택. 초기 진입에서 과도한 정보는 넣지 않는다.
const CHOICES = [
  {
    href: '/macro',
    eyebrow: 'MACRO',
    title: '매크로 시장 분석하기',
    desc: '경기·물가·금리·신용 등 30여 개 지표로 지금이 어떤 환경인지 살펴봅니다.',
  },
  {
    href: '/watchlist',
    eyebrow: 'STOCKS',
    title: '개별종목 분석하기',
    desc: '섹터·종목별 상대강도(RS)와 스테이지로 시장의 리더를 찾습니다.',
  },
]

export default function ExplorePage() {
  return (
    <div className="pt-6 sm:pt-10 pb-16">
      <Link href="/" className="text-xs" style={{ color: 'var(--ink-mute)' }}>← 처음으로</Link>
      <h1 className="mt-4 text-[26px] sm:text-[34px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
        무엇을 분석할까요?
      </h1>
      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {CHOICES.map(c => (
          <Link key={c.href} href={c.href}
            className="group flex flex-col justify-between min-h-[200px] sm:min-h-[260px] p-6 transition-colors"
            style={{ border: '1px solid var(--ink)', background: 'var(--surface)' }}>
            <div>
              <div className="mono text-[11px] font-bold tracking-widest" style={{ color: 'var(--ink-mute)' }}>{c.eyebrow}</div>
              <div className="mt-3 text-xl sm:text-2xl font-bold" style={{ color: 'var(--ink)' }}>{c.title}</div>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}>{c.desc}</p>
            </div>
            <div className="mt-6 text-sm font-bold transition-transform group-hover:translate-x-1" style={{ color: 'var(--accent)' }}>
              시작하기 →
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
