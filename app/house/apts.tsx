'use client'

// 수도권 단지별 지도 — 구(생활권) 안의 행정동 + 아파트 단지. 멀리서는 동 요약, 확대할수록 단지 시세·이름까지.
// 동은 누르는 단위가 아니라 배경 (사용자 결정). 데이터: public/data/house/apt/{단위}.json · {단위}_h.json (scripts/house/build_apts.py)

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Apt, type AptFile, type AptHist, type AptSum, type PriceTone, type RegionMetric,
  fillOf, fmtRegion, fmtWon, fmtYm, loadApt, loadAptHist, textOn,
} from '@/app/lib/house'
import { PriceChart, StatusBadge } from './local'

const HOW = '직전 12개월 실거래 ㎡당 가격 중앙값 × 84㎡ (전용 30~200㎡, 3건 이상일 때)'

export function aptMetrics(asOf: string | null): RegionMetric[] {
  return [
    { id: 'p84', label: '단지 시세 (84㎡ 환산)', short: '시세(84㎡)', unit: '만원', dec: 0, good: 'none', need: 'RONE', available: true, asOf,
      desc: `국토부 실거래가로 계산한 단지 시세예요. ${HOW}. 동 색은 그 동 전체 거래로 같은 방식으로 계산했어요.` },
    { id: 'p84_dd', label: '고점 대비', short: '고점 대비', unit: '%', dec: 1, good: 'up', need: 'RONE', available: true, asOf,
      desc: '2006년 이후 가장 비쌌던 때(분기별 시세)와 비교해 지금 몇 % 아래인지예요. 3% 안이면 초록(최고가).' },
    { id: 'p84_yoy', label: '1년 변화', short: '1년 변화', unit: '%', dec: 1, good: 'up', need: 'RONE', available: true, asOf,
      desc: '1년 전 같은 달의 시세(직전 12개월 중앙값)와 비교한 변화예요.' },
  ]
}

const val = (s: AptSum | undefined, id: string): number | null => {
  if (!s) return null
  const v = id === 'p84' ? s.p : id === 'p84_dd' ? s.dd : s.yoy
  return v ?? null
}

export function aptStatus(s: AptSum): { tone: PriceTone; label: string; sub: string | null } | null {
  if (s.p === undefined || s.dd === undefined) return null
  const peak = s.pk !== undefined ? `고점 ${fmtWon(s.pk)} (${fmtYm(s.pd)})` : null
  if (s.dd > -3) return { tone: 'peak', label: '최고가', sub: s.dd < -0.05 ? `고점 대비 ${s.dd.toFixed(1)}% · ${peak}` : null }
  if (s.down) return { tone: 'down', label: '하락 중', sub: `고점 대비 ${s.dd.toFixed(1)}% · ${peak}` }
  return { tone: 'off', label: `고점 대비 ${s.dd.toFixed(1)}%`, sub: peak }
}

export function useAptFile(uid: string | null) {
  const [st, setSt] = useState<{ uid: string; file: AptFile | null; err: boolean } | null>(null)
  useEffect(() => {
    if (!uid) return
    let live = true
    loadApt(uid).then(file => { if (live) setSt({ uid, file, err: false }) }).catch(() => { if (live) setSt({ uid, file: null, err: true }) })
    return () => { live = false }
  }, [uid])
  return st && st.uid === uid ? st : { uid, file: null, err: false }
}

// ─────────────────────────────────────────
// 지도 (휠·드래그·핀치로 확대/이동)
// ─────────────────────────────────────────
type T = { k: number; x: number; y: number }
const K_MAX = 40
const Z_PRICE = 1.8   // 이보다 확대하면 단지에 시세 표시
const Z_NAME = 4      // 이보다 확대하면 단지 이름까지

function clampT(t: T, W: number, H: number): T {
  const k = Math.min(K_MAX, Math.max(1, t.k))
  return { k, x: Math.min(0, Math.max(W * (1 - k), t.x)), y: Math.min(0, Math.max(H * (1 - k), t.y)) }
}

export function AptMap({ file, metric, selected, focusReq, onPick }: {
  file: AptFile; metric: RegionMetric; selected: string | null
  focusReq: { seq: string; n: number } | null   // 목록에서 고른 단지로 이동
  onPick: (seq: string | null) => void
}) {
  const [, , W, H] = file.viewBox
  const [t, setT] = useState<T>({ k: 1, x: 0, y: 0 })
  const [hover, setHover] = useState<{ a: Apt; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ pts: Map<number, { x: number; y: number }>; moved: boolean; start: T; d0: number; c0: { x: number; y: number } } | null>(null)

  // 화면 좌표 → viewBox 좌표
  const toVb = (cx: number, cy: number) => {
    const m = svgRef.current?.getScreenCTM()
    if (!m) return { x: 0, y: 0 }
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse())
    return { x: p.x, y: p.y }
  }
  const zoomAt = (p: { x: number; y: number }, f: number, base: T) => {
    const k = Math.min(K_MAX, Math.max(1, base.k * f))
    return clampT({ k, x: p.x - (p.x - base.x) * (k / base.k), y: p.y - (p.y - base.y) * (k / base.k) }, W, H)
  }

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const p = toVb(e.clientX, e.clientY)
      setT(cur => zoomAt(p, Math.exp(-e.deltaY * 0.0018), cur))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [W, H])

  useEffect(() => {
    if (!focusReq) return
    const a = file.apts.find(x => x.i === focusReq.seq)
    if (!a) return
    setT(cur => {
      const k = Math.max(cur.k, Z_NAME + 1)
      return clampT({ k, x: W / 2 - a.x * k, y: H / 2 - a.y * k }, W, H)
    })
  }, [focusReq, file, W, H])

  const onDown = (e: React.PointerEvent) => {
    const d = drag.current ?? { pts: new Map(), moved: false, start: t, d0: 0, c0: { x: 0, y: 0 } }
    d.pts.set(e.pointerId, toVb(e.clientX, e.clientY))
    d.start = t
    d.moved = d.pts.size > 1
    if (d.pts.size === 2) {
      const [a, b] = [...d.pts.values()]
      d.d0 = Math.hypot(a.x - b.x, a.y - b.y)
      d.c0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    }
    drag.current = d
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !d.pts.has(e.pointerId)) return
    const p = toVb(e.clientX, e.clientY)
    if (d.pts.size === 1) {
      const p0 = d.pts.get(e.pointerId)!
      const dx = p.x - p0.x, dy = p.y - p0.y
      if (!d.moved && Math.hypot(dx, dy) > 3) {
        d.moved = true
        // 드래그가 시작된 뒤에만 잡음 (처음부터 잡으면 단지 점 클릭이 지도로 감)
        svgRef.current?.setPointerCapture?.(e.pointerId)
      }
      if (d.moved) setT(clampT({ ...d.start, x: d.start.x + dx, y: d.start.y + dy }, W, H))
    } else if (d.pts.size === 2) {
      const other = [...d.pts.entries()].find(([id]) => id !== e.pointerId)![1]
      const dist = Math.hypot(p.x - other.x, p.y - other.y)
      if (d.d0 > 0) setT(zoomAt(d.c0, dist / d.d0, d.start))
    }
  }
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    d.pts.delete(e.pointerId)
    if (!d.pts.size) setTimeout(() => { drag.current = null }, 0)
  }
  const clickable = () => !drag.current?.moved

  const dongVals = useMemo(() => file.dongs.map(d => val(d, metric.id)).filter((v): v is number => v !== null), [file, metric])
  const aptVals = useMemo(() => file.apts.map(a => val(a, metric.id)).filter((v): v is number => v !== null), [file, metric])

  // 화면에 보이는 단지 + 겹치지 않는 라벨 (거래 많은 단지 먼저, 고른 단지는 항상)
  const { dots, labels } = useMemo(() => {
    const sx = (x: number) => x * t.k + t.x, sy = (y: number) => y * t.k + t.y
    const vis = file.apts.filter(a => { const x = sx(a.x), y = sy(a.y); return x > -20 && x < W + 20 && y > -20 && y < H + 20 })
    const out: { a: Apt; x: number; y: number; w: number; h: number; two: boolean }[] = []
    if (t.k >= Z_PRICE) {
      const boxes: [number, number, number, number][] = []
      const order = [...vis].sort((a, b) => (b.i === selected ? 1 : 0) - (a.i === selected ? 1 : 0) || b.c - a.c)
      const two = t.k >= Z_NAME
      for (const a of order) {
        const price = a.p !== undefined ? fmtWon(a.p) : `${fmtWon(a.t[2])}*`
        const name = a.n.length > 9 ? a.n.slice(0, 8) + '…' : a.n
        const w = Math.max(price.length * 6 + 8, two ? name.length * 9.2 + 8 : 0)
        const h = two ? 26 : 14
        const x = sx(a.x) + 5, y = sy(a.y) - h / 2
        if (out.length > 160 && a.i !== selected) break
        if (a.i !== selected && boxes.some(([bx, by, bw, bh]) => x < bx + bw && x + w > bx && y < by + bh && y + h > by)) continue
        boxes.push([x, y, w, h])
        out.push({ a, x, y, w, h, two })
      }
    }
    return { dots: vis, labels: out }
  }, [file, t, W, H, selected])

  const r = t.k < Z_PRICE ? 2 : t.k < Z_NAME ? 3 : 4
  const sel = selected ? file.apts.find(a => a.i === selected) : undefined

  return (
    <div ref={boxRef} className="relative">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block w-full h-auto select-none touch-none"
        style={{ maxHeight: 640, cursor: drag.current?.moved ? 'grabbing' : 'grab' }}
        role="img" aria-label={`${file.full} 단지 지도`}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        onClick={() => { if (clickable()) onPick(null) }}
        onDoubleClick={e => { const p = toVb(e.clientX, e.clientY); setT(cur => zoomAt(p, 2, cur)) }}>
        <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
          {file.dongs.map((d, i) => {
            const fill = fillOf(metric, val(d, metric.id), dongVals)
            return (
              <path key={i} d={d.d} fill={fill} fillOpacity={t.k < Z_PRICE ? 1 : 0.35}
                stroke="var(--surface)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
            )
          })}
          <path d={file.outline} fill="none" stroke="var(--ink)" strokeWidth={1.2} vectorEffect="non-scaling-stroke" pointerEvents="none" />
        </g>

        {/* 동 이름 (멀리서는 시세까지, 확대하면 흐리게 배경으로) */}
        {file.dongs.map((d, i) => {
          const x = d.l[0] * t.k + t.x, y = d.l[1] * t.k + t.y
          if (x < -40 || x > W + 40 || y < -20 || y > H + 20) return null
          const size = Math.sqrt(d.a) * t.k
          const fs = 11
          if (size < d.n.length * fs * 0.8) return null
          const far = t.k < Z_PRICE
          const fill = fillOf(metric, val(d, metric.id), dongVals)
          const v = val(d, metric.id)
          return (
            <g key={i} pointerEvents="none" transform={`translate(${x},${y})`} opacity={far ? 1 : 0.45}>
              <text textAnchor="middle" y={far && v !== null ? -5 : 0} dominantBaseline="middle" fontSize={fs} fontWeight={700}
                fill={far ? textOn(fill) : 'var(--ink-2)'}>{d.n}</text>
              {far && v !== null && size > 46 && (
                <text textAnchor="middle" y={9} dominantBaseline="middle" fontSize={10} className="mono" fill={textOn(fill)}>{fmtRegion(metric, v)}</text>
              )}
            </g>
          )
        })}

        {/* 단지 점 */}
        {dots.map(a => {
          const fill = fillOf(metric, val(a, metric.id), aptVals)
          return (
            <circle key={a.i} cx={a.x * t.k + t.x} cy={a.y * t.k + t.y} r={a.i === selected ? r + 2 : r}
              fill={a.p === undefined ? 'var(--surface)' : fill} stroke={a.i === selected ? 'var(--ink)' : 'var(--ink-2)'}
              strokeWidth={a.i === selected ? 2 : 0.8} strokeDasharray={a.ap ? '1.5 1' : undefined}
              style={{ cursor: 'pointer' }}
              onPointerEnter={e => { const b = boxRef.current?.getBoundingClientRect(); if (b) setHover({ a, x: e.clientX - b.left, y: e.clientY - b.top }) }}
              onPointerLeave={() => setHover(null)}
              onClick={e => { e.stopPropagation(); if (clickable()) onPick(a.i) }} />
          )
        })}

        {/* 단지 라벨 */}
        {labels.map(({ a, x, y, w, h, two }) => {
          const v = val(a, metric.id)
          const price = a.p !== undefined ? fmtWon(a.p) : `${fmtWon(a.t[2])}*`
          const on = a.i === selected
          return (
            <g key={a.i} transform={`translate(${x},${y})`} style={{ cursor: 'pointer' }}
              onClick={e => { e.stopPropagation(); if (clickable()) onPick(a.i) }}>
              <rect width={w} height={h} fill="var(--surface)" stroke={on ? 'var(--ink)' : 'var(--hairline-2)'} strokeWidth={on ? 1.5 : 1} opacity={0.94} />
              {two && <text x={4} y={9} dominantBaseline="middle" fontSize={10} fontWeight={700} fill="var(--ink)">{a.n.length > 9 ? a.n.slice(0, 8) + '…' : a.n}</text>}
              <text x={4} y={two ? 20 : 7.5} dominantBaseline="middle" fontSize={9.5} className="mono" fill="var(--ink)">
                <tspan fontWeight={700}>{price}</tspan>
                {two && metric.id !== 'p84' && v !== null && (
                  <tspan dx={4} fill={v >= 0 || (metric.id === 'p84_dd' && v > -3) ? 'var(--up-text)' : 'var(--down-text)'}>{fmtRegion(metric, v)}</tspan>
                )}
              </text>
            </g>
          )
        })}
        {sel && t.k < Z_PRICE && (
          <circle cx={sel.x * t.k + t.x} cy={sel.y * t.k + t.y} r={9} fill="none" stroke="var(--ink)" strokeWidth={1.5} pointerEvents="none" />
        )}
      </svg>

      {/* 확대·축소 버튼 */}
      <div className="absolute right-2 top-2 flex flex-col" style={{ border: '1px solid var(--hairline-2)', background: 'var(--surface)' }}>
        {([['+', 2], ['−', 0.5]] as const).map(([s, f]) => (
          <button key={s} type="button" className="w-7 h-7 text-sm font-bold" style={{ color: 'var(--ink)' }} aria-label={f > 1 ? '확대' : '축소'}
            onClick={() => setT(cur => zoomAt({ x: W / 2, y: H / 2 }, f, cur))}>{s}</button>
        ))}
        <button type="button" className="w-7 h-7 text-[10px]" style={{ color: 'var(--ink-mute)', borderTop: '1px solid var(--hairline)' }}
          aria-label="처음 크기로" onClick={() => setT({ k: 1, x: 0, y: 0 })}>⤢</button>
      </div>
      <div className="absolute left-2 bottom-2 px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)', color: 'var(--ink-mute)' }}>
        {t.k < Z_PRICE ? '확대하면 단지 시세가 보여요' : t.k < Z_NAME ? '더 확대하면 단지 이름까지' : '* 시세 없는 단지는 마지막 거래가'}
      </div>

      {hover && !drag.current && (
        <div className="pointer-events-none absolute z-20 w-[210px] p-2 text-[11px]"
          style={{ left: Math.min(hover.x + 12, (boxRef.current?.clientWidth ?? 400) - 220), top: hover.y + 12,
            background: 'var(--surface)', border: '1px solid var(--ink)', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
          <AptLine a={hover.a} dong={file.dongs[hover.a.g]?.n} />
        </div>
      )}
    </div>
  )
}

function AptLine({ a, dong }: { a: Apt; dong?: string }) {
  const st = aptStatus(a)
  return (
    <div>
      <div className="flex items-center justify-between gap-1">
        <b style={{ color: 'var(--ink)' }}>{a.n}</b>
        {st && <StatusBadge tone={st.tone} label={st.label} small />}
      </div>
      <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{dong}{a.b ? ` · ${a.b}년 준공` : ''}</div>
      <div className="mt-1 mono" style={{ color: 'var(--ink)' }}>
        {a.p !== undefined ? <>84㎡ 시세 <b>{fmtWon(a.p)}</b>{a.yoy !== undefined && <> · 1년 {a.yoy > 0 ? '+' : ''}{a.yoy.toFixed(1)}%</>}</> : '거래가 적어 시세 없음'}
      </div>
      <div className="text-[10px] mono" style={{ color: 'var(--ink-2)' }}>
        마지막 거래 {fmtYm(a.t[0])} · {a.t[1]}㎡ {a.t[3]}층 · {fmtWon(a.t[2])}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 오른쪽: 단지 목록 / 단지 상세
// ─────────────────────────────────────────
export function AptList({ file, metric, onPick }: { file: AptFile; metric: RegionMetric; onPick: (seq: string) => void }) {
  const [q, setQ] = useState('')
  const [dong, setDong] = useState<number | null>(null)
  const rows = useMemo(() => {
    const s = q.trim()
    return file.apts
      .filter(a => (dong === null || a.g === dong) && (!s || a.n.includes(s)))
      .sort((a, b) => (val(b, metric.id) ?? -Infinity) - (val(a, metric.id) ?? -Infinity) || b.c - a.c)
  }, [file, metric, q, dong])
  const vals = file.apts.map(a => val(a, metric.id)).filter((v): v is number => v !== null)
  const st = aptStatus(file.sum)
  const dongs = file.dongs.map((d, i) => [d, i] as const).filter(([d]) => file.apts.some(a => file.dongs[a.g] === d))

  return (
    <div>
      <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{file.full} 단지 {file.apts.length}곳</div>
      <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>
        실거래 기준 {fmtYm(file.asOf)} · 최근 5년 안에 거래된 아파트 · 단지를 누르면 시세 흐름과 거래 내역이 보여요
      </div>
      {file.sum.p !== undefined && (
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
          <span style={{ color: 'var(--ink-mute)' }}>{file.name} 전체 84㎡ 시세</span>
          <b className="mono" style={{ color: 'var(--ink)' }}>{fmtWon(file.sum.p)}</b>
          {st && <StatusBadge tone={st.tone} label={st.label} small />}
        </div>
      )}
      <div className="mt-2 flex gap-1.5">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="단지 이름 검색"
          className="flex-1 min-w-0 px-2 py-1 text-[11px]" style={{ border: '1px solid var(--hairline-2)', background: 'var(--surface)', color: 'var(--ink)' }} />
        <select value={dong ?? ''} onChange={e => setDong(e.target.value === '' ? null : Number(e.target.value))}
          className="px-1 py-1 text-[11px] max-w-[45%]" style={{ border: '1px solid var(--hairline-2)', background: 'var(--surface)', color: 'var(--ink)' }}>
          <option value="">모든 동</option>
          {dongs.map(([d, i]) => <option key={i} value={i}>{d.n}</option>)}
        </select>
      </div>
      <ul className="mt-2 max-h-[520px] overflow-y-auto">
        {rows.map(a => {
          const v = val(a, metric.id)
          return (
            <li key={a.i} onClick={() => onPick(a.i)} className="flex items-center gap-2 py-1 cursor-pointer text-[11px]"
              style={{ borderBottom: '1px solid var(--hairline)' }}>
              <span className="w-2.5 h-2.5 shrink-0" style={{ background: v === null ? 'var(--neu)' : fillOf(metric, v, vals) }} />
              <span className="flex-1 min-w-0">
                <span className="block truncate font-semibold" style={{ color: 'var(--ink)' }}>{a.n}</span>
                <span className="block text-[10px]" style={{ color: 'var(--ink-mute)' }}>{file.dongs[a.g]?.n}{a.b ? ` · ${a.b}년` : ''} · 1년 {a.c}건</span>
              </span>
              <span className="mono text-right shrink-0" style={{ color: v === null ? 'var(--ink-mute)' : 'var(--ink)' }}>
                {v !== null ? fmtRegion(metric, v) : '–'}
              </span>
            </li>
          )
        })}
        {!rows.length && <li className="py-6 text-center text-[11px]" style={{ color: 'var(--ink-mute)' }}>맞는 단지가 없어요</li>}
      </ul>
    </div>
  )
}

export function AptDetail({ file, seq, onClose }: { file: AptFile; seq: string; onClose: () => void }) {
  const a = file.apts.find(x => x.i === seq)
  const [hist, setHist] = useState<{ uid: string; h: AptHist | null } | null>(null)
  useEffect(() => {
    let live = true
    loadAptHist(file.id).then(h => { if (live) setHist({ uid: file.id, h }) }).catch(() => { if (live) setHist({ uid: file.id, h: null }) })
    return () => { live = false }
  }, [file.id])
  const h = hist?.uid === file.id ? hist.h?.apts[seq] : undefined
  const flow = useMemo<[string, number][]>(() => {
    if (!h || !hist?.h) return []
    return h.v.map((v, i) => [hist.h!.q[h.s + i], v] as [string, number | null]).filter((p): p is [string, number] => p[1] !== null)
  }, [h, hist])
  if (!a) return null
  const st = aptStatus(a)

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{a.n}</div>
          <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>
            {file.full} {file.dongs[a.g]?.n}{a.b ? ` · ${a.b}년 준공` : ''}{a.ap ? ' · 지도 위치는 대략' : ''}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] px-1 shrink-0" style={{ color: 'var(--ink-mute)' }}>목록 ✕</button>
      </div>

      <div className="mt-3">
        <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>84㎡ 환산 시세 · {fmtYm(file.asOf)}</div>
        {a.p !== undefined ? (
          <>
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="mono text-2xl font-bold" style={{ color: 'var(--ink)' }}>{fmtWon(a.p)}</span>
              {st && <StatusBadge tone={st.tone} label={st.label} />}
            </div>
            {st?.sub && <div className="mt-0.5 text-[11px] mono" style={{ color: 'var(--ink-2)' }}>{st.sub}</div>}
          </>
        ) : (
          <div className="mt-0.5 text-[11px]" style={{ color: 'var(--ink-2)' }}>최근 12개월 거래가 3건이 안 돼서 시세는 비워 뒀어요. 아래 실제 거래를 보세요.</div>
        )}
      </div>

      {flow.length > 1 ? (
        <PriceChart data={flow} fmt={fmtWon} peakLabel="최고" title="시세 흐름 (분기)" note={HOW} />
      ) : !hist ? (
        <div className="mt-3 h-[180px] flex items-center justify-center text-[11px]" style={{ background: 'var(--plane)', color: 'var(--ink-mute)' }}>차트 불러오는 중…</div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <Box label="1년 변화" value={a.yoy !== undefined ? `${a.yoy > 0 ? '+' : ''}${a.yoy.toFixed(1)}%` : '–'} tone={a.yoy} />
        <Box label="최근 12개월 거래" value={`${a.c}건`} />
      </div>

      {h && h.t.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>최근 실거래</div>
          <table className="mt-1 w-full text-[11px] mono">
            <thead>
              <tr style={{ color: 'var(--ink-mute)' }}>
                <th className="py-0.5 text-left font-normal">계약</th>
                <th className="py-0.5 text-right font-normal">전용</th>
                <th className="py-0.5 text-right font-normal">층</th>
                <th className="py-0.5 text-right font-normal">금액</th>
              </tr>
            </thead>
            <tbody>
              {h.t.slice(0, 15).map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink)' }}>
                  <td className="py-0.5">{r[0].replace('-', '.')}{r[1] ? `.${String(r[1]).padStart(2, '0')}` : ''}</td>
                  <td className="py-0.5 text-right">{r[2].toFixed(1)}㎡</td>
                  <td className="py-0.5 text-right">{r[3]}</td>
                  <td className="py-0.5 text-right font-bold">{fmtWon(r[4])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Box({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone === undefined || tone === 0 ? 'var(--ink)' : tone > 0 ? 'var(--up-text)' : 'var(--down-text)'
  return (
    <div className="p-2" style={{ border: '1px solid var(--hairline)' }}>
      <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{label}</div>
      <div className="mono text-sm font-bold" style={{ color }}>{value}</div>
    </div>
  )
}
