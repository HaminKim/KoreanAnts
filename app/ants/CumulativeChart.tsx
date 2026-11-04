'use client'

// 한국 개인투자자 미국주식 누적 순매수 — 순매수가 이어지면 선이 위로 쌓이고, 순매도가 이어지면 내려간다.
//  - 위: 누적선 (선택 기간 시작 = 0), 아래: 그날 순매수 막대
//  - S&P 500 겹쳐보기는 흐리게 (비강조 ≤ 0.1 원칙보다 조금 진하게 — 선이라 너무 흐리면 안 보임)
//  - 확대: Ctrl+휠(트랙패드 오므리기) · 폰은 두 손가락. 확대하면 차트를 끌어 옆으로 이동, 아래에 전체 흐름 막대(끌어서 이동)
//  - 사건 표시: ./events.ts (매크로 EVENTS 급 + 중간급)

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chip } from '@/app/components/macro/ui'
import { ANT_EVENTS, type AntEvent } from './events'

interface CumData { asOf: string; start: string; basis: string; d: string[]; net: number[]; cum: number[] }
interface Landing { index: Record<'SPX' | 'NDX', { d: string[]; v: number[] }> }

const CACHE_KEY = 'reant_ant_cumulative_cache'
const RANGES = [
  { id: '3M', months: 3 }, { id: '6M', months: 6 }, { id: '1Y', months: 12 }, { id: '2Y', months: null },
] as const
type RangeId = (typeof RANGES)[number]['id']

export function fmtUsd(v: number, sign = true) {
  const a = Math.abs(v)
  const s = sign ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''
  if (a >= 1e8) return `${s}${(a / 1e8).toLocaleString('en-US', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}억 $`
  return `${s}${Math.round(a / 1e4).toLocaleString('en-US')}만 $`
}
const fmtDate = (d: string) => `${d.slice(0, 4)}.${d.slice(5, 7)}.${d.slice(8, 10)}`

export default function CumulativeChart() {
  const [data, setData] = useState<CumData | null>(null)
  const [err, setErr] = useState(false)
  const [spx, setSpx] = useState<Landing['index']['SPX'] | null>(null)
  const [range, setRange] = useState<RangeId>('2Y')
  const [overlay, setOverlay] = useState(false)
  const [showEv, setShowEv] = useState(true)

  useEffect(() => {
    fetch('/data/flow/ant_cumulative.json', { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((js: CumData) => { setData(js); try { localStorage.setItem(CACHE_KEY, JSON.stringify(js)) } catch {} })
      .catch(() => {
        try { const c = localStorage.getItem(CACHE_KEY); if (c) { setData(JSON.parse(c)); return } } catch {}
        setErr(true)
      })
  }, [])

  useEffect(() => {
    if (!overlay || spx) return
    fetch('/data/market/landing.json').then(r => r.json()).then((js: Landing) => setSpx(js.index.SPX)).catch(() => {})
  }, [overlay, spx])

  const view = useMemo(() => {
    if (!data || data.d.length < 3) return null
    const months = RANGES.find(r => r.id === range)!.months
    let i0 = 0
    if (months) {
      const dt = new Date(data.asOf + 'T00:00:00Z')
      dt.setUTCMonth(dt.getUTCMonth() - months)
      const cutoff = dt.toISOString().slice(0, 10)
      i0 = Math.max(0, data.d.findIndex(d => d >= cutoff))
    }
    const base = i0 > 0 ? data.cum[i0 - 1] : 0
    const d = data.d.slice(i0)
    const net = data.net.slice(i0)
    const cum = data.cum.slice(i0).map(v => v - base)
    let px: (number | null)[] | null = null
    if (overlay && spx) {
      const m = new Map(spx.d.map((x, i) => [x, spx.v[i]]))
      let last: number | null = null
      px = d.map(x => { const v = m.get(x); if (v !== undefined) last = v; return last })
    }
    return { d, net, cum, px }
  }, [data, range, overlay, spx])

  if (err && !data) return <p className="text-sm py-16 text-center" style={{ color: 'var(--ink-mute)' }}>누적 순매수 데이터를 불러오지 못했습니다.</p>
  if (!view) return <div className="h-[380px] animate-pulse" style={{ background: 'var(--plane)' }} />

  const total = view.cum[view.cum.length - 1]
  const lastNet = view.net[view.net.length - 1]

  return (
    <div>
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-mute)' }}>
            {range === '2Y' ? '최근 2년' : `최근 ${range.replace('M', '개월').replace('1Y', '1년')}`} 누적 순매수
          </div>
          <div className="mono text-[30px] sm:text-[38px] font-bold leading-tight"
            style={{ color: total >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>
            {fmtUsd(total)}
          </div>
          <div className="text-xs" style={{ color: 'var(--ink-mute)' }}>
            마지막 날 {fmtDate(view.d[view.d.length - 1])}{' '}
            <span className="mono font-semibold" style={{ color: lastNet >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>{fmtUsd(lastNet)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map(r => <Chip key={r.id} on={range === r.id} onClick={() => setRange(r.id)}>{r.id}</Chip>)}
          <span className="w-2" />
          <Chip on={overlay} onClick={() => setOverlay(o => !o)}>S&amp;P 500</Chip>
          <Chip on={showEv} onClick={() => setShowEv(o => !o)}>사건</Chip>
        </div>
      </div>
      <div className="mt-3">
        <Plot d={view.d} cum={view.cum} net={view.net} px={view.px} showEvents={showEv} />
      </div>
    </div>
  )
}

const EV_COLOR = '#f08a24'   // 사건 선·음영 (주황)
const EV_TEXT = '#e0761a'
type Win = [number, number]   // 보이는 구간 (인덱스, 소수 허용)
type Gesture = { win: Win; cx: number; dist: number; moved: boolean; mode: 'move' | 'scrub' }
type Placed = AntEvent & { s: number; t: number }

function Plot({ d, cum, net, px, showEvents }: {
  d: string[]; cum: number[]; net: number[]; px: (number | null)[] | null; showEvents: boolean
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [w, setW] = useState(900)
  const [hi, setHi] = useState<number | null>(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const n = cum.length
  const [win, setWinState] = useState<Win>([0, n - 1])
  const winRef = useRef(win)
  const MIN_SPAN = Math.min(n - 1, 10)
  const setWin = (a: number, b: number) => {
    const s = Math.max(MIN_SPAN, Math.min(n - 1, b - a))
    const a2 = Math.max(0, Math.min(n - 1 - s, a))
    const v: Win = [a2, a2 + s]
    winRef.current = v
    setWinState(v)
  }
  // 기간 칩을 바꾸면 전체로
  const d0 = d[0]
  useEffect(() => { const v: Win = [0, n - 1]; winRef.current = v; setWinState(v) }, [n, d0])

  const mobile = w < 640
  const LANE = 0
  const LANE_B = showEvents ? 16 : 0   // x축 날짜 아래 사건 라벨 줄
  const H1 = (mobile ? 230 : 320) + LANE
  const H2 = mobile ? 56 : 72
  const GAP = 10
  const H = H1 + GAP + H2 + 22 + LANE_B
  const Y_DATE = H1 + GAP + H2 + 16, Y_EV = H1 + GAP + H2 + 22 + 7
  const PAD = { l: 4, r: mobile ? 58 : 72, t: 10 + LANE }
  const iw = w - PAD.l - PAD.r
  const [a, b] = win[1] <= n - 1 ? win : [0, n - 1]
  const zoomed = b - a < n - 1.5
  const x = (i: number) => PAD.l + (b === a ? 0 : ((i - a) / (b - a)) * iw)
  const i0 = Math.max(0, Math.floor(a)), i1 = Math.min(n - 1, Math.ceil(b))

  // 보이는 구간 기준으로 세로 범위 (확대하면 그 구간이 꽉 차게)
  const visC = cum.slice(i0, i1 + 1)
  const cMin = Math.min(...visC, ...(zoomed ? [] : [0])), cMax = Math.max(...visC, ...(zoomed ? [] : [0]))
  const cPad = (cMax - cMin) * 0.06 || Math.abs(cMax) * 0.05 || 1
  const y = (v: number) => PAD.t + (1 - (v - (cMin - cPad)) / (cMax - cMin + 2 * cPad)) * (H1 - PAD.t)

  const nAbs = Math.max(...net.slice(i0, i1 + 1).map(Math.abs)) || 1
  const yb0 = H1 + GAP + H2 / 2
  const yb = (v: number) => yb0 - (v / nAbs) * (H2 / 2)
  const per = iw / (b - a + 1)
  const bw = Math.max(1, per - (per > 4 ? Math.min(3, per * 0.25) : 0.3))

  const idx = Array.from({ length: i1 - i0 + 1 }, (_, k) => i0 + k)
  const path = idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(cum[i]).toFixed(1)}`).join('')
  const yArea = y(Math.min(Math.max(0, cMin - cPad), cMax + cPad))
  const area = `${path}L${x(i1).toFixed(1)},${yArea.toFixed(1)}L${x(i0).toFixed(1)},${yArea.toFixed(1)}Z`

  let pxPath = ''
  if (px) {
    const vals = idx.map(i => px[i]).filter((v): v is number => v !== null)
    if (vals.length > 1) {
      const pMin = Math.min(...vals), pMax = Math.max(...vals), ps = pMax - pMin || 1
      const yp = (v: number) => PAD.t + (1 - (v - pMin) / ps) * (H1 - PAD.t - 8) + 4
      let started = false
      pxPath = idx.map(i => {
        const v = px[i]
        if (v === null) return ''
        const s = `${started ? 'L' : 'M'}${x(i).toFixed(1)},${yp(v).toFixed(1)}`
        started = true
        return s
      }).join('')
    }
  }

  const ticks = niceTicks(cMin - cPad, cMax + cPad, mobile ? 4 : 5)
  const tStep = ticks.length > 1 ? ticks[1] - ticks[0] : 1e8
  const xt = dateTicks(d, i0, i1, mobile ? 3 : 6)

  // 사건 → 인덱스 (주말·휴장이면 다음 거래일). 기간 밖이면 뺌
  const events = useMemo<Placed[]>(() => {
    if (!showEvents || !d.length) return []
    const first = d[0], last = d[d.length - 1]
    const out: Placed[] = []
    for (const e of ANT_EVENTS) {
      const end = e.to ?? e.date
      if (end < first || e.date > last) continue
      const s = Math.max(0, d.findIndex(v => v >= e.date))
      let t = s
      if (e.to) {
        const k = d.findIndex(v => v > e.to!)
        t = k < 0 ? d.length - 1 : k - 1
      }
      out.push({ ...e, s, t: Math.max(s, t) })
    }
    return out
  }, [d, showEvents])
  // 라벨 자리 잡기: 큰 사건 먼저, 겹치면 선만 (마우스 올리면 설명)
  const FS = mobile ? 9.5 : 10
  // 라벨은 선(기간이면 음영 가운데) 바로 위 가운데에. 양 끝에선 잘리지 않게 안으로 밀어 넣음
  const evX = (e: Placed) => (e.t > e.s ? (x(e.s) + x(e.t)) / 2 : x(e.s))
  const labelX = (e: Placed) => {
    const half = e.name.length * FS * 0.95 / 2
    return Math.min(w - PAD.r - half + 30, Math.max(PAD.l + half, evX(e)))
  }
  const placed = new Set<number>()
  {
    const boxes: [number, number][] = []
    const order = events.map((_, k) => k).sort((p, q) => (events[p].level === events[q].level ? p - q : events[p].level === 'major' ? -1 : 1))
    for (const k of order) {
      const e = events[k]
      const half = e.name.length * FS * 0.95 / 2
      const x0 = evX(e) - half, x1 = evX(e) + half
      if (evX(e) < PAD.l - 1 || evX(e) > w - PAD.r + 1) continue
      if (boxes.some(([p, q]) => x0 < q + 6 && x1 > p - 6)) continue
      boxes.push([x0, x1])
      placed.add(k)
    }
  }
  const EV_TOP = 2, EV_BOTTOM = H1 + GAP + H2 + 4
  const evAt = (i: number) => events.filter(e => (e.t > e.s && i >= e.s && i <= e.t) || Math.abs(x(e.s) - x(i)) <= 6)

  // ── 확대·이동
  //  마우스: Ctrl+휠(맥 트랙패드 오므리기) = 확대/축소, 확대된 상태에서 끌기·가로 스크롤 = 옆으로 이동, 더블클릭 = 전체
  //  폰: 두 손가락 = 확대/축소, 확대된 상태에서 한 손가락 = 이동, 누르면 그날 값
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const g = useRef<Gesture | null>(null)
  const toX = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect()
    return ((clientX - r.left) / r.width) * w
  }
  const idxAt = (p: number, wn: Win = winRef.current) => wn[0] + ((p - PAD.l) / iw) * (wn[1] - wn[0])
  const hover = (clientX: number) => {
    const i = Math.round(idxAt(toX(clientX)))
    setHi(i >= i0 && i <= i1 ? i : null)
  }
  const begin = () => {
    const p = [...pts.current.values()]
    const cx = toX(p.reduce((s, q) => s + q.x, 0) / p.length)
    const dist = p.length > 1 ? Math.abs(p[0].x - p[1].x) : 0
    const isZoomed = winRef.current[1] - winRef.current[0] < n - 1.5
    const mode = p.length > 1 || isZoomed ? 'move' : 'scrub'
    g.current = { win: winRef.current, cx, dist, moved: g.current?.moved ?? false, mode }
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      const [wa, wb] = winRef.current
      const span = wb - wa
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const c = idxAt(toX(e.clientX))
        const f = Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.01)))
        setWin(c - (c - wa) * f, c + (wb - c) * f)
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && span < n - 1.5) {
        e.preventDefault()
        const dd = (e.deltaX / iw) * span
        setWin(wa + dd, wb + dd)
      }
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, iw, w])

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (!pts.current.size) g.current = null
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    begin()
    if (pts.current.size === 1) hover(e.clientX)
    else setHi(null)
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pts.current.has(e.pointerId)) { if (e.pointerType === 'mouse') hover(e.clientX); return }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = g.current
    if (!s) return
    const p = [...pts.current.values()]
    const cx = toX(p.reduce((q, v) => q + v.x, 0) / p.length)
    if (s.mode === 'scrub') { hover(e.clientX); return }
    const dist = p.length > 1 ? Math.abs(p[0].x - p[1].x) : 0
    if (!s.moved && Math.abs(cx - s.cx) < 5 && (!s.dist || Math.abs(dist - s.dist) < 5)) return
    s.moved = true
    setHi(null)
    const f = s.dist && dist > 10 ? s.dist / dist : 1
    const span = (s.win[1] - s.win[0]) * f
    const anchor = idxAt(s.cx, s.win)
    const na = anchor - ((cx - PAD.l) / iw) * span
    setWin(na, na + span)
  }
  const onUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!pts.current.delete(e.pointerId)) return
    if (pts.current.size) begin()
    else g.current = null
  }

  const tone = (v: number) => (v >= 0 ? 'var(--up-text)' : 'var(--down-text)')
  const hiEvents = hi !== null ? evAt(hi) : []
  const rangeNet = zoomed ? net.slice(i0, i1 + 1).reduce((s, v) => s + v, 0) : 0

  return (
    <div ref={boxRef} className="relative w-full select-none">
      {zoomed && (
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1 text-[11px]" style={{ color: 'var(--ink-mute)' }}>
          <span>
            <span className="mono">{fmtDate(d[i0])} ~ {fmtDate(d[i1])}</span> 순매수{' '}
            <b className="mono" style={{ color: tone(rangeNet) }}>{fmtUsd(rangeNet)}</b>
          </span>
          <span className="flex items-center gap-1">
            <Chip onClick={() => { const c = (a + b) / 2, s = (b - a) * 1.6; setWin(c - s / 2, c + s / 2) }}>축소</Chip>
            <Chip onClick={() => setWin(0, n - 1)}>전체 보기</Chip>
          </span>
        </div>
      )}
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${w} ${H}`}
        style={{ display: 'block', touchAction: zoomed ? 'none' : 'pan-y', cursor: zoomed ? 'grab' : 'crosshair' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onPointerLeave={e => { if (e.pointerType === 'mouse' && !pts.current.size) setHi(null) }}
        onDoubleClick={() => setWin(0, n - 1)}>
        <defs>
          <clipPath id="ant-plot"><rect x={PAD.l} y={0} width={iw} height={H} /></clipPath>
        </defs>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeDasharray={t === 0 ? undefined : '2 3'} />
            <text x={w - PAD.r + 6} y={y(t)} dominantBaseline="middle" fontSize={10.5} fill="var(--ink-mute)" className="mono">
              {t === 0 ? '0' : `${(t / 1e8).toLocaleString('en-US', { maximumFractionDigits: tStep < 1e8 ? 1 : 0 })}억`}
            </text>
          </g>
        ))}

        <g clipPath="url(#ant-plot)">
          {/* 사건: 주황. 기간은 음영, 하루짜리는 선. 라벨 바로 아래부터 x축 날짜 바로 위까지 (일별 막대도 살짝 덮음) */}
          {events.map((e, k) => {
            const on = hiEvents.includes(e)
            const op = e.level === 'major' ? 1 : 0.7
            const top = EV_TOP
            return e.t > e.s ? (
              <rect key={k} x={x(e.s) - per / 2} width={Math.max(2, x(e.t) - x(e.s) + per)} y={top} height={EV_BOTTOM - top}
                fill={EV_COLOR} opacity={(on ? 0.2 : 0.11) * op} />
            ) : (
              <line key={k} x1={x(e.s)} x2={x(e.s)} y1={top} y2={EV_BOTTOM} stroke={EV_COLOR}
                strokeWidth={on ? 1.6 : 1.1} opacity={(on ? 1 : 0.6) * op} />
            )
          })}
        </g>
        {events.map((e, k) => !placed.has(k) && evX(e) >= PAD.l && evX(e) <= w - PAD.r && (
          <circle key={k} cx={evX(e)} cy={Y_EV} r={2} fill={EV_COLOR} opacity={0.8} />
        ))}
        {events.map((e, k) => placed.has(k) && (
          <text key={k} x={labelX(e)} y={Y_EV} fontSize={FS} dominantBaseline="middle" textAnchor="middle"
            fontWeight={e.level === 'major' ? 700 : 500} fill={EV_TEXT}>
            {e.name}
          </text>
        ))}

        {/* 0 기준선은 확실히 */}
        {y(0) >= PAD.t && y(0) <= H1 && <line x1={PAD.l} x2={w - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--zero-line)" strokeWidth={1.2} />}

        <g clipPath="url(#ant-plot)">
          {pxPath && <path d={pxPath} fill="none" stroke="var(--ink-mute)" strokeWidth={1.3} opacity={0.45} />}
          <path d={area} fill="var(--accent)" opacity={0.08} />
          <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.9} strokeLinejoin="round" />
          {i1 === n - 1 && <circle cx={x(n - 1)} cy={y(cum[n - 1])} r={3.5} fill={tone(cum[n - 1])} />}

          {/* 그날 순매수 막대 */}
          {idx.map(i => (
            <rect key={i} x={x(i) - bw / 2} width={bw} y={net[i] >= 0 ? yb(net[i]) : yb0} height={Math.max(0.5, Math.abs(yb(net[i]) - yb0))}
              fill={tone(net[i])} opacity={hi === null || hi === i ? 0.85 : 0.35} />
          ))}
        </g>
        <line x1={PAD.l} x2={w - PAD.r} y1={yb0} y2={yb0} stroke="var(--hairline-2)" />
        <text x={w - PAD.r + 6} y={yb0} dominantBaseline="middle" fontSize={10} fill="var(--ink-mute)">일별</text>

        {xt.map(t => (
          <text key={t.i} x={x(t.i)} y={Y_DATE} fontSize={10.5} fill="var(--ink-mute)" className="mono" textAnchor="middle">{t.label}</text>
        ))}

        {hi !== null && (
          <g pointerEvents="none">
            <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={H1 + GAP + H2} stroke="var(--ink-2)" strokeDasharray="2 2" />
            <circle cx={x(hi)} cy={y(cum[hi])} r={3.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {zoomed && <Overview cum={cum} win={[a, b]} w={w} pad={PAD} onMove={setWin} />}

      {hi !== null && (
        <div className="absolute px-2.5 py-1.5 text-[11px] leading-snug pointer-events-none max-w-[240px]"
          style={{
            top: 30 + LANE,
            left: x(hi) / w > 0.6 ? undefined : `calc(${(x(hi) / w) * 100}% + 10px)`,
            right: x(hi) / w > 0.6 ? `calc(${(1 - x(hi) / w) * 100}% + 10px)` : undefined,
            background: 'var(--surface)', border: '1px solid var(--hairline-2)', color: 'var(--ink)',
          }}>
          <div className="mono font-semibold">{fmtDate(d[hi])}</div>
          <div>누적 <span className="mono font-bold" style={{ color: tone(cum[hi]) }}>{fmtUsd(cum[hi])}</span></div>
          <div>그날 <span className="mono" style={{ color: tone(net[hi]) }}>{fmtUsd(net[hi])}</span></div>
          {px && px[hi] !== null && <div style={{ color: 'var(--ink-mute)' }}>S&amp;P 500 <span className="mono">{px[hi]!.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></div>}
          {hiEvents.map(e => (
            <div key={e.date + e.name} className="mt-1 pt-1" style={{ borderTop: '1px solid var(--hairline)' }}>
              <b>{e.name}</b>{' '}
              <span className="mono" style={{ color: 'var(--ink-mute)' }}>
                {e.date.slice(2).replace(/-/g, '.')}{e.to ? `~${e.to.slice(5).replace('-', '.')}` : ''}
              </span>
              <div style={{ color: 'var(--ink-2)' }}>{e.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 확대했을 때 아래에 보이는 전체 흐름 + 지금 보는 구간. 구간을 끌면 이동, 바깥을 누르면 그리로 */
function Overview({ cum, win, w, pad, onMove }: {
  cum: number[]; win: Win; w: number; pad: { l: number; r: number }; onMove: (a: number, b: number) => void
}) {
  const H = 34
  const n = cum.length
  const iw = w - pad.l - pad.r
  const x = (i: number) => pad.l + (i / (n - 1)) * iw
  const mn = Math.min(...cum), mx = Math.max(...cum), sp = mx - mn || 1
  const y = (v: number) => 3 + (1 - (v - mn) / sp) * (H - 6)
  const path = cum.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const ref = useRef<SVGSVGElement>(null)
  const drag = useRef<number | null>(null)   // 구간 시작과 손가락 사이 거리 (인덱스)
  const at = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    return ((((clientX - r.left) / r.width) * w - pad.l) / iw) * (n - 1)
  }
  const span = win[1] - win[0]
  return (
    <svg ref={ref} width="100%" viewBox={`0 0 ${w} ${H}`} className="mt-1 block" style={{ touchAction: 'none', cursor: 'grab' }}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        const i = at(e.clientX)
        if (i < win[0] || i > win[1]) { onMove(i - span / 2, i + span / 2); drag.current = span / 2 }
        else drag.current = i - win[0]
      }}
      onPointerMove={e => { if (drag.current === null) return; const i = at(e.clientX) - drag.current; onMove(i, i + span) }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <rect x={pad.l} y={0} width={iw} height={H} fill="var(--plane)" />
      <path d={path} fill="none" stroke="var(--ink-mute)" strokeWidth={1} opacity={0.6} />
      <rect x={x(win[0])} y={0.5} width={Math.max(3, x(win[1]) - x(win[0]))} height={H - 1}
        fill="var(--accent)" fillOpacity={0.15} stroke="var(--accent)" strokeWidth={1.2} />
      <text x={w - pad.r + 6} y={H / 2} dominantBaseline="middle" fontSize={10} fill="var(--ink-mute)">전체</text>
    </svg>
  )
}

function niceTicks(min: number, max: number, count: number) {
  const span = max - min
  const raw = span / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(Math.round(v))
  return out
}

function dateTicks(d: string[], i0: number, i1: number, count: number): { i: number; label: string }[] {
  // 양 끝 3% 안쪽 라벨은 잘리므로 뺌. 달 경계가 2개 이상이면 달(YY.MM), 아니면 날짜(MM.DD)
  const span = i1 - i0
  const edge = Math.ceil(span * 0.03)
  const starts: number[] = []
  for (let i = Math.max(1, i0 + edge); i <= i1 - edge; i++) if (d[i].slice(0, 7) !== d[i - 1].slice(0, 7)) starts.push(i)
  if (starts.length >= 2) {
    const step = Math.ceil(starts.length / count)
    return starts.filter((_, k) => k % step === 0).map(i => ({ i, label: d[i].slice(2, 7).replace('-', '.') }))
  }
  const out: { i: number; label: string }[] = []
  const step = Math.max(1, Math.round(span / count))
  for (let i = i0 + edge; i <= i1 - edge; i += step) out.push({ i, label: d[i].slice(5).replace('-', '.') })
  return out
}
