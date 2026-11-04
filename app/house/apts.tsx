'use client'

// 수도권 단지별 지도 — 구(생활권) 안의 행정동 + 아파트 단지. 멀리서는 동 요약, 확대할수록 단지 시세·이름까지.
// 동은 누르는 단위가 아니라 배경 (사용자 결정). 데이터: public/data/house/apt/{단위}.json · {단위}_h.json (scripts/house/build_apts.py)
// 인접 구: 평소엔 흐리게만 보이고, '인접 구 같이 보기' 를 누르면 그 구의 동·단지도 같은 눈금으로 보여요

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
    { id: 'p84', label: '단지 시세 (84㎡ 환산)', short: '집값', unit: '만원', dec: 0, good: 'none', need: 'RONE', available: true, asOf,
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

/** 인접 구 파일들 (받는 대로 채워짐, 실패한 건 빠짐) */
export function useAptFiles(uids: string[]) {
  const key = uids.join(',')
  const [st, setSt] = useState<{ key: string; files: AptFile[] }>({ key: '', files: [] })
  useEffect(() => {
    if (!key) return
    let live = true
    const ids = key.split(',')
    const got: Record<string, AptFile> = {}
    ids.forEach(id => loadApt(id).then(f => {
      if (!live) return
      got[id] = f
      setSt({ key, files: ids.filter(i => got[i]).map(i => got[i]) })
    }).catch(() => { /* 못 받은 구는 빼고 */ }))
    return () => { live = false }
  }, [key])
  return st.key === key ? st.files : NONE
}
const NONE: AptFile[] = []

export type AptPick = { uid: string; seq: string }

// ─────────────────────────────────────────
// 가격대 — 그 구의 단지 시세 분포로 3~5칸 (경계는 읽기 쉬운 숫자로)
// ─────────────────────────────────────────
export type PriceBand = { label: string; seqs: Set<string>; mid: number | null; dongs: string[] }   // seqs: '{단위}:{단지}'
export const aptKey = (uid: string, seq: string) => `${uid}:${seq}`

const wonShort = (v: number) => (v >= 10000 ? `${+(v / 10000).toFixed(1)}억` : `${(v / 1000).toFixed(0)}천만`)
const niceCut = (v: number) => {
  const step = v < 10000 ? 1000 : v < 30000 ? 5000 : 10000
  return Math.max(step, Math.round(v / step) * step)
}

/** files[0] 이 지금 구, 나머지는 같이 보는 인접 구 (있으면 동 이름 앞에 구 이름) */
export function priceBands(files: AptFile[]): PriceBand[] {
  const many = files.length > 1
  const all = files.flatMap(f => f.apts.map(a => ({ a, f, k: aptKey(f.id, a.i), d: f.dongs[a.g]?.n ? `${many ? `${f.name} ` : ''}${f.dongs[a.g].n}` : '' })))
  const priced = all.filter(x => x.a.p !== undefined).sort((x, y) => x.a.p! - y.a.p!)
  const ps = priced.map(x => x.a.p!)
  const out: PriceBand[] = []
  if (ps.length) {
    const q = (f: number) => ps[Math.min(ps.length - 1, Math.floor(f * ps.length))]
    const n = ps.length >= 40 ? 5 : ps.length >= 12 ? 4 : ps.length >= 4 ? 3 : 1
    const cuts: number[] = []
    for (let i = 1; i < n; i++) {
      const c = niceCut(q(i / n))
      if (c > (cuts[cuts.length - 1] ?? 0) && c > ps[0] && c <= ps[ps.length - 1]) cuts.push(c)
    }
    const edges: (number | null)[] = [null, ...cuts, null]
    for (let i = edges.length - 2; i >= 0; i--) {   // 비싼 칸부터
      const lo = edges[i], hi = edges[i + 1]
      const in_ = priced.filter(({ a }) => (lo === null || a.p! >= lo) && (hi === null || a.p! < hi))
      if (!in_.length) continue
      const label = lo === null && hi === null ? '전체' : lo === null ? `${wonShort(hi!)} 미만` : hi === null ? `${wonShort(lo)} 이상` : `${wonShort(lo)} ~ ${wonShort(hi)}`
      const cnt: Record<string, number> = {}
      for (const { d } of in_) if (d) cnt[d] = (cnt[d] ?? 0) + 1
      out.push({
        label, seqs: new Set(in_.map(x => x.k)), mid: in_[Math.floor(in_.length / 2)].a.p!,
        dongs: Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => d),
      })
    }
  }
  const none = all.filter(x => x.a.p === undefined)
  if (none.length) out.push({ label: '시세 없음 (거래 적음)', seqs: new Set(none.map(x => x.k)), mid: null, dongs: [] })
  return out
}

// ─────────────────────────────────────────
// 지도 — 브이월드 배경지도(회색) 위에 행정동 색 + 단지 점·라벨. 확대·이동은 Leaflet
// 점·라벨은 지도 위에 React 로 겹쳐 그림 (CSS 변수 색을 그대로 쓰고, 겹침을 직접 피하려고)
// 층(pane): 동 색 → 전철 → 인접 구 가림막(반투명) → 바깥 가림막 → 경계선 → (React) 점·라벨
// 인접 구는 가림막에 마우스를 올리면 살짝 진해지고, 누르면 그 자리에서 펼쳐짐 (지도는 안 움직임). 끌기는 지도 이동이라 클릭 아님(Leaflet 이 걸러 줌)
// ─────────────────────────────────────────
const VKEY = process.env.NEXT_PUBLIC_VWORLD_KEY ?? ''
const Z_PRICE = 1      // 처음 화면보다 이만큼 확대하면 단지 시세
const Z_NAME = 2.5     // 이만큼 확대하면 단지 이름까지 (또는 16 이상)
const NB_VEIL = 0.85   // 인접 구 가림막 (평소) — 시선이 안 가게 아주 흐리게 (사용자 요청)
const NB_HOVER = 0.6   // 마우스를 올렸을 때 — 눌러서 펼칠 수 있다는 느낌
const DOT_CELL_FAR = 22  // 멀리서: 이 크기(px) 칸마다 단지 점 하나
const DOT_CELL_MID = 12  // 시세 단계: 칸을 줄여 더 많이 (이름 단계부터는 전부)
const WORLD: [number, number][] = [[-85, -180], [-85, 180], [85, 180], [85, -180]]

type LMap = import('leaflet').Map
type LLib = typeof import('leaflet')
type Pt = { x: number; y: number }
type Poly = { getElement: () => Element | undefined }
type Veil = { id: string; on: boolean; hover: boolean; paint: () => void }

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

const unionBounds = (fs: AptFile[]): [[number, number], [number, number]] => [
  [Math.min(...fs.map(f => f.bounds[0][0])), Math.min(...fs.map(f => f.bounds[0][1]))],
  [Math.max(...fs.map(f => f.bounds[1][0])), Math.max(...fs.map(f => f.bounds[1][1]))],
]

// 인접 구 이름 자리: 가장 넓은 동의 이름 위치 (구 모양이 오목해도 구 안에 들어감)
const labelAt = (f: AptFile): [number, number] => {
  const d = [...f.dongs].sort((a, b) => b.a - a.a)[0]
  return d ? d.l : [(f.bounds[0][0] + f.bounds[1][0]) / 2, (f.bounds[0][1] + f.bounds[1][1]) / 2]
}

const styleEl = (p: Poly, s: Partial<CSSStyleDeclaration>) => {
  const el = p.getElement() as SVGElement | undefined
  if (el) Object.assign(el.style, s)
}

export function AptMap({ file, neighbors, open, fitReq, metric, selected, focusReq, band, onPick, onOpen, onGoto }: {
  file: AptFile; neighbors: AptFile[]; metric: RegionMetric; selected: AptPick | null
  open: string[]                                // 펼친 인접 구
  fitReq: number                                // 늘면 지금 보이는 구 전체로 화면 맞춤 ('모두 보기' 버튼)
  focusReq: (AptPick & { n: number }) | null   // 목록에서 고른 단지로 이동
  band: Set<string> | null                      // 고른 가격대의 단지 '{단위}:{단지}' (나머지는 흐리게)
  onPick: (p: AptPick | null) => void
  onOpen: (uid: string) => void                 // 인접 구 펼치기
  onGoto: (uid: string) => void                 // 인접 구로 이동
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LMap | null>(null)
  const libRef = useRef<LLib | null>(null)
  const polys = useRef<Poly[]>([])
  const nbPolys = useRef<{ p: Poly; f: AptFile; i: number }[]>([])
  const veils = useRef<Veil[]>([])
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<{ z: number; fit: number; moving: boolean; n: number } | null>(null)
  const [hover, setHover] = useState<{ a: Apt; f: AptFile; x: number; y: number } | null>(null)
  const [stations, setStations] = useState<SubwayStation[]>([])
  const onPickRef = useRef(onPick)
  const onOpenRef = useRef(onOpen)
  useEffect(() => { onPickRef.current = onPick; onOpenRef.current = onOpen })
  const openSet = useMemo(() => new Set(open), [open])

  // 지도 만들기 (단위가 바뀌면 key 로 새로 마운트됨)
  useEffect(() => {
    let dead = false
    let map: LMap | null = null
    Promise.all([import('leaflet'), loadSubway().catch(() => null)]).then(([{ default: L }, subway]) => {
      if (dead || !mapEl.current) return
      libRef.current = L
      map = L.map(mapEl.current, { zoomSnap: 0.5, zoomDelta: 1, wheelPxPerZoomLevel: 70, maxZoom: 19, minZoom: 9, attributionControl: true })
      for (const [n, z] of [['a-dong', 405], ['a-sub', 415], ['a-veil', 425], ['a-mask', 435], ['a-line', 440]] as const) {
        const p = map.createPane(n)
        p.style.zIndex = String(z)
        p.style.pointerEvents = 'none'
      }
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
      map.setMinZoom(fit - 1)
      map.setMaxBounds(b.pad(0.6))
      polys.current = file.dongs.map(d => L.polygon(d.r, { pane: 'a-dong', stroke: true, weight: 1, fillRule: 'evenodd', interactive: false }).addTo(map!))
      // 전철 노선·역 — 흐린 배경지도와 달리 원래 색 그대로 (인접 구까지 그려 두고 가림막이 덮음)
      if (subway) {
        const near = b.pad(0.8)
        for (const ln of subway.lines) {
          const paths = ln.p.filter(p => p.some(q => near.contains(q)))
          if (paths.length) L.polyline(paths, { pane: 'a-sub', color: ln.c, weight: 3, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map)
        }
        const st = subway.stations.filter(s => near.contains([s.la, s.lo]))
        for (const s of st) {
          L.circleMarker([s.la, s.lo], { pane: 'a-sub', radius: s.c.length > 1 ? 4.5 : 3.5, color: s.c.length > 1 ? '#333' : s.c[0], weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }).addTo(map)
        }
        setStations(st)
      }
      // CSS 변수 색은 SVG 속성으로는 안 먹어서 style 로
      styleEl(L.polygon(file.outline, { pane: 'a-line', fill: false, weight: 1.6, interactive: false }).addTo(map), { stroke: 'var(--ink)' })
      const sync = (moving: boolean) => setView(v => ({ z: map!.getZoom(), fit, moving, n: (v?.n ?? 0) + 1 }))
      // 확대 애니메이션 중에는 점·라벨을 숨겼다가 끝나면 다시 계산
      let zooming = false
      map.on('zoomstart', () => { zooming = true; sync(true) })
      map.on('zoomend', () => { zooming = false; sync(false) })
      map.on('move', () => { if (!zooming) sync(false) })
      map.on('click', () => onPickRef.current(null))
      mapRef.current = map
      setReady(true)
      sync(false)
    })
    return () => { dead = true; map?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 인접 구: 동 색 + 가림막 + 경계선, 그리고 바깥 가림막(세계 − 이 구 − 인접 구)
  const nbKey = neighbors.map(f => f.id).join(',')
  useEffect(() => {
    const map = mapRef.current, L = libRef.current
    if (!ready || !map || !L) return
    const g = L.layerGroup().addTo(map)
    const nbp: typeof nbPolys.current = [], vs: Veil[] = []
    for (const f of neighbors) {
      f.dongs.forEach((d, i) => nbp.push({ p: L.polygon(d.r, { pane: 'a-dong', stroke: true, weight: 1, fillRule: 'evenodd', interactive: false }).addTo(g), f, i }))
      const v = L.polygon(f.outline, { pane: 'a-veil', stroke: false, fillRule: 'evenodd', interactive: true, bubblingMouseEvents: false }).addTo(g)
      const ln = L.polygon(f.outline, { pane: 'a-line', fill: false, weight: 1, interactive: false }).addTo(g)
      const rec: Veil = {
        id: f.id, on: false, hover: false,
        paint: () => {
          const hot = rec.hover && !rec.on
          styleEl(v, { fill: 'var(--surface)', fillOpacity: rec.on ? '0' : String(hot ? NB_HOVER : NB_VEIL), pointerEvents: rec.on ? 'none' : '' })
          styleEl(ln, { stroke: hot ? 'var(--ink-2)' : 'var(--hairline-2)', strokeWidth: hot ? '1.5' : '1' })
        },
      }
      v.on('mouseover', () => { rec.hover = true; rec.paint() })
      v.on('mouseout', () => { rec.hover = false; rec.paint() })
      v.on('click', () => { rec.hover = false; onOpenRef.current(f.id) })   // 끌고 놓은 건 Leaflet 이 click 으로 안 보냄
      rec.paint()
      vs.push(rec)
    }
    const mask = L.polygon([WORLD, ...file.outline, ...neighbors.flatMap(f => f.outline)], { pane: 'a-mask', stroke: false, fillRule: 'evenodd', interactive: false }).addTo(g)
    styleEl(mask, { fill: 'var(--surface)', fillOpacity: '1' })
    nbPolys.current = nbp
    veils.current = vs
    if (neighbors.length) map.setMaxBounds(L.latLngBounds(unionBounds([file, ...neighbors])).pad(0.2))
    setView(v => (v ? { ...v, n: v.n + 1 } : v))
    return () => { g.remove(); nbPolys.current = []; veils.current = [] }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, nbKey])

  const shown = useMemo(() => [file, ...neighbors.filter(f => openSet.has(f.id))], [file, neighbors, openSet])

  // '모두 보기' 버튼으로 켜고 끌 때만 화면을 맞춤 (지도에서 인접 구를 눌러 펼칠 땐 그대로)
  const lastFit = useRef(fitReq)
  useEffect(() => {
    if (lastFit.current === fitReq) return
    lastFit.current = fitReq
    mapRef.current?.flyToBounds(unionBounds(shown), { padding: [16, 16], duration: 0.6 })
  }, [fitReq, shown])
  // 같이 볼 땐 여러 구를 한 눈금으로 칠해야 비교가 됨
  const dongVals = useMemo(() => shown.flatMap(f => f.dongs.map(d => val(d, metric.id))).filter((v): v is number => v !== null), [shown, metric])
  const aptVals = useMemo(() => shown.flatMap(f => f.apts.map(a => val(a, metric.id))).filter((v): v is number => v !== null), [shown, metric])
  const far = !view || view.z < view.fit + Z_PRICE

  // 동 색 (CSS 변수라 SVG 요소 style 로 직접 넣음). 확대하면 배경지도가 보이게 옅게
  useEffect(() => {
    const op = far ? '0.42' : '0.12'
    polys.current.forEach((p, i) => styleEl(p, { fill: fillOf(metric, val(file.dongs[i], metric.id), dongVals), stroke: 'var(--surface)', fillOpacity: op }))
    nbPolys.current.forEach(({ p, f, i }) => styleEl(p, { fill: fillOf(metric, val(f.dongs[i], metric.id), dongVals), stroke: 'var(--surface)', fillOpacity: op }))
    veils.current.forEach(v => { v.on = openSet.has(v.id); v.paint() })
  }, [metric, dongVals, file, far, openSet, view?.n])

  useEffect(() => {
    const map = mapRef.current
    const f = focusReq && [file, ...neighbors].find(x => x.id === focusReq.uid)
    const a = f && f.apts.find(x => x.i === focusReq.seq)
    if (map && a) map.flyTo([a.la, a.lo], Math.max(map.getZoom(), 16.5), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusReq])

  const isSel = (f: AptFile, a: Apt) => !!selected && selected.uid === f.id && selected.seq === a.i
  const dim = (f: AptFile, a: Apt) => !!band && !band.has(aptKey(f.id, a.i))

  // 화면 좌표 계산 + 겹치지 않는 라벨 고르기 (거래 많은 단지 먼저, 고른 단지는 항상)
  const layout = useMemo(() => {
    const map = mapRef.current
    if (!map || !view || view.moving) return null
    const size = map.getSize()
    const px = (la: number, lo: number): Pt => map.latLngToContainerPoint([la, lo])
    const onScreen = (p: Pt, m = 10) => p.x > -m && p.x < size.x + m && p.y > -m && p.y < size.y + m
    const mpp = 40075016 * Math.cos((map.getCenter().lat * Math.PI) / 180) / (256 * 2 ** view.z)   // m/px
    // 좌표를 못 찾은 단지(ap)는 지도에 안 그림 — 엉뚱한 자리에 찍히느니 목록에서만
    const all = shown.flatMap(f => f.apts.filter(a => !a.ap).map(a => ({ a, f, p: px(a.la, a.lo) }))).filter(({ p }) => onScreen(p))
    // 축소돼 있을 땐 점을 솎아 냄 — 화면을 칸으로 나눠 칸마다 한 단지만 (고른 단지 → 고른 가격대 → 거래 많은 단지 순)
    // 확대할수록 칸이 작아지고, 단지 이름이 나오는 단계부터는 전부
    const cell = view.z >= Math.min(view.fit + Z_NAME, 16) ? 0 : far ? DOT_CELL_FAR : DOT_CELL_MID
    const rank = (x: { a: Apt; f: AptFile }) => (isSel(x.f, x.a) ? 2e9 : 0) + (band && !dim(x.f, x.a) ? 1e9 : 0) + x.a.c
    const taken = new Set<string>()
    const dots = cell === 0 ? all : [...all].sort((x, y) => rank(y) - rank(x)).filter(({ a, f, p }) => {
      if (isSel(f, a)) return true
      const k = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`
      if (taken.has(k)) return false
      taken.add(k)
      return true
    })
    // 인접 구 이름 → 동 라벨 → 역 이름 → 단지 라벨 순으로 자리를 잡음 (뒤에 오는 것이 피함)
    const boxes: [number, number, number, number][] = []
    const hit = (x: number, y: number, w: number, h: number) => boxes.some(([bx, by, bw, bh]) => x < bx + bw + 2 && x + w + 2 > bx && y < by + bh + 2 && y + h + 2 > by)
    // 인접 구 이름 — 접혀 있으면 이름만(구역을 누르면 펼침), 펼쳐 있으면 '그 구 지도로' 버튼
    const nbLabels = neighbors.map(f => ({ f, p: px(...labelAt(f)), on: openSet.has(f.id) })).filter(({ p }) => onScreen(p, -20))
    for (const { f, p } of nbLabels) {
      const w = f.name.length * 12 + 60
      boxes.push([p.x - w / 2, p.y - 10, w, 20])
    }
    const dongs: { d: AptFile['dongs'][number]; i: number; f: AptFile; p: Pt; s: number }[] = []
    if (far) {
      for (const f of shown) {
        f.dongs.forEach((d, i) => {
          const p = px(d.l[0], d.l[1]), s = Math.sqrt(d.a) / mpp
          const w = d.n.length * 12 + 4, h = s > 60 && val(d, metric.id) !== null ? 30 : 16
          if (s < d.n.length * 12 || !onScreen(p) || hit(p.x - w / 2, p.y - h / 2, w, h)) return
          boxes.push([p.x - w / 2, p.y - h / 2, w, h])
          dongs.push({ d, i, f, p, s })
        })
      }
    }
    const areas = shown.map(f => f.outline)
    const stns: { s: SubwayStation; p: Pt }[] = []
    for (const s of stations) {
      const p = px(s.la, s.lo)
      const w = s.n.length * 11 + 4, h = 14, x = p.x + 6, y = p.y - h / 2
      if (p.x < -40 || p.x > size.x || p.y < -10 || p.y > size.y + 10 || hit(x, y, w, h)) continue
      if (!areas.some(o => inside(s.la, s.lo, o))) continue
      boxes.push([x, y, w, h])
      stns.push({ s, p })
    }
    const labels: { a: Apt; f: AptFile; p: Pt; w: number; h: number; two: boolean }[] = []
    if (!far) {
      const two = view.z >= Math.min(view.fit + Z_NAME, 16)
      const order = [...dots].sort((x, y) => (isSel(y.f, y.a) ? 1 : 0) - (isSel(x.f, x.a) ? 1 : 0) || y.a.c - x.a.c)
      for (const { a, f, p } of order) {
        const sel = isSel(f, a)
        if (labels.length > 220 && !sel) break
        if (dim(f, a) && !sel) continue
        if (!two && a.p === undefined && !sel) continue   // 시세 단계에선 시세 있는 단지만
        const price = a.p !== undefined ? fmtWon(a.p) : `${fmtWon(a.t[2])}*`
        const name = short(a.n)
        const w = Math.max(price.length * 7.2 + 14, two ? name.length * 12.5 + 14 : 0)
        const h = two ? 30 : 17
        const x = p.x + 6, y = p.y - h / 2
        if (!sel && hit(x, y, w, h)) continue
        boxes.push([x, y, w, h])
        labels.push({ a, f, p: { x, y }, w, h, two })
      }
    }
    return { dots, dongs, labels, stns, nbLabels }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, neighbors, openSet, view, far, selected, stations, metric, band])

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
          {/* 인접 구 이름 — 접힘: 이름만 (마우스는 아래 구역으로 통과) / 펼침: 그 구 지도로 이동 */}
          {layout.nbLabels.map(({ f, p, on }) => on ? (
            <button key={f.id} type="button" onClick={e => { e.stopPropagation(); onGoto(f.id) }}
              title={`${f.full} 단지 지도로 이동`}
              className="absolute pointer-events-auto -translate-x-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 py-[1px] text-[11px] font-semibold"
              style={{ left: p.x, top: p.y, color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--ink-2)' }}>
              {f.name} 지도로 →
            </button>
          ) : (
            <div key={f.id} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold"
              style={{ left: p.x, top: p.y, color: 'var(--ink-mute)', opacity: 0.7, textShadow: '0 0 3px var(--surface), 0 0 3px var(--surface)' }}>
              {f.name}
            </div>
          ))}

          {/* 동 이름·시세 (멀리서 볼 때) */}
          {layout.dongs.map(({ d, i, f, p, s }) => {
            const v = val(d, metric.id)
            return (
              <div key={`${f.id}-${i}`} className="absolute -translate-x-1/2 -translate-y-1/2 text-center leading-tight whitespace-nowrap"
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
          {layout.dots.map(({ a, f, p }) => {
            const on = isSel(f, a)
            const v = val(a, metric.id)
            const rr = on ? r + 2.5 : r
            return (
              <button key={`${f.id}-${a.i}`} type="button" aria-label={a.n}
                className="absolute pointer-events-auto rounded-full"
                style={{
                  left: p.x - rr, top: p.y - rr, width: rr * 2, height: rr * 2,
                  background: v === null ? 'var(--surface)' : fillOf(metric, v, aptVals),
                  border: `${on ? 2 : 1}px solid ${on ? 'var(--ink)' : 'var(--ink-2)'}`,
                  opacity: on ? 1 : dim(f, a) ? 0.1 : 1,
                }}
                onPointerEnter={e => { const b = boxRef.current?.getBoundingClientRect(); if (b) setHover({ a, f, x: e.clientX - b.left, y: e.clientY - b.top }) }}
                onPointerLeave={() => setHover(null)}
                onClick={e => { e.stopPropagation(); onPick({ uid: f.id, seq: a.i }) }} />
            )
          })}

          {/* 단지 라벨 */}
          {layout.labels.map(({ a, f, p, w, h, two }) => {
            const v = val(a, metric.id)
            const on = isSel(f, a)
            return (
              <button key={`${f.id}-${a.i}`} type="button" onClick={e => { e.stopPropagation(); onPick({ uid: f.id, seq: a.i }) }}
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

      <button type="button" onClick={() => mapRef.current?.flyToBounds(unionBounds(shown), { padding: [12, 12], duration: 0.5 })}
        className="absolute right-2 top-2 z-[460] px-2 py-1 text-[10px] font-semibold"
        style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline-2)' }}>
        {shown.length > 1 ? '전체 보기' : `${file.name} 전체`}
      </button>
      <div className="absolute left-2 bottom-5 z-[460] px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--surface)', color: 'var(--ink-mute)' }}>
        {far ? (shown.length <= neighbors.length ? '옆 구를 누르면 펼쳐져요 · 확대하면 단지 시세' : '확대하면 단지 시세가 보여요') : view && view.z < Math.min(view.fit + Z_NAME, 16) ? '더 확대하면 단지 이름까지' : '* 시세 없는 단지는 마지막 거래가'}
      </div>

      {hover && (
        <div className="pointer-events-none absolute z-[470] w-[210px] p-2 text-[11px]"
          style={{ left: Math.min(hover.x + 12, (boxRef.current?.clientWidth ?? 400) - 220), top: hover.y + 12,
            background: 'var(--surface)', border: '1px solid var(--ink)', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
          <AptLine a={hover.a} dong={`${hover.f.id !== file.id ? `${hover.f.name} ` : ''}${hover.f.dongs[hover.a.g]?.n ?? ''}`} />
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
// 오른쪽: 가격대 → (누르면) 그 가격대 단지 / 검색 / 인접 구
// ─────────────────────────────────────────
export function AptBands({ file, bands, band, metric, neighbors, open, onToggleAll, onOpen, onBand, onPick, onGoto }: {
  file: AptFile; bands: PriceBand[]; band: number | null; metric: RegionMetric
  neighbors: AptFile[]; open: string[]; onToggleAll: () => void; onOpen: (uid: string) => void
  onBand: (i: number | null) => void; onPick: (p: AptPick) => void; onGoto: (uid: string) => void
}) {
  const [q, setQ] = useState('')
  const s = q.trim()
  const st = aptStatus(file.sum)
  const shown = useMemo(() => [file, ...neighbors.filter(f => open.includes(f.id))], [file, neighbors, open])
  const many = shown.length > 1
  const allOpen = neighbors.length > 0 && neighbors.every(f => open.includes(f.id))
  const pvals = shown.flatMap(f => f.apts.map(a => a.p)).filter((v): v is number => v !== undefined)
  const p84 = aptMetrics(null)[0]
  const maxN = Math.max(1, ...bands.map(b => b.seqs.size))
  // 검색·가격대 모두 펼친 인접 구까지
  const pool = useMemo(() => shown.flatMap(f => f.apts.map(a => ({ a, f }))), [shown])
  const found = useMemo(() => (s ? pool.filter(({ a }) => a.n.includes(s)) : []), [pool, s])
  const cur = band !== null ? bands[band] : undefined
  const inBand = useMemo(() => (cur ? pool.filter(({ a, f }) => cur.seqs.has(aptKey(f.id, a.i))) : []), [cur, pool])

  return (
    <div>
      <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>
        {file.full}{many ? ` + 인접 ${shown.length - 1}곳` : ''} 아파트 {pool.length}곳
      </div>
      {file.sum.p !== undefined && (
        <div className="mt-2 flex items-center gap-2 flex-wrap text-[11px]">
          <span style={{ color: 'var(--ink-mute)' }}>{file.name} 전체 84㎡ 시세</span>
          <b className="mono" style={{ color: 'var(--ink)' }}>{fmtWon(file.sum.p)}</b>
          {st && <StatusBadge tone={st.tone} label={st.label} small />}
        </div>
      )}

      {/* 인접 구 */}
      {neighbors.length > 0 && (
        <div className="mt-2 p-2 text-[11px]" style={{ border: '1px solid var(--hairline)', background: 'var(--plane)' }}>
          <div className="flex items-center justify-between gap-2">
            <span style={{ color: 'var(--ink-2)' }}>인접 {neighbors.length}곳 {many ? `· ${shown.length - 1}곳 같이 보는 중` : '· 지도에서 누르면 펼쳐져요'}</span>
            <button type="button" onClick={onToggleAll} className="px-2 py-1 font-bold shrink-0"
              style={allOpen ? { border: '1px solid var(--ink)', color: 'var(--ink)' } : { background: 'var(--ink)', color: 'var(--surface)' }}>
              {allOpen ? `${file.name}만 보기` : '인접 구 모두 보기'}
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {neighbors.map(f => {
              const on = open.includes(f.id)
              return (
                <span key={f.id} className="inline-flex text-[10px]" style={{ border: `1px solid ${on ? 'var(--ink-2)' : 'var(--hairline-2)'}`, background: 'var(--surface)' }}>
                  <button type="button" onClick={() => onOpen(f.id)} title={on ? '접기' : '지도에 펼치기'} className="px-1.5 py-0.5"
                    style={{ color: on ? 'var(--ink)' : 'var(--ink-2)', fontWeight: on ? 700 : 400 }}>
                    {on ? '✓ ' : ''}{f.name} <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>{f.sum.p !== undefined ? fmtWon(f.sum.p) : '–'}</span>
                  </button>
                  <button type="button" onClick={() => onGoto(f.id)} title={`${f.full} 단지 지도로 이동`} className="px-1 py-0.5"
                    style={{ borderLeft: '1px solid var(--hairline-2)', color: 'var(--accent)' }}>→</button>
                </span>
              )
            })}
          </div>
        </div>
      )}

      <input value={q} onChange={e => setQ(e.target.value)} placeholder={many ? '단지 이름 검색 (펼친 인접 구 포함)' : '단지 이름 검색'}
        className="mt-2 w-full px-2 py-1 text-[11px]" style={{ border: '1px solid var(--hairline-2)', background: 'var(--surface)', color: 'var(--ink)' }} />

      {s ? (
        <AptRows rows={found} metric={metric} onPick={onPick} empty="맞는 단지가 없어요" showUnit={many} />
      ) : cur ? (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => onBand(null)} className="text-[11px] underline underline-offset-2" style={{ color: 'var(--accent)' }}>← 가격대</button>
            <span className="text-[11px] font-bold" style={{ color: 'var(--ink)' }}>{cur.label} · {cur.seqs.size}곳</span>
          </div>
          <AptRows rows={inBand} metric={metric} onPick={onPick} empty="–" showUnit={many} />
        </div>
      ) : (
        <div className="mt-2">
          <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            84㎡ 시세 가격대{many ? ` (${shown.map(f => f.name).join('·')})` : ''} · 누르면 그 단지들이 보여요
          </div>
          <ul className="mt-1">
            {bands.map((b, i) => (
              <li key={b.label}>
                <button type="button" onClick={() => onBand(i)} className="w-full text-left py-1.5 flex items-center gap-2 text-[11px]"
                  style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <span className="w-2.5 h-2.5 shrink-0" style={{ background: b.mid === null ? 'var(--neu)' : fillOf(p84, b.mid, pvals) }} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold" style={{ color: 'var(--ink)' }}>{b.label}</span>
                    {b.dongs.length > 0 && <span className="block text-[10px] truncate" style={{ color: 'var(--ink-mute)' }}>{b.dongs.join(' · ')}</span>}
                  </span>
                  <span className="w-16 h-1.5 shrink-0" style={{ background: 'var(--plane)' }}>
                    <span className="block h-full" style={{ width: `${(b.seqs.size / maxN) * 100}%`, background: 'var(--ink-2)' }} />
                  </span>
                  <span className="mono w-10 text-right shrink-0" style={{ color: 'var(--ink)' }}>{b.seqs.size}곳</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function AptRows({ rows, metric, onPick, empty, showUnit = false }: {
  rows: { a: Apt; f: AptFile }[]; metric: RegionMetric; onPick: (p: AptPick) => void; empty: string; showUnit?: boolean
}) {
  const sorted = useMemo(() => [...rows].sort((x, y) => (val(y.a, metric.id) ?? -Infinity) - (val(x.a, metric.id) ?? -Infinity) || y.a.c - x.a.c), [rows, metric])
  const vals = rows.map(({ a }) => val(a, metric.id)).filter((v): v is number => v !== null)
  return (
    <ul className="mt-1 max-h-[480px] overflow-y-auto">
      {sorted.map(({ a, f }) => {
        const v = val(a, metric.id)
        return (
          <li key={`${f.id}-${a.i}`} onClick={() => onPick({ uid: f.id, seq: a.i })} className="flex items-center gap-2 py-1 cursor-pointer text-[11px]"
            style={{ borderBottom: '1px solid var(--hairline)' }}>
            <span className="w-2.5 h-2.5 shrink-0" style={{ background: v === null ? 'var(--neu)' : fillOf(metric, v, vals) }} />
            <span className="flex-1 min-w-0">
              <span className="block truncate font-semibold" style={{ color: 'var(--ink)' }}>{a.n}</span>
              <span className="block text-[10px]" style={{ color: 'var(--ink-mute)' }}>{showUnit ? `${f.name} ` : ''}{f.dongs[a.g]?.n}{a.b ? ` · ${a.b}년` : ''} · 1년 {a.c}건</span>
            </span>
            <span className="mono text-right shrink-0" style={{ color: v === null ? 'var(--ink-mute)' : 'var(--ink)' }}>
              {v !== null ? fmtRegion(metric, v) : '–'}
            </span>
          </li>
        )
      })}
      {!sorted.length && <li className="py-6 text-center text-[11px]" style={{ color: 'var(--ink-mute)' }}>{empty}</li>}
    </ul>
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
