'use client'

// 03. MACRO CATEGORIES — 카테고리별 '지표명 + 미니차트' 카드. 카드 → 지표 상세. 워크스페이스·기존 페이지 바로가기.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { type Catalog, type Indicator, loadCatalog, fmtNum, fmtPeriod, tfLabel, updateInfo, fmtMD } from '@/app/lib/macro'
import { Sparkline } from '@/app/components/macro/ui'

const SHORTCUTS = [
  { href: '/ants', label: '투자자 심리' },
  { href: '/flow', label: 'Korean Flow' },
  { href: '/sectors', label: '섹터 RS' },
  { href: '/watchlist', label: '종목 히트맵' },
]

export default function MacroHomeClient() {
  const [cat, setCat] = useState<Catalog | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { loadCatalog().then(setCat).catch(() => setErr(true)) }, [])

  return (
    <div className="pt-2 pb-16">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/explore" className="text-xs" style={{ color: 'var(--ink-mute)' }}>← 분석 선택</Link>
          <h1 className="mt-2 text-2xl font-bold" style={{ color: 'var(--ink)' }}>매크로 지표</h1>
          <p className="mt-1 text-xs leading-relaxed max-w-xl" style={{ color: 'var(--ink-mute)' }}>
            지금이 위험자산에 우호적인 환경인지 판단하기 위한 지표입니다. 매수·매도 신호가 아니라 시장 국면을 이해하는 도구로 사용하세요.
          </p>
        </div>
        <Link href="/macro/workspace" className="px-3 py-2 text-xs font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
          다중 지표 분석하기 →
        </Link>
      </div>

      {/* 기존 리앤트 페이지 바로가기 */}
      <div className="mt-5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold mr-1" style={{ color: 'var(--ink-mute)' }}>리앤트 바로가기</span>
        {SHORTCUTS.map(s => (
          <Link key={s.href} href={s.href} className="px-2.5 py-1 text-xs font-semibold"
            style={{ border: '1px solid var(--btn-border)', color: 'var(--ink-2)' }}>
            {s.label}
          </Link>
        ))}
      </div>

      {!cat && !err && <div className="mt-10 text-center text-sm py-20" style={{ color: 'var(--ink-mute)' }}>지표 불러오는 중…</div>}
      {err && <div className="mt-10 text-center text-sm py-20" style={{ color: 'var(--ink-mute)' }}>지표 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}

      {cat && cat.categories.filter(c => c.id !== 'market').map(c => {
        const items = cat.indicators.filter(i => i.cat === c.id)
        if (!items.length) return null
        return (
          <section key={c.id} className="mt-9">
            <div className="flex items-baseline gap-2 pb-2" style={{ borderBottom: '1px solid var(--ink)' }}>
              <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{c.name}</h2>
              <span className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>{c.desc}</span>
            </div>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {items.map(ind => <Card key={ind.id} ind={ind} cat={cat} />)}
            </div>
          </section>
        )
      })}

      {cat && (
        <p className="mt-10 text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
          출처: FRED(BEA·BLS·Federal Reserve·Census·Treasury), Robert Shiller, Yahoo Finance. 1970년 이후(지표별 가용 시작일이 늦으면 그 이후).
          일·주별 원본은 월평균 또는 월말 값으로 변환해 표시합니다. 갱신 {cat.generatedAt.slice(0, 10)}
        </p>
      )}
    </div>
  )
}

function Card({ ind, cat }: { ind: Indicator; cat: Catalog }) {
  const s = ind.main[0] ? cat.series[ind.main[0]] : undefined
  const live = ind.status === 'live' && s
  const body = (
    <div className="h-full flex flex-col p-3 transition-colors"
      style={{ border: '1px solid var(--hairline-2)', background: 'var(--surface)', opacity: live ? 1 : 0.55 }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-bold leading-snug" style={{ color: 'var(--ink)' }}>{ind.ko}</div>
          <div className="text-[10px] truncate" style={{ color: 'var(--ink-mute)' }}>{ind.name}</div>
        </div>
        {live && <UpdateStamp ind={ind} cat={cat} />}
      </div>
      {live ? (
        <>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="mono text-sm font-bold" style={{ color: 'var(--ink)' }}>{fmtNum(s.latest.value, s, s.latest.tf)}</span>
            <span className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{tfLabel(s.latest.tf, s.obsFreq)} · {fmtPeriod(s.latest.date, s.obsFreq)}</span>
          </div>
          <div className="mt-auto pt-2">
            <Sparkline data={s.spark} height={38} zeroLine={s.latest.tf !== 'level'} />
          </div>
        </>
      ) : (
        <div className="mt-auto pt-6 text-[10px]" style={{ color: 'var(--ink-mute)' }}>
          {ind.status === 'pending' ? '준비 중 · 데이터 라이선스 확인' : '데이터 갱신 중'}
        </div>
      )}
    </div>
  )
  return live ? <Link href={`/macro/${ind.id}`} className="block hover:opacity-90">{body}</Link> : <div>{body}</div>
}

// 카드 오른쪽 위: 최신 데이터 공개일 / 다음 발표 예정일. 주 시리즈가 여럿이면 가장 최근 공개 · 가장 빠른 다음 발표
function UpdateStamp({ ind, cat }: { ind: Indicator; cat: Catalog }) {
  const infos = ind.main.map(k => cat.series[k]).filter(Boolean).map(updateInfo)
  const got = infos.map(i => i.got).filter(Boolean).sort().pop() ?? null
  const nx = infos.filter(i => i.next).sort((a, b) => (a.next! < b.next! ? -1 : 1))[0]
  return (
    <div className="shrink-0 text-right text-[9px] leading-tight whitespace-nowrap" style={{ color: 'var(--ink-mute)' }}
      title={`최신 데이터가 공개된 날 (미국 날짜)${nx ? ` · 다음 발표 ${nx.est ? '추정 (주기 기준)' : '예정 (FRED 일정)'}` : ''}`}>
      <div>업데이트 <span className="mono" style={{ color: 'var(--ink-2)' }}>{fmtMD(got)}</span></div>
      {nx && <div>다음 <span className="mono">{nx.est ? '~' : ''}{fmtMD(nx.next)}</span></div>}
    </div>
  )
}
