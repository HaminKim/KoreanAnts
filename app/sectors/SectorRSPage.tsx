'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

type RSPoint = { d: string; v: number }
interface SectorItem {
  id: number
  name: string
  etf: string
  emoji: string
  sector_rs_excess: number | null
  sector_rs_history: RSPoint[]
}
interface WatchlistData {
  asOf: string
  sectors: SectorItem[]
}

// 26색 팔레트 — 흑/백 배경 모두 가독. 색상환을 돌며 명도 교차.
const PALETTE = [
  '#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#fabed4', '#469990',
  '#dcbeff', '#9a6324', '#fffac8', '#800000', '#aaffc3',
  '#808000', '#ffd8b1', '#000075', '#a9a9a9', '#ff6b6b',
  '#1dd1a1', '#feca57', '#5f27cd', '#54a0ff', '#c8d6e5',
  '#ff9ff3',
]

const PERIODS = [20, 30, 60] as const

export default function SectorRSPage() {
  const [data, setData] = useState<WatchlistData | null>(null)
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [picked, setPicked] = useState<Set<string>>(new Set())  // etf들 — 클릭으로 다중 고정 강조
  const [hover, setHover] = useState<string | null>(null)       // etf — 마우스 오버
  const togglePick = (etf: string) => setPicked(prev => {
    const n = new Set(prev)
    if (n.has(etf)) n.delete(etf); else n.add(etf)
    return n
  })
  const [capture, setCapture] = useState(false)
  const [zeroEmph, setZeroEmph] = useState(true)   // 시장(0%) 기준선 강조
  const chartRef = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(1000)

  useEffect(() => {
    fetch('/data/watchlist.json', { cache: 'no-store' })
      .then(r => r.json())
      .then(setData)
      .catch(() => setData(null))
    try {
      setCapture(localStorage.getItem('reant_wl_capture') === '1')
      setZeroEmph(localStorage.getItem('reant_sectors_zero') !== '0')
    } catch {}
  }, [])

  useEffect(() => {
    const el = chartRef.current
    if (!el) return
    const obs = new ResizeObserver(e => setW(e[0].contentRect.width))
    obs.observe(el)
    setW(el.clientWidth)
    return () => obs.disconnect()
  }, [data])

  // 캡처 모드: 전체 화면이 검게 나오도록 body에도 클래스 부여
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.classList.toggle('capture-mode', capture)
    return () => document.body.classList.remove('capture-mode')
  }, [capture])

  const toggleCapture = () => setCapture(v => {
    const n = !v
    try { localStorage.setItem('reant_wl_capture', n ? '1' : '0') } catch {}
    return n
  })

  const toggleZero = () => setZeroEmph(v => {
    const n = !v
    try { localStorage.setItem('reant_sectors_zero', n ? '1' : '0') } catch {}
    return n
  })

  const sectors = useMemo(
    () => (data?.sectors ?? []).filter(s => s.etf !== 'SPY' && s.sector_rs_history.length > 1),
    [data],
  )

  // 색: 현재 RS 내림차순 순서로 팔레트 배정 (강한 섹터가 앞 색)
  const ordered = useMemo(
    () => [...sectors].sort((a, b) => (b.sector_rs_excess ?? -1e9) - (a.sector_rs_excess ?? -1e9)),
    [sectors],
  )
  const colorOf = useMemo(() => {
    const m = new Map<string, string>()
    ordered.forEach((s, i) => m.set(s.etf, PALETTE[i % PALETTE.length]))
    return m
  }, [ordered])

  if (!data) {
    return <div className="py-32 text-center text-sm" style={{ color: 'var(--ink-mute)' }}>섹터 데이터 로딩 중…</div>
  }

  const H = 560
  const PAD = { l: 52, r: 132, t: 20, b: 34 }
  const iW = Math.max(320, w - PAD.l - PAD.r)
  const iH = H - PAD.t - PAD.b

  const allDates = ordered[0]?.sector_rs_history.map(p => p.d) ?? []
  const sliced = allDates.slice(-days)
  const startIdx = allDates.length - sliced.length
  const D = sliced.length

  const series = ordered.map(s => {
    const pts = s.sector_rs_history.slice(startIdx)
    return { s, pts }
  })

  const allV = series.flatMap(x => x.pts.map(p => p.v)).concat(0)
  const lo = Math.min(...allV)
  const hi = Math.max(...allV)
  const pad = (hi - lo) * 0.08 || 1
  const yMin = lo - pad
  const yMax = hi + pad

  const xOf = (i: number) => PAD.l + (D <= 1 ? 0 : (i / (D - 1)) * iW)
  const yOf = (v: number) => PAD.t + iH * (1 - (v - yMin) / (yMax - yMin))

  // Y 그리드 눈금 (5개 정도)
  const ticks: number[] = (() => {
    const out: number[] = []
    const step = niceStep((yMax - yMin) / 5)
    const first = Math.ceil(yMin / step) * step
    for (let t = first; t <= yMax; t += step) out.push(Math.round(t * 10) / 10)
    return out
  })()

  // 우측 순위 컬럼 — RS 강한 순으로 균등 배치 (그래프 선과 잇지 않음)
  const RIGHT_X = PAD.l + iW + 12
  const rowH = Math.min(20, iH / Math.max(ordered.length, 1))
  const rankRows = ordered.map((s, i) => ({
    etf: s.etf, emoji: s.emoji,
    v: s.sector_rs_excess ?? 0,
    y: PAD.t + rowH / 2 + i * rowH,
  }))

  // 강조 대상: 고른 것들 + 현재 호버. 하나라도 있으면 나머지는 흐리게.
  const hasFocus = picked.size > 0 || hover !== null
  const isOn = (etf: string) => picked.has(etf) || hover === etf
  const dateStep = D > 45 ? 5 : D > 24 ? 3 : 2

  return (
    <div className={capture ? 'capture-mode' : undefined}
      style={{
        background: 'var(--surface)',
        margin: '-1.5rem -1rem 0',
        padding: '1.5rem 1rem 3rem',
        minHeight: capture ? '100vh' : undefined,
        overflowX: 'hidden',
      }}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 mb-1 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>섹터 RS 한눈에 보기</h1>
          <p className="text-[11px] mt-0.5" style={{ color: 'var(--ink-mute)' }}>
            SPY 대비 {days}일 초과수익률(%) · 위일수록 시장보다 강함 · {data.asOf}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/watchlist" className="text-[11px] font-semibold px-2.5 py-1"
            style={{ border: '1px solid var(--hairline)', color: 'var(--ink-mute)' }}>
            ← 히트맵
          </Link>
          <button onClick={toggleCapture} className="text-[11px] font-semibold px-2.5 py-1"
            style={{ border: '1px solid var(--hairline)', background: capture ? 'var(--accent)' : 'transparent', color: capture ? '#fff' : 'var(--ink-mute)' }}>
            {capture ? '● 캡처 모드' : '○ 캡처 모드'}
          </button>
        </div>
      </div>

      {/* 기간 */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[11px] font-semibold mr-1" style={{ color: 'var(--ink-mute)' }}>기간</span>
        {PERIODS.map(d => (
          <button key={d} onClick={() => setDays(d)}
            className="px-2.5 py-1 text-xs font-semibold"
            style={{
              background: days === d ? 'var(--accent)' : 'transparent',
              color: days === d ? '#fff' : 'var(--ink-mute)',
              border: `1px solid ${days === d ? 'var(--accent)' : 'var(--hairline)'}`,
            }}>
            {d}일
          </button>
        ))}
        <button onClick={toggleZero} className="ml-2 px-2.5 py-1 text-xs font-semibold"
          style={{
            background: zeroEmph ? 'var(--accent)' : 'transparent',
            color: zeroEmph ? '#fff' : 'var(--ink-mute)',
            border: `1px solid ${zeroEmph ? 'var(--accent)' : 'var(--hairline)'}`,
          }}>
          시장(0%) {zeroEmph ? '강조 ●' : '강조 ○'}
        </button>
        {picked.size > 0 && (
          <button onClick={() => setPicked(new Set())} className="ml-2 text-[11px] px-2 py-1" style={{ color: 'var(--ink-mute)', border: '1px solid var(--hairline)' }}>
            강조 {picked.size}개 해제 ✕
          </button>
        )}
      </div>

      {/* 차트 */}
      <div>
        <div ref={chartRef}>
          <svg width="100%" viewBox={`0 0 ${w} ${H}`} style={{ display: 'block', maxWidth: '100%' }}>
            {/* 0 기준선 (시장) — 비강조일 때만 여기서 얇게. 강조 시엔 라인들 위에 덧그림 */}
            {yMin < 0 && yMax > 0 && !zeroEmph && (
              <line x1={PAD.l} x2={PAD.l + iW} y1={yOf(0)} y2={yOf(0)}
                stroke="var(--hairline-2)" strokeWidth={1.5} />
            )}
            {/* Y 그리드 */}
            {ticks.map(t => (
              <g key={t}>
                <line x1={PAD.l} x2={PAD.l + iW} y1={yOf(t)} y2={yOf(t)} stroke="var(--hairline)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : '2,4'} />
                <text x={PAD.l - 8} y={yOf(t)} fontSize={10} textAnchor="end" dominantBaseline="middle" fill="var(--ink-2)" className="mono">
                  {t > 0 ? '+' : ''}{t}%
                </text>
              </g>
            ))}
            {/* X 날짜 */}
            {sliced.map((d, i) => {
              if (i % dateStep !== 0 && i !== D - 1) return null
              return (
                <text key={d} x={xOf(i)} y={H - 12} fontSize={10} textAnchor="middle" fill="var(--ink-2)" className="mono">
                  {d.slice(5)}
                </text>
              )
            })}

            {/* 라인들 */}
            {series.map(({ s, pts }) => {
              const color = colorOf.get(s.etf)!
              const on = isOn(s.etf)
              const dim = hasFocus && !on
              const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ')
              return (
                <path key={s.etf} d={path} fill="none" stroke={color}
                  strokeWidth={on ? 3.2 : 1.6}
                  opacity={dim ? 0.04 : on ? 1 : 0.82}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ cursor: 'pointer', transition: 'opacity .12s' }}
                  onMouseEnter={() => setHover(s.etf)}
                  onMouseLeave={() => setHover(null)}
                  onClick={() => togglePick(s.etf)}
                />
              )
            })}

            {/* 시장(0%) 강조선 — 라인들 위(맨 앞)에 덧그림 */}
            {yMin < 0 && yMax > 0 && zeroEmph && (
              <g>
                <line x1={PAD.l} x2={PAD.l + iW} y1={yOf(0)} y2={yOf(0)}
                  stroke="var(--accent)" strokeWidth={3} strokeLinecap="round" />
                <text x={PAD.l + 4} y={yOf(0) - 5} fontSize={10} fontWeight={700}
                  fill="var(--accent)" className="mono">시장 0%</text>
              </g>
            )}

            {/* 우측 순위 컬럼 (그래프와 잇지 않음) */}
            {rankRows.map((r, i) => {
              const color = colorOf.get(r.etf)!
              const on = isOn(r.etf)
              const dim = hasFocus && !on
              return (
                <g key={r.etf} opacity={dim ? 0.12 : 1} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHover(r.etf)} onMouseLeave={() => setHover(null)}
                  onClick={() => togglePick(r.etf)}>
                  <rect x={RIGHT_X} y={r.y - 4} width={7} height={7} rx={1.5} fill={color}
                    stroke={picked.has(r.etf) ? 'var(--ink)' : 'none'} strokeWidth={picked.has(r.etf) ? 1 : 0} />
                  <text x={RIGHT_X + 12} y={r.y} fontSize={on ? 10.5 : 9} dominantBaseline="middle"
                    fill={on ? color : 'var(--ink-2)'} fontWeight={on ? 700 : 400} className="mono">
                    {i + 1} {r.emoji} {r.v > 0 ? '+' : ''}{r.v.toFixed(1)}%
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      </div>

      {/* 범례 — 현재 RS 순 */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1">
        {ordered.map((s, i) => {
          const color = colorOf.get(s.etf)!
          const on = isOn(s.etf)
          const isPicked = picked.has(s.etf)
          const rs = s.sector_rs_excess ?? 0
          return (
            <button key={s.etf}
              onMouseEnter={() => setHover(s.etf)}
              onMouseLeave={() => setHover(null)}
              onClick={() => togglePick(s.etf)}
              className="flex items-center gap-1.5 px-2 py-1.5 text-left"
              style={{
                border: `1px solid ${on ? color : 'var(--hairline)'}`,
                background: isPicked ? 'var(--plane)' : 'transparent',
                opacity: hasFocus && !on ? 0.24 : 1,
              }}>
              <span className="mono text-[10px] w-4 shrink-0" style={{ color: 'var(--ink-mute)' }}>{i + 1}</span>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0 }} />
              <span className="text-[11px] font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--ink)' }}>
                {s.emoji} {s.name}
              </span>
              <span className="mono text-[10px] shrink-0" style={{ color: rs >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>
                {rs >= 0 ? '+' : ''}{rs.toFixed(1)}
              </span>
            </button>
          )
        })}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
        선·범례·우측 목록을 클릭하면 강조됩니다(여러 개 선택 가능). 다시 클릭하면 해제.
        RS는 각 섹터 대표 ETF의 SPY 대비 {days}일 초과수익률입니다.
      </p>
    </div>
  )
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  const s = n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10
  return s * p
}
