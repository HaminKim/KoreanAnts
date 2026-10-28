'use client'

// 시군구·구 드릴다운 — 84㎡ 환산 집값(금액)이 1순위, 그다음 금액 흐름 차트(고점 표시), 변화율·전세가율·거래량은 그 뒤.
// 데이터: public/data/house/local/{시도}.json · geo_{시도}.json (scripts/house/build_local.py · build_local_map.py)

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type LocalData, type LocalGeo, type LocalSummary, type LocalUnit, type PriceTone, type RegionMetric,
  fillOf, fmtRegion, fmtWon, fmtYm, loadLocal, loadLocalGeo, priceStatus, textOn, unpack,
} from '@/app/lib/house'
import { Chip, Sparkline } from '@/app/components/macro/ui'

// ─────────────────────────────────────────
// 지표
// ─────────────────────────────────────────
const P84_DESC = '부동산원 아파트 ㎡당 평균 매매가격 × 84㎡(국민평형)로 환산한 집값이에요. 과거 흐름은 매매가격지수로 거꾸로 계산해서, 표본 개편 때 생기는 끊김이 없어요.'

/** 전국 지도에 끼워 넣는 '집값(84㎡)' 칩 */
export function p84Metric(asOf: string | null): RegionMetric {
  return { id: 'p84', label: '아파트 집값 (84㎡ 환산)', short: '집값(84㎡)', unit: '만원', dec: 0, good: 'none', need: 'RONE', desc: P84_DESC, available: true, asOf }
}

export function localMetrics(asOf: string | null): RegionMetric[] {
  return [
    p84Metric(asOf),
    { id: 'p84_dd', label: '집값 고점 대비', short: '고점 대비', unit: '%', dec: 1, good: 'up', need: 'RONE', available: true, asOf,
      desc: '2003년 이후 가장 비쌌던 달과 비교해 지금 몇 % 아래인지예요. 고점에서 3% 안이면 초록(최고가)으로 칠해요.' },
    { id: 'p84_yoy', label: '집값 1년 변화', short: '1년 변화', unit: '%', dec: 1, good: 'up', need: 'RONE', available: true, asOf,
      desc: '1년 전 같은 달과 비교한 84㎡ 환산 집값 변화예요.' },
    { id: 'jr', label: '전세가율', short: '전세가율', unit: '%', dec: 1, good: 'none', need: 'RONE', available: true, asOf,
      desc: '매매가격 대비 전세가격 비율이에요. 높으면 갭(매매가 − 전세가)이 작아요.' },
    { id: 'vol', label: '아파트 매매 거래량', short: '거래량', unit: '호', dec: 0, good: 'none', need: 'RONE', available: true, asOf,
      desc: '한 달 동안 신고된 아파트 매매 건수예요. 실거래 신고 기한(30일) 때문에 한 달 늦게 나와요.' },
  ]
}

export function localVal(s: LocalSummary | undefined, id: string): number | null {
  if (!s) return null
  const v = id === 'p84' ? s.p84 : id === 'p84_dd' ? s.dd : id === 'p84_yoy' ? s.yoy : id === 'jr' ? s.jr : id === 'vol' ? s.vol : undefined
  return v ?? null
}

// ─────────────────────────────────────────
// 데이터 로딩
// ─────────────────────────────────────────
export function useLocalFile(fid: string | null) {
  const [st, setSt] = useState<{ fid: string; geo: LocalGeo | null; data: LocalData | null; err: boolean } | null>(null)
  useEffect(() => {
    if (!fid) return
    let live = true
    // 다른 지역으로 바뀌면 아래 return 의 fid 비교로 이전 결과를 숨김
    Promise.all([loadLocalGeo(fid), loadLocal(fid)])
      .then(([geo, data]) => { if (live) setSt({ fid, geo, data, err: false }) })
      .catch(() => { if (live) setSt({ fid, geo: null, data: null, err: true }) })
    return () => { live = false }
  }, [fid])
  return st && st.fid === fid ? st : { fid, geo: null, data: null, err: false }
}

/** 지도 단위 → 데이터. 세종처럼 시군구가 하나뿐이면 시도 합계(root)를 씀 */
export function unitData(geo: LocalGeo, data: LocalData, uid: string): LocalUnit | undefined {
  if (data.units[uid]) return data.units[uid]
  const l2 = Object.keys(geo.units).filter(k => geo.units[k].level === 2)
  return l2.length === 1 && l2[0] === uid ? data.units.root : undefined
}

export function childrenOf(geo: LocalGeo, uid: string): string[] {
  return Object.keys(geo.units).filter(k => geo.units[k].parent === uid)
}

// ─────────────────────────────────────────
// 시군구 지도
// ─────────────────────────────────────────
export function LocalMap({ geo, data, parent, metric, focus, onHover, onPick, onZoom }: {
  geo: LocalGeo; data: LocalData; parent: string | null; metric: RegionMetric; focus: string | null
  onHover: (uid: string | null) => void; onPick: (uid: string) => void; onZoom: (uid: string) => void
}) {
  const units = geo.units
  const ids = useMemo(
    () => Object.keys(units).filter(k => (parent ? units[k].parent === parent : units[k].level === 2) && units[k].d),
    [units, parent],
  )
  const ctx = parent ? Object.keys(units).filter(k => units[k].level === 2 && k !== parent && units[k].d) : []
  const vals = ids.map(k => localVal(unitData(geo, data, k)?.sum, metric.id)).filter((v): v is number => v !== null)

  // 확대: 상위 단위 bbox 를 기본 지도와 같은 비율로 넓혀서 화면 높이가 튀지 않게
  const [, , bw, bh] = geo.viewBox
  let vb = geo.viewBox as number[]
  if (parent && units[parent]) {
    const [x, y, w0, h0] = units[parent].bbox
    let w = w0 * 1.16, h = h0 * 1.16
    if (w / h > bw / bh) h = w * bh / bw
    else w = h * bw / bh
    vb = [x + w0 / 2 - w / 2, y + h0 / 2 - h / 2, w, h]
  }
  const k = vb[2] / bw   // 글자 크기 보정
  const fs = 10 * k

  return (
    <svg viewBox={vb.map(n => n.toFixed(1)).join(' ')} className="block w-full h-auto select-none" style={{ maxHeight: 640 }}
      role="img" aria-label={`${geo.ko} 시군구 지도`} onMouseLeave={() => onHover(null)}>
      {ctx.map(id => (
        <path key={id} d={units[id].d} fill="var(--neu)" opacity={0.45} stroke="var(--surface)" strokeWidth={0.6}
          vectorEffect="non-scaling-stroke" pointerEvents="none" />
      ))}
      {ids.map(id => {
        const v = localVal(unitData(geo, data, id)?.sum, metric.id)
        return (
          <path key={id} d={units[id].d} fill={fillOf(metric, v, vals)}
            stroke="var(--surface)" strokeWidth={0.7} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
            style={{ cursor: 'pointer', transition: 'fill .2s' }}
            onMouseEnter={() => onHover(id)}
            onClick={() => onPick(id)}
            onDoubleClick={() => { if (!parent && childrenOf(geo, id).length) onZoom(id) }} />
        )
      })}
      {focus && units[focus] && ids.includes(focus) && (
        <path d={units[focus].d} fill="none" stroke="var(--ink)" strokeWidth={1.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />
      )}
      {ids.map(id => {
        const u = units[id]
        const v = localVal(unitData(geo, data, id)?.sum, metric.id)
        const fill = fillOf(metric, v, vals)
        const [, , w, h] = u.bbox
        const name = u.name.replace(/\(.*\)$/, '')   // '신제주(노형·연동)' → '신제주'
        // 칸보다 긴 글자는 생략 (마우스를 올리면 툴팁으로 보임)
        const showName = name.length * fs * 0.95 <= w * 1.15 && h >= fs * 1.2
        const showVal = showName && v !== null && h >= fs * 2.6 && w >= fs * 3.2
        if (!showName) return null
        return (
          <g key={id} pointerEvents="none" transform={`translate(${u.label[0]},${u.label[1] - (showVal ? fs * 0.45 : 0)})`}>
            <text textAnchor="middle" dominantBaseline="middle" fontSize={fs} fontWeight={700} fill={textOn(fill)}>{name}</text>
            {showVal && (
              <text y={fs * 1.15} textAnchor="middle" dominantBaseline="middle" fontSize={fs * 0.9} className="mono" fill={textOn(fill)}>
                {fmtRegion(metric, v)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** 시군구 마우스오버 툴팁 */
export function LocalTip({ name, unit, metrics, metric, style, area = false }: {
  name: string; unit: LocalUnit | undefined; metrics: RegionMetric[]; metric: RegionMetric; style: React.CSSProperties; area?: boolean
}) {
  const st = unit ? priceStatus(unit.sum) : null
  return (
    <div className="pointer-events-none absolute z-20 w-[220px] p-2.5 text-[11px]"
      style={{ ...style, background: 'var(--surface)', border: '1px solid var(--ink)', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{name}</span>
        {st && <StatusBadge tone={st.tone} label={st.label} small />}
      </div>
      <table className="mt-1.5 w-full">
        <tbody>
          {metrics.map(m => {
            const v = localVal(unit?.sum, m.id)
            return (
              <tr key={m.id} style={{ color: m.id === metric.id ? 'var(--ink)' : 'var(--ink-2)', fontWeight: m.id === metric.id ? 700 : 400 }}>
                <td className="py-0.5 pr-2">{m.short}</td>
                <td className="py-0.5 text-right mono">{v !== null ? fmtRegion(m, v) : <span style={{ color: 'var(--ink-mute)' }}>–</span>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {(area || (unit && unit.sum.p84 === undefined)) && (
        <div className="mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-mute)' }}>
          {area ? '생활권 집값은 국토부 실거래가 연결 후 채워져요' : '부동산원 가격 표본이 없는 지역이라 집값은 없어요'}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 집값 상세 (상태 → 금액 흐름 → 변화율·전세가율·거래량)
// ─────────────────────────────────────────
const TONE: Record<PriceTone, { bg: string; fg: string }> = {
  peak: { bg: 'var(--up-text)', fg: '#fff' },
  down: { bg: 'var(--down-text)', fg: '#fff' },
  off: { bg: 'transparent', fg: 'var(--ink)' },
}

export function StatusBadge({ tone, label, small = false }: { tone: PriceTone; label: string; small?: boolean }) {
  const t = TONE[tone]
  return (
    <span className={`inline-block font-bold whitespace-nowrap ${small ? 'px-1 text-[10px]' : 'px-1.5 py-0.5 text-[11px]'}`}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${tone === 'off' ? 'var(--ink)' : t.bg}` }}>
      {label}
    </span>
  )
}

export function PriceBlock({ sum, unit, sqm, loading = false }: {
  sum: LocalSummary | undefined; unit: LocalUnit | undefined; sqm: number; loading?: boolean
}) {
  const s = unit?.sum ?? sum ?? {}
  const st = priceStatus(s)
  const flow = useMemo(() => unpack(unit?.p84), [unit])
  const idx = useMemo(() => unpack(unit?.idx), [unit])
  const jr = useMemo(() => unpack(unit?.jr).slice(-120), [unit])
  const vol = useMemo(() => unpack(unit?.vol).slice(-120), [unit])
  const sign = (v: number) => (v > 0 ? '+' : '')

  return (
    <div>
      {/* 1. 지금 집값 + 상태 */}
      {s.p84 !== undefined ? (
        <div>
          <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>아파트 {sqm}㎡ 환산 집값 · {fmtYm(s.date)}</div>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            <span className="mono text-2xl font-bold" style={{ color: 'var(--ink)' }}>{fmtWon(s.p84)}</span>
            {st && <StatusBadge tone={st.tone} label={st.label} />}
          </div>
          {st?.sub && <div className="mt-0.5 text-[11px] mono" style={{ color: 'var(--ink-2)' }}>{st.sub}</div>}
        </div>
      ) : (
        <div className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          {loading ? '집값 불러오는 중…' : '부동산원 가격 표본이 없는 지역이라 집값은 없어요. 거래량은 아래에서 볼 수 있어요.'}
        </div>
      )}

      {/* 2. 금액 흐름 */}
      {flow.length > 1 ? (
        <PriceChart data={flow} fmt={fmtWon} peakLabel="최고" note={unit?.how === 'avg' ? '평균가격 그대로 이어 그림 — 표본 개편 시점에 끊김이 있을 수 있어요' : null} />
      ) : idx.length > 1 ? (
        <PriceChart data={idx} fmt={v => v.toFixed(1)} peakLabel="최고" note="가격 표본이 없어 매매가격지수로 흐름만 보여 드려요" />
      ) : loading ? (
        <div className="mt-3 h-[180px] flex items-center justify-center text-[11px]" style={{ background: 'var(--plane)', color: 'var(--ink-mute)' }}>
          차트 불러오는 중…
        </div>
      ) : null}

      {/* 3. 변화율 · 전세가율 · 거래량 */}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Stat label="1년 변화" value={s.yoy !== undefined && s.yoy !== null ? `${sign(s.yoy)}${s.yoy.toFixed(1)}%` : '–'}
          tone={s.yoy} sub={s.p84y ? `1년 전 ${fmtWon(s.p84y)}` : null} />
        <Stat label="한 달 변화" value={s.mom !== undefined ? `${sign(s.mom)}${s.mom.toFixed(2)}%` : '–'} tone={s.mom}
          sub={s.trend === 'down' ? '3개월 연속 하락' : s.trend === 'up' ? '3개월 연속 상승' : null} />
        <Stat label="전세가율" value={s.jr !== undefined ? `${s.jr.toFixed(1)}%` : '–'}
          sub={s.jr !== undefined && s.p84 !== undefined ? `갭 약 ${fmtWon(s.p84 * (1 - s.jr / 100))}` : null} spark={jr} />
        <Stat label={`거래량${s.volDate ? ` · ${fmtYm(s.volDate)}` : ''}`} value={s.vol !== undefined ? `${s.vol.toLocaleString('ko-KR')}호` : '–'}
          sub={s.volYoy !== undefined && s.volYoy !== null ? `1년 전보다 ${sign(s.volYoy)}${s.volYoy}%` : null} spark={vol} />
      </div>
      {unit?.med !== undefined && (
        <div className="mt-1.5 text-[10px]" style={{ color: 'var(--ink-mute)' }}>
          참고: 면적 상관없이 거래된 아파트 중위 매매가격 {fmtWon(unit.med)}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, sub, tone, spark }: {
  label: string; value: string; sub: string | null; tone?: number | null; spark?: [string, number][]
}) {
  const color = tone === undefined || tone === null || tone === 0 ? 'var(--ink)' : tone > 0 ? 'var(--up-text)' : 'var(--down-text)'
  return (
    <div className="p-2" style={{ border: '1px solid var(--hairline)' }}>
      <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{label}</div>
      <div className="mono text-sm font-bold" style={{ color }}>{value}</div>
      {sub && <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{sub}</div>}
      {spark && spark.length > 1 && <div className="mt-1"><Sparkline data={spark} height={22} /></div>}
    </div>
  )
}

// ─────────────────────────────────────────
// 금액 흐름 차트 (고점 표시 · 마우스 올리면 그 달 값)
// ─────────────────────────────────────────
const RANGES: { label: string; years: number | null }[] = [{ label: '5Y', years: 5 }, { label: '10Y', years: 10 }, { label: '전체', years: null }]

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

const pctTxt = (r: number) => `${r > 0 ? '+' : ''}${(r * 100).toFixed(1)}%`

function niceStep(span: number, n: number) {
  const raw = span / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}

export function PriceChart({ data, fmt, peakLabel, note, height = 180 }: {
  data: [string, number][]; fmt: (v: number) => string; peakLabel: string; note: string | null; height?: number
}) {
  const [years, setYears] = useState<number | null>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [ref, W] = useWidth<HTMLDivElement>()

  const pts = useMemo(() => {
    if (!years) return data
    const last = data[data.length - 1][0]
    const from = `${Number(last.slice(0, 4)) - years}${last.slice(4)}`
    return data.filter(d => d[0] >= from)
  }, [data, years])

  const L = 44, R = 12, T = 16, B = 18
  const iw = Math.max(10, W - L - R), ih = height - T - B
  const vs = pts.map(p => p[1])
  const lo0 = Math.min(...vs), hi0 = Math.max(...vs)
  const padv = (hi0 - lo0) * 0.08 || hi0 * 0.05 || 1
  const step = niceStep(hi0 - lo0 + 2 * padv, 4)
  const lo = Math.floor((lo0 - padv) / step) * step, hi = Math.ceil((hi0 + padv) / step) * step
  const x = (i: number) => L + (pts.length > 1 ? (i / (pts.length - 1)) * iw : iw / 2)
  const y = (v: number) => T + ih - ((v - lo) / (hi - lo || 1)) * ih
  const ticks: number[] = []
  for (let v = lo; v <= hi + step * 1e-6; v += step) ticks.push(v)

  const yrs = [...new Set(pts.map(p => p[0].slice(0, 4)))]
  const ys = Math.max(1, Math.ceil(yrs.length / Math.max(2, Math.floor(iw / 56))))
  const xticks = pts.map((p, i) => [p[0], i] as const).filter(([d]) => d.endsWith('-01') && Number(d.slice(0, 4)) % ys === 0)

  const pk = vs.indexOf(hi0)
  const lastI = pts.length - 1
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const area = `${path}L${x(lastI).toFixed(1)},${T + ih}L${x(0).toFixed(1)},${T + ih}Z`
  const peakTxt = `${peakLabel} ${fmt(hi0)} (${fmtYm(pts[pk]?.[0])})`
  const nearPeak = x(pk) + 6 + peakTxt.length * 6.2 > L + iw   // 라벨이 오른쪽으로 넘치면 왼쪽으로
  const h = hover !== null ? pts[hover] : null

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left - L) / iw) * lastI)
    setHover(Math.max(0, Math.min(lastI, i)))
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>집값 흐름</span>
        <span className="flex gap-1">
          {RANGES.map(r => <Chip key={r.label} on={years === r.years} onClick={() => setYears(r.years)} className="!px-1.5 !py-0.5 !text-[10px]">{r.label}</Chip>)}
        </span>
      </div>
      <div ref={ref} className="mt-1 relative" style={{ height }}>
        {W > 0 && pts.length > 1 && (
          <svg width={W} height={height} className="block touch-none select-none"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
            {ticks.map(v => (
              <g key={v}>
                <line x1={L} x2={L + iw} y1={y(v)} y2={y(v)} stroke="var(--hairline)" strokeWidth={1} />
                <text x={L - 5} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={9.5} className="mono" fill="var(--ink-mute)">{fmt(v)}</text>
              </g>
            ))}
            {xticks.map(([d, i]) => (
              <text key={d} x={x(i)} y={height - 4} textAnchor="middle" fontSize={9.5} className="mono" fill="var(--ink-mute)">{d.slice(0, 4)}</text>
            ))}
            <path d={area} fill="var(--accent)" opacity={0.07} />
            {/* 고점 기준선 — 지금 값과 비교하기 쉽게 */}
            <line x1={x(pk)} x2={L + iw} y1={y(hi0)} y2={y(hi0)} stroke="var(--ink)" strokeWidth={1} strokeDasharray="3 3" opacity={0.55} />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.8} strokeLinejoin="round" />
            <circle cx={x(pk)} cy={y(hi0)} r={3.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.6} />
            <text x={x(pk) + (nearPeak ? -6 : 6)} y={y(hi0) - 7} textAnchor={nearPeak ? 'end' : 'start'} fontSize={10} fontWeight={700} fill="var(--ink)">
              {peakTxt}
            </text>
            {pk !== lastI && <circle cx={x(lastI)} cy={y(pts[lastI][1])} r={3.5} fill="var(--accent)" />}
            {h && hover !== null && (
              <g pointerEvents="none">
                <line x1={x(hover)} x2={x(hover)} y1={T} y2={T + ih} stroke="var(--ink-mute)" strokeWidth={1} />
                <circle cx={x(hover)} cy={y(h[1])} r={3} fill="var(--ink)" />
              </g>
            )}
          </svg>
        )}
        {h && (
          <div className="pointer-events-none absolute top-0 px-1.5 py-0.5 text-[10px] mono"
            style={{ left: L + 4, background: 'var(--surface)', border: '1px solid var(--ink)', color: 'var(--ink)' }}>
            {fmtYm(h[0])} · <b>{fmt(h[1])}</b>
            {hover !== lastI && <> · 그때 대비 지금 {pctTxt(pts[lastI][1] / h[1] - 1)}</>}
          </div>
        )}
      </div>
      {note && <div className="mt-0.5 text-[10px]" style={{ color: 'var(--ink-mute)' }}>{note}</div>}
    </div>
  )
}
