'use client'

// 수도권 단지별 지도 — 구(생활권) 안의 행정동 + 아파트 단지. 멀리서는 동 요약, 확대할수록 단지 시세·이름까지.
// 동은 누르는 단위가 아니라 배경 (사용자 결정). 데이터: public/data/house/apt/{단위}.json · {단위}_h.json (scripts/house/build_apts.py)

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Apt, type AptFile, type AptHist, type AptSum, type PriceTone, type RegionMetric, type SubwayStation,
  fillOf, fmtRegion, fmtWon, fmtYm, loadApt, loadAptHist, loadSubway,
} from '@/app/lib/house'
import { PriceChart, StatusBadge } from './local'
import 'leaflet/dist/leaflet.css'

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
// 지도 — 브이월드 배경지도(회색) 위에 행정동 색 + 단지 점·라벨. 확대·이동은 Leaflet
// 점·라벨은 지도 위에 React 로 겹쳐 그림 (CSS 변수 색을 그대로 쓰고, 겹침을 직접 피하려고)
// ─────────────────────────────────────────
const VKEY = process.env.NEXT_PUBLIC_VWORLD_KEY ?? ''
const Z_PRICE = 1      // 처음 화면보다 이만큼 확대하면 단지 시세
const Z_NAME = 2.5     // 이만큼 확대하면 단지 이름까지 (또는 16 이상)

type LMap = import('leaflet').Map
type Pt = { x: number; y: number }

// 점이 구 경계(여러 링, evenodd) 안에 있는지
function inside(la: number, lo: number, rings: [number, number][][]) {
  let c = false
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ai, oi] = r[i], [aj, oj] = r[j]
      if ((ai > la) !== (aj > la) && lo < ((oj - oi) * (la - ai)) / (aj - ai) + oi) c = !c
    }
  }
  return c
}

export function AptMap({ file, metric, selected, focusReq, onPick }: {
  file: AptFile; metric: RegionMetric; selected: string | null
  focusReq: { seq: string; n: number } | null   // 목록에서 고른 단지로 이동
  onPick: (seq: string | null) => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const polys = useRef<{ setStyle: (o: object) => void; getElement: () => Element | undefined }[]>([])
  const [view, setView] = useState<{ z: number; fit: number; moving: boolean; n: number } | null>(null)
  const [hover, setHover] = useState<{ a: Apt; x: number; y: number } | null>(null)
  const [stations, setStations] = useState<SubwayStation[]>([])
  const onPickRef = useRef(onPick)
  useEffect(() => { onPickRef.current = onPick })

  // 지도 만들기 (단위가 바뀌면 key 로 새로 마운트됨)
  useEffect(() => {
    let dead = false
    let map: LMap | null = null
    Promise.all([import('leaflet'), loadSubway().catch(() => null)]).then(([{ default: L }, subway]) => {
      if (dead || !mapEl.current) return
      map = L.map(mapEl.current, { zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 70, maxZoom: 19, minZoom: 9, attributionControl: true })
      if (VKEY) {
        L.tileLayer(`https://api.vworld.kr/req/wmts/1.0.0/${VKEY}/white/{z}/{y}/{x}.png`, {
          maxNativeZoom: 18, maxZoom: 19, attribution: '배경지도 © VWorld (국토교통부)',
        }).addTo(map)
      }
      map.attributionControl.setPrefix(false)
      if (subway) map.attributionControl.addAttribution('전철 © OpenStreetMap')
      const b = L.latLngBounds(file.bounds)
      map.fitBounds(b, { padding: [16, 16] })
      const fit = map.getZoom()
      map.setMinZoom(fit - 0.5)
      map.setMaxBounds(b.pad(0.2))
      // 구 밖은 페이지 배경으로 덮어서 그 구만 보이게 (세계 사각형 − 구 경계)
      const world: [number, number][] = [[-85, -180], [-85, 180], [85, 180], [85, -180]]
      polys.current = file.dongs.map(d => L.polygon(d.r, { stroke: true, weight: 1, fillRule: 'evenodd', interactive: false }).addTo(map!))
      // 전철 노선·역 — 흐린 배경지도와 달리 원래 색 그대로 (동 색 위, 구 밖 가림막 아래)
      if (subway) {
        const near = b.pad(0.3)
        for (const ln of subway.lines) {
          const paths = ln.p.filter(p => p.some(q => near.contains(q)))
          if (paths.length) L.polyline(paths, { color: ln.c, weight: 3, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map)
        }
        const st = subway.stations.filter(s => inside(s.la, s.lo, file.outline))
        for (const s of st) {
          L.circleMarker([s.la, s.lo], { radius: s.c.length > 1 ? 4.5 : 3.5, color: s.c.length > 1 ? '#333' : s.c[0], weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map)
        }
        setStations(st)
      }
      const mask = L.polygon([world, ...file.outline], { stroke: false, fillRule: 'evenodd', interactive: false }).addTo(map)
      const outline = L.polygon(file.outline, { fill: false, weight: 1.6, interactive: false }).addTo(map)
      // CSS 변수 색은 SVG 속성으로는 안 먹어서 style 로
      const me = mask.getElement() as SVGElement | undefined
      if (me) { me.style.fill = 'var(--surface)'; me.style.fillOpacity = '1' }
      const oe = outline.getElement() as SVGElement | undefined
      if (oe) oe.style.stroke = 'var(--ink)'
      const sync = (moving: boolean) => setView(v => ({ z: map!.getZoom(), fit, moving, n: (v?.n ?? 0) + 1 }))
      // 확대 애니메이션 중에는 점·라벨을 숨겼다가 끝나면 다시 계산
      let zooming = false
      map.on('zoomstart', () => { zooming = true; sync(true) })
      map.on('zoomend', () => { zooming = false; sync(false) })
      map.on('move', () => { if (!zooming) sync(false) })
      map.on('click', () => onPickRef.current(null))
      mapRef.current = map
      sync(false)
    })
    return () => { dead = true; map?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dongVals = useMemo(() => file.dongs.map(d => val(d, metric.id)).filter((v): v is number => v !== null), [file, metric])
  const aptVals = useMemo(() => file.apts.map(a => val(a, metric.id)).filter((v): v is number => v !== null), [file, metric])
  const far = !view || view.z < view.fit + Z_PRICE

  // 동 색 (CSS 변수라 SVG 요소 style 로 직접 넣음). 확대하면 배경지도가 보이게 옅게
  useEffect(() => {
    polys.current.forEach((p, i) => {
      const el = p.getElement() as SVGElement | undefined
      if (!el) return
      el.style.fill = fillOf(metric, val(file.dongs[i], metric.id), dongVals)
      el.style.stroke = 'var(--surface)'
      el.style.fillOpacity = far ? '0.42' : '0.12'
    })
  }, [metric, dongVals, file, far, view?.n])

  useEffect(() => {
    const map = mapRef.current
    const a = focusReq && file.apts.find(x => x.i === focusReq.seq)
    if (map && a) map.flyTo([a.la, a.lo], Math.max(map.getZoom(), 16.5), { duration: 0.6 })
  }, [focusReq, file])

  // 화면 좌표 계산 + 겹치지 않는 라벨 고르기 (거래 많은 단지 먼저, 고른 단지는 항상)
  const layout = useMemo(() => {
    const map = mapRef.current
    if (!map || !view || view.moving) return null
    const size = map.getSize()
    const px = (la: number, lo: number): Pt => map.latLngToContainerPoint([la, lo])
    const mpp = 40075016 * Math.cos((map.getCenter().lat * Math.PI) / 180) / (256 * 2 ** view.z)   // m/px
    // 좌표를 못 찾은 단지(ap)는 지도에 안 그림 — 엉뚱한 자리에 찍히느니 목록에서만
    const dots = file.apts.filter(a => !a.ap).map(a => ({ a, p: px(a.la, a.lo) })).filter(({ p }) => p.x > -10 && p.x < size.x + 10 && p.y > -10 && p.y < size.y + 10)
    // 멀리선 동 라벨 → 역 이름, 가까이선 역 이름 → 단지 라벨 순으로 자리를 잡음 (뒤에 오는 것이 피함)
    const boxes: [number, number, number, number][] = []
    const hit = (x: number, y: number, w: number, h: number) => boxes.some(([bx, by, bw, bh]) => x < bx + bw + 2 && x + w + 2 > bx && y < by + bh + 2 && y + h + 2 > by)
    const dongs = far ? file.dongs.map((d, i) => ({ d, i, p: px(d.l[0], d.l[1]), s: Math.sqrt(d.a) / mpp }))
      .filter(({ d, s }) => s >= d.n.length * 12) : []
    for (const { d, p, s } of dongs) {
      const w = d.n.length * 12 + 4, h = s > 60 && val(d, metric.id) !== null ? 30 : 16
      boxes.push([p.x - w / 2, p.y - h / 2, w, h])
    }
    const stns: { s: SubwayStation; p: Pt }[] = []
    for (const s of stations) {
      const p = px(s.la, s.lo)
      const w = s.n.length * 11 + 4, h = 14, x = p.x + 6, y = p.y - h / 2
      if (p.x < -40 || p.x > size.x || p.y < -10 || p.y > size.y + 10 || hit(x, y, w, h)) continue
      boxes.push([x, y, w, h])
      stns.push({ s, p })
    }
    const labels: { a: Apt; p: Pt; w: number; h: number; two: boolean }[] = []
    if (!far) {
      const two = view.z >= Math.min(view.fit + Z_NAME, 16)
      const order = [...dots].sort((x, y) => (y.a.i === selected ? 1 : 0) - (x.a.i === selected ? 1 : 0) || y.a.c - x.a.c)
      for (const { a, p } of order) {
        if (labels.length > 180 && a.i !== selected) break
        if (!two && a.p === undefined && a.i !== selected) continue   // 시세 단계에선 시세 있는 단지만
        const price = a.p !== undefined ? fmtWon(a.p) : `${fmtWon(a.t[2])}*`
        const name = short(a.n)
        const w = Math.max(price.length * 7.2 + 14, two ? name.length * 12.5 + 14 : 0)
        const h = two ? 30 : 17
        const x = p.x + 6, y = p.y - h / 2
        if (a.i !== selected && hit(x, y, w, h)) continue
        boxes.push([x, y, w, h])
        labels.push({ a, p: { x, y }, w, h, two })
      }
    }
    return { dots, dongs, labels, stns }
  }, [file, view, far, selected, stations, metric])

  const r = far ? 3 : 4.5

  return (
    <div ref={boxRef} className="apt-map relative h-[460px] md:h-[600px] overflow-hidden" style={{ background: 'var(--surface)' }}>
      <div ref={mapEl} className="absolute inset-0" />
      {!VKEY && (
        <div className="absolute left-2 top-2 z-[460] px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)', color: 'var(--ink-mute)' }}>
          배경지도 키(NEXT_PUBLIC_VWORLD_KEY)가 없어 경계만 보여요
        </div>
      )}

      {layout && (
        <div className="absolute inset-0 z-[450] pointer-events-none">
          {/* 동 이름·시세 (멀리서 볼 때) */}
          {layout.dongs.map(({ d, i, p, s }) => {
            const v = val(d, metric.id)
            return (
              <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2 text-center leading-tight whitespace-nowrap"
                style={{ left: p.x, top: p.y, textShadow: '0 0 3px var(--surface), 0 0 3px var(--surface), 0 0 2px var(--surface)' }}>
                <div className="text-[12px] font-bold" style={{ color: 'var(--ink)' }}>{d.n}</div>
                {v !== null && s > 60 && <div className="text-[11px] mono font-semibold" style={{ color: 'var(--ink)' }}>{fmtRegion(metric, v)}</div>}
              </div>
            )
          })}

          {/* 역 이름 */}
          {layout.stns.map(({ s, p }) => (
            <div key={`${s.n}${s.la}`} className="absolute whitespace-nowrap text-[11px] font-semibold leading-[14px]"
              style={{ left: p.x + 6, top: p.y - 7, color: 'var(--ink)',
                textShadow: '0 0 2px var(--surface), 0 0 2px var(--surface), 0 0 3px var(--surface), 0 0 3px var(--surface)' }}>
              {s.n}
            </div>
          ))}

          {/* 단지 점 */}
          {layout.dots.map(({ a, p }) => {
            const on = a.i === selected
            const v = val(a, metric.id)
            const rr = on ? r + 2.5 : r
            return (
              <button key={a.i} type="button" aria-label={a.n}
                className="absolute pointer-events-auto rounded-full"
                style={{
                  left: p.x - rr, top: p.y - rr, width: rr * 2, height: rr * 2,
                  background: v === null ? 'var(--surface)' : fillOf(metric, v, aptVals),
                  border: `${on ? 2 : 1}px ${a.ap ? 'dashed' : 'solid'} ${on ? 'var(--ink)' : 'var(--ink-2)'}`,
                }}
                onPointerEnter={e => { const b = boxRef.current?.getBoundingClientRect(); if (b) setHover({ a, x: e.clientX - b.left, y: e.clientY - b.top }) }}
                onPointerLeave={() => setHover(null)}
                onClick={e => { e.stopPropagation(); onPick(a.i) }} />
            )
          })}

          {/* 단지 라벨 */}
          {layout.labels.map(({ a, p, w, h, two }) => {
            const v = val(a, metric.id)
            const on = a.i === selected
            return (
              <button key={a.i} type="button" onClick={e => { e.stopPropagation(); onPick(a.i) }}
                className="absolute pointer-events-auto text-left px-[5px] leading-[13px] mono whitespace-nowrap overflow-hidden"
                style={{
                  left: p.x, top: p.y, width: w, height: h, fontSize: 10.5, color: 'var(--ink)',
                  background: 'var(--surface)', border: `${on ? 1.5 : 1}px solid ${on ? 'var(--ink)' : 'var(--hairline-2)'}`,
                  boxShadow: '0 1px 2px rgba(0,0,0,.12)',
                }}>
                {two && <span className="block font-sans font-bold truncate pt-[1px]" style={{ fontSize: 11 }}>{short(a.n)}</span>}
                <span className={two ? '' : 'block pt-[1px]'}>
                  <b>{a.p !== undefined ? fmtWon(a.p) : `${fmtWon(a.t[2])}*`}</b>
                  {two && metric.id !== 'p84' && v !== null && (
                    <span className="ml-1" style={{ color: v >= 0 || (metric.id === 'p84_dd' && v > -3) ? 'var(--up-text)' : 'var(--down-text)' }}>{fmtRegion(metric, v)}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <button type="button" onClick={() => mapRef.current?.fitBounds(file.bounds, { padding: [12, 12] })}
        className="absolute right-2 top-2 z-[460] px-2 py-1 text-[10px] font-semibold"
        style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline-2)' }}>
        {file.name} 전체
      </button>
      <div className="absolute left-2 bottom-5 z-[460] px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)', color: 'var(--ink-mute)' }}>
        {far ? '확대하면 단지 시세가 보여요' : view && view.z < Math.min(view.fit + Z_NAME, 16) ? '더 확대하면 단지 이름까지' : '* 시세 없는 단지는 마지막 거래가'}
      </div>

      {hover && (
        <div className="pointer-events-none absolute z-[470] w-[210px] p-2 text-[11px]"
          style={{ left: Math.min(hover.x + 12, (boxRef.current?.clientWidth ?? 400) - 220), top: hover.y + 12,
            background: 'var(--surface)', border: '1px solid var(--ink)', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
          <AptLine a={hover.a} dong={file.dongs[hover.a.g]?.n} />
        </div>
      )}
    </div>
  )
}

const short = (n: string) => (n.length > 10 ? n.slice(0, 9) + '…' : n)

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
            {file.full} {file.dongs[a.g]?.n}{a.b ? ` · ${a.b}년 준공` : ''}{a.ap ? ' · 위치를 못 찾아 지도엔 안 보여요' : ''}
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
