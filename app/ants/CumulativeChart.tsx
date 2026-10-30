'use client'

// 한국 개인투자자 미국주식 누적 순매수 — 순매수가 이어지면 선이 위로 쌓이고, 순매도가 이어지면 내려간다.
//  - 위: 누적선 (선택 기간 시작 = 0), 아래: 그날 순매수 막대
//  - S&P 500 겹쳐보기는 흐리게 (비강조 ≤ 0.1 원칙보다 조금 진하게 — 선이라 너무 흐리면 안 보임)

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chip } from '@/app/components/macro/ui'

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
        </div>
      </div>
      <div className="mt-3">
        <Plot d={view.d} cum={view.cum} net={view.net} px={view.px} />
      </div>
      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
        한국예탁결제원(Seibro) 일별 미국주식 결제 상위 50종목의 순매수 합을 쌓은 값이에요. 선택 기간의 첫날을 0으로 놓고 계산해요.
        날짜는 결제일보다 2영업일 앞선 매매일 기준이에요.
      </p>
    </div>
  )
}

function Plot({ d, cum, net, px }: { d: string[]; cum: number[]; net: number[]; px: (number | null)[] | null }) {
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

  const mobile = w < 640
  const H1 = mobile ? 230 : 320
  const H2 = mobile ? 56 : 72
  const GAP = 10
  const H = H1 + GAP + H2 + 22
  const PAD = { l: 4, r: mobile ? 58 : 72, t: 10 }
  const n = cum.length
  const iw = w - PAD.l - PAD.r
  const x = (i: number) => PAD.l + (n === 1 ? 0 : (i / (n - 1)) * iw)

  const cMin = Math.min(0, ...cum), cMax = Math.max(0, ...cum)
  const cPad = (cMax - cMin) * 0.06 || 1
  const y = (v: number) => PAD.t + (1 - (v - (cMin - cPad)) / (cMax - cMin + 2 * cPad)) * (H1 - PAD.t)

  const nAbs = Math.max(...net.map(Math.abs)) || 1
  const yb0 = H1 + GAP + H2 / 2
  const yb = (v: number) => yb0 - (v / nAbs) * (H2 / 2)
  const bw = Math.max(1, iw / n - (n > 200 ? 0.3 : 1))

  const path = cum.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${path}L${x(n - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`

  let pxPath = ''
  if (px) {
    const vals = px.filter((v): v is number => v !== null)
    if (vals.length > 1) {
      const pMin = Math.min(...vals), pMax = Math.max(...vals), ps = pMax - pMin || 1
      const yp = (v: number) => PAD.t + (1 - (v - pMin) / ps) * (H1 - PAD.t - 8) + 4
      let started = false
      pxPath = px.map((v, i) => {
        if (v === null) return ''
        const s = `${started ? 'L' : 'M'}${x(i).toFixed(1)},${yp(v).toFixed(1)}`
        started = true
        return s
      }).join('')
    }
  }

  const ticks = niceTicks(cMin - cPad, cMax + cPad, mobile ? 4 : 5)
  const xt = monthTicks(d, mobile ? 3 : 6)

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const p = ((e.clientX - r.left) / r.width) * w
    const i = Math.round(((p - PAD.l) / iw) * (n - 1))
    setHi(i >= 0 && i < n ? i : null)
  }

  const tone = (v: number) => (v >= 0 ? 'var(--up-text)' : 'var(--down-text)')

  return (
    <div ref={boxRef} className="relative w-full select-none">
      <svg width="100%" viewBox={`0 0 ${w} ${H}`} style={{ display: 'block', touchAction: 'pan-y' }}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHi(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeDasharray={t === 0 ? undefined : '2 3'} />
            <text x={w - PAD.r + 6} y={y(t)} dominantBaseline="middle" fontSize={10.5} fill="var(--ink-mute)" className="mono">
              {t === 0 ? '0' : `${(t / 1e8).toLocaleString('en-US', { maximumFractionDigits: 0 })}억`}
            </text>
          </g>
        ))}
        {/* 0 기준선은 확실히 */}
        <line x1={PAD.l} x2={w - PAD.r} y1={y(0)} y2={y(0)} stroke="var(--zero-line)" strokeWidth={1.2} />

        {pxPath && <path d={pxPath} fill="none" stroke="var(--ink-mute)" strokeWidth={1.3} opacity={0.45} />}
        <path d={area} fill="var(--accent)" opacity={0.08} />
        <path d={path} fill="none" stroke="var(--ink)" strokeWidth={1.9} strokeLinejoin="round" />
        <circle cx={x(n - 1)} cy={y(cum[n - 1])} r={3.5} fill={tone(cum[n - 1])} />

        {/* 그날 순매수 막대 */}
        <line x1={PAD.l} x2={w - PAD.r} y1={yb0} y2={yb0} stroke="var(--hairline-2)" />
        {net.map((v, i) => (
          <rect key={i} x={x(i) - bw / 2} width={bw} y={v >= 0 ? yb(v) : yb0} height={Math.max(0.5, Math.abs(yb(v) - yb0))}
            fill={tone(v)} opacity={hi === null || hi === i ? 0.85 : 0.35} />
        ))}
        <text x={w - PAD.r + 6} y={yb0} dominantBaseline="middle" fontSize={10} fill="var(--ink-mute)">일별</text>

        {xt.map(i => (
          <text key={i} x={x(i)} y={H - 6} fontSize={10.5} fill="var(--ink-mute)" className="mono" textAnchor="middle">
            {d[i].slice(2, 7).replace('-', '.')}
          </text>
        ))}

        {hi !== null && (
          <g pointerEvents="none">
            <line x1={x(hi)} x2={x(hi)} y1={PAD.t} y2={H1 + GAP + H2} stroke="var(--ink-2)" strokeDasharray="2 2" />
            <circle cx={x(hi)} cy={y(cum[hi])} r={3.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.5} />
          </g>
        )}
      </svg>

      {hi !== null && (
        <div className="absolute top-1 px-2.5 py-1.5 text-[11px] leading-snug pointer-events-none"
          style={{
            left: x(hi) / w > 0.6 ? undefined : `calc(${(x(hi) / w) * 100}% + 10px)`,
            right: x(hi) / w > 0.6 ? `calc(${(1 - x(hi) / w) * 100}% + 10px)` : undefined,
            background: 'var(--surface)', border: '1px solid var(--hairline-2)', color: 'var(--ink)',
          }}>
          <div className="mono font-semibold">{fmtDate(d[hi])}</div>
          <div>누적 <span className="mono font-bold" style={{ color: tone(cum[hi]) }}>{fmtUsd(cum[hi])}</span></div>
          <div>그날 <span className="mono" style={{ color: tone(net[hi]) }}>{fmtUsd(net[hi])}</span></div>
          {px && px[hi] !== null && <div style={{ color: 'var(--ink-mute)' }}>S&amp;P 500 <span className="mono">{px[hi]!.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span></div>}
        </div>
      )}
    </div>
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

function monthTicks(d: string[], count: number) {
  // 양 끝 3% 안쪽 라벨은 잘리므로 뺌
  const edge = Math.ceil(d.length * 0.03)
  const starts: number[] = []
  for (let i = edge; i < d.length - edge; i++) if (d[i].slice(0, 7) !== d[i - 1].slice(0, 7)) starts.push(i)
  if (starts.length <= count) return starts
  const step = Math.ceil(starts.length / count)
  return starts.filter((_, k) => k % step === 0)
}
