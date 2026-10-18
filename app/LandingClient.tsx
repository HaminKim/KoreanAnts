'use client'

// 01. LANDING — '지금 미국 주식은 어떨까?'
//  - 기본 S&P 500, Nasdaq-100 으로 전환 (동시 표시 아님)
//  - 라인 차트. 마지막 거래일 구간에만 은은한 발광/펄스 (상승=초록, 하락=빨강)
//  - 애니메이션은 '실시간'을 뜻하지 않음 → 기준일을 항상 표기

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

type IndexKey = 'SPX' | 'NDX'
interface Landing {
  generatedAt: string
  index: Record<IndexKey, { label: string; d: string[]; v: number[] }>
}

const CACHE_KEY = 'reant_landing_cache'
const RANGES = [
  { id: '3M', months: 3 }, { id: '1Y', months: 12 }, { id: '5Y', months: 60 },
] as const
type RangeId = (typeof RANGES)[number]['id']

function fmtDate(d: string) { return `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}` }
function fmtVal(v: number) { return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function LandingClient() {
  const [data, setData] = useState<Landing | null>(null)
  const [err, setErr] = useState(false)
  const [idx, setIdx] = useState<IndexKey>('SPX')
  const [range, setRange] = useState<RangeId>('5Y')

  useEffect(() => {
    fetch('/data/market/landing.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((js: Landing) => { setData(js); try { localStorage.setItem(CACHE_KEY, JSON.stringify(js)) } catch {} })
      .catch(() => {
        try { const c = localStorage.getItem(CACHE_KEY); if (c) { setData(JSON.parse(c)); return } } catch {}
        setErr(true)
      })
  }, [])

  const series = data?.index[idx]
  const view = useMemo(() => {
    if (!series || series.d.length < 3) return null
    const months = RANGES.find(r => r.id === range)!.months
    const last = series.d[series.d.length - 1]
    const dt = new Date(last + 'T00:00:00Z')
    dt.setUTCMonth(dt.getUTCMonth() - months)
    const cutoff = dt.toISOString().slice(0, 10)
    let i0 = series.d.findIndex(d => d >= cutoff)
    if (i0 < 0) i0 = 0
    // 마지막 거래일 변동을 위해 전일 종가는 전체 데이터에서
    const n = series.v.length
    return {
      d: series.d.slice(i0), v: series.v.slice(i0),
      last: series.v[n - 1], prev: series.v[n - 2], lastDate: last,
      startVal: series.v[i0],
    }
  }, [series, range])

  const chg = view ? view.last - view.prev : 0
  const chgPct = view ? (chg / view.prev) * 100 : 0
  const up = chg >= 0
  const periodPct = view ? (view.last / view.startVal - 1) * 100 : 0

  return (
    <div className="pt-6 sm:pt-10 pb-10">
      <h1 className="text-[28px] sm:text-[40px] font-bold tracking-tight leading-tight" style={{ color: 'var(--ink)' }}>
        지금 미국 주식은 어떨까?
      </h1>

      {/* 지수 전환 */}
      <div className="mt-5 flex items-center gap-1" role="tablist">
        {(['SPX', 'NDX'] as IndexKey[]).map(k => (
          <button key={k} role="tab" aria-selected={idx === k} onClick={() => setIdx(k)}
            className="px-3 py-1.5 text-sm font-semibold"
            style={{
              background: idx === k ? 'var(--ink)' : 'transparent',
              color: idx === k ? 'var(--surface)' : 'var(--ink-mute)',
              border: `1px solid ${idx === k ? 'var(--ink)' : 'var(--btn-border)'}`,
            }}>
            {k === 'SPX' ? 'S&P 500' : 'Nasdaq-100'}
          </button>
        ))}
      </div>

      {/* 숫자 */}
      <div className="mt-4 min-h-[76px]">
        {view ? (
          <>
            <div className="mono text-[32px] sm:text-[44px] font-bold leading-none" style={{ color: 'var(--ink)' }}>{fmtVal(view.last)}</div>
            <div className="mt-2 flex items-baseline gap-2 flex-wrap text-sm">
              <span className="mono font-semibold" style={{ color: up ? 'var(--up-text)' : 'var(--down-text)' }}>
                {up ? '▲' : '▼'} {fmtVal(Math.abs(chg))} ({up ? '+' : ''}{chgPct.toFixed(2)}%)
              </span>
              <span className="text-xs" style={{ color: 'var(--ink-mute)' }}>
                마지막 거래일 {fmtDate(view.lastDate)} 종가 기준 · 실시간 시세 아님
              </span>
            </div>
          </>
        ) : err ? (
          <p className="text-sm" style={{ color: 'var(--ink-mute)' }}>지수 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
        ) : (
          <div className="h-[76px] animate-pulse" style={{ background: 'var(--plane)' }} />
        )}
      </div>

      {/* 차트 */}
      <div className="mt-4">
        {view ? <BigLine d={view.d} v={view.v} up={up} /> : <div className="h-[260px] sm:h-[360px]" style={{ background: 'var(--plane)' }} />}
        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {RANGES.map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} className="px-2.5 py-1 text-xs font-semibold"
                style={{
                  background: range === r.id ? 'var(--accent)' : 'transparent',
                  color: range === r.id ? '#fff' : 'var(--ink-mute)',
                  border: `1px solid ${range === r.id ? 'var(--accent)' : 'var(--btn-border)'}`,
                }}>{r.id}</button>
            ))}
          </div>
          {view && (
            <span className="mono text-xs" style={{ color: periodPct >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>
              {range} {periodPct >= 0 ? '+' : ''}{periodPct.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-12 flex justify-center">
        <Link href="/explore"
          className="inline-flex items-center justify-center w-full max-w-[320px] h-14 text-base font-bold transition-transform active:scale-[0.98]"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          확인하기
        </Link>
      </div>
      <p className="mt-3 text-center text-[11px]" style={{ color: 'var(--ink-mute)' }}>
        매크로 환경 → 섹터·종목 리더십 → 한국 투자자 수급 순서로 살펴봅니다
      </p>
    </div>
  )
}

// ── 대형 라인 차트 (SVG) ──
function BigLine({ d, v, up }: { d: string[]; v: number[]; up: boolean }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(900)
  const [hi, setHi] = useState<number | null>(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = w < 640 ? 260 : 360
  const PAD = { l: 4, r: 64, t: 16, b: 26 }
  const min = Math.min(...v), max = Math.max(...v)
  const span = max - min || 1
  const x = (i: number) => PAD.l + (i / (v.length - 1)) * (w - PAD.l - PAD.r)
  const y = (val: number) => PAD.t + (1 - (val - min) / span) * (H - PAD.t - PAD.b)
  const n = v.length
  const path = v.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(val).toFixed(1)}`).join('')
  const area = `${path}L${x(n - 1).toFixed(1)},${H - PAD.b}L${x(0).toFixed(1)},${H - PAD.b}Z`
  const seg = `M${x(n - 2).toFixed(1)},${y(v[n - 2]).toFixed(1)}L${x(n - 1).toFixed(1)},${y(v[n - 1]).toFixed(1)}`
  const tone = up ? 'var(--up-text)' : 'var(--down-text)'

  const ticks = [min, min + span / 2, max]
  const xt = [0, Math.floor(n / 3), Math.floor((2 * n) / 3)]

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * w
    const i = Math.round(((px - PAD.l) / (w - PAD.l - PAD.r)) * (n - 1))
    setHi(i >= 0 && i < n ? i : null)
  }

  return (
    <div ref={boxRef} className="relative w-full">
      <svg width="100%" viewBox={`0 0 ${w} ${H}`} style={{ display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
        <defs>
          <linearGradient id="landing-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <filter id="landing-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeDasharray="2 3" />
            <text x={w - PAD.r + 8} y={y(t)} dominantBaseline="middle" fontSize={11} fill="var(--ink-mute)" className="mono">
              {Math.round(t).toLocaleString('en-US')}
            </text>
          </g>
        ))}
        {xt.map(i => (
          <text key={i} x={x(i)} y={H - 8} fontSize={11} fill="var(--ink-mute)" className="mono">{d[i]?.slice(0, 7).replace('-', '.')}</text>
        ))}
        <path d={area} fill="url(#landing-fill)" />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinejoin="round" />
        {/* 마지막 거래일 구간: 발광 + 펄스 */}
        <path d={seg} className="landing-glow" fill="none" stroke={tone} strokeWidth={10} strokeLinecap="round" filter="url(#landing-glow)" />
        <path d={seg} fill="none" stroke={tone} strokeWidth={2.6} strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(v[n - 1])} r={9} fill={tone} className="landing-glow" filter="url(#landing-glow)" />
        <circle cx={x(n - 1)} cy={y(v[n - 1])} r={3.5} fill={tone} />
        {hi !== null && (
          <g>
            <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={H - PAD.b} stroke="var(--ink-mute)" strokeWidth={1} />
            <circle cx={x(hi)} cy={y(v[hi])} r={3.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
          </g>
        )}
      </svg>
      {hi !== null && (
        <div className="absolute top-0 pointer-events-none px-2 py-1 text-[11px] mono"
          style={{
            left: Math.min(Math.max(x(hi) / w * 100, 8), 80) + '%', transform: 'translateX(-50%)',
            background: 'var(--surface)', border: '1px solid var(--hairline-2)', color: 'var(--ink)',
          }}>
          {fmtDate(d[hi])} · {fmtVal(v[hi])}
        </div>
      )}
    </div>
  )
}
