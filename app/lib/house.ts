// 한국 부동산 데이터 모듈 — 원천: scripts/house/build_house.py → public/data/house/*
// 전국 시리즈는 매크로와 같은 SeriesData 형식이라 MacroChart 를 그대로 쓴다.

import type { MarketEvent, SeriesData, SeriesSummary } from './macro'

export type ApiId = 'ECOS' | 'RONE'

export interface ApiInfo { name: string; env: string; url: string; steps: string[]; unlocks: string }

export interface HouseIndicator {
  id: string
  group: string
  ko: string
  main: string[]
  subs: string[]
  what: string
  need: ApiId | null
  status: 'live' | 'needKey' | 'error'
}

export interface HouseCatalog {
  generatedAt: string
  start: string
  keys: Record<ApiId, boolean>
  apis: Record<ApiId, ApiInfo>
  groups: { id: string; name: string; desc: string }[]
  indicators: HouseIndicator[]
  series: Record<string, SeriesSummary>
  events: MarketEvent[]
}

export interface RegionMetric {
  id: string
  label: string
  short: string
  unit: string
  dec: number
  good: 'up' | 'down' | 'none'   // up: 오르면 좋음(초록) · down: 오르면 나쁨(빨강) · none: 중립
  need: ApiId
  desc: string
  available: boolean
  asOf: string | null
}

export interface RegionValue { v: number | null; date: string; prev12: number | null }

export interface Region {
  ko: string
  name: string
  geo: string
  values: Record<string, RegionValue>
  hist: Record<string, [string, number | null][]>
  note: string | null
}

export interface Regions { generatedAt: string; metrics: RegionMetric[]; regions: Record<string, Region> }

export interface MapGeo { source: string; viewBox: [number, number, number, number]; regions: Record<string, { d: string; label: [number, number] }> }

// ─────────────────────────────────────────
// 시군구·구 (scripts/house/build_local.py · build_local_map.py → public/data/house/local/*)
// ─────────────────────────────────────────
/** 월별 시계열 압축 형식: s = 첫 달(YYYY-MM), v = 그 달부터 한 달씩 */
export interface Packed { s: string; v: (number | null)[] }

export interface LocalSummary {
  date?: string
  p84?: number          // 84㎡ 환산 집값 (만원)
  peak?: number
  peakDate?: string
  dd?: number           // 고점 대비 %
  atPeak?: boolean      // 최고가 ±peakBand% 안
  trend?: 'up' | 'down' | 'flat'   // 최근 3개월 연속 하락/상승
  mom?: number
  yoy?: number | null
  p84y?: number | null  // 1년 전 집값
  jr?: number           // 전세가율 %
  vol?: number          // 거래량 (호)
  volDate?: string
  volYoy?: number | null
}

export interface LocalUnit {
  p84?: Packed
  // index: 지수로 과거 환산 · avg: 평균가격 그대로 (표본 개편 영향)
  // trade_ratio: 생활권 — 부동산원 시 집값 × 실거래 가격 비율 · trade: 실거래 중앙값 그대로 (부동산원 값이 없는 군)
  how?: 'index' | 'avg' | 'trade_ratio' | 'trade'
  idx?: Packed            // 집값을 못 만들 때만 매매가격지수
  jr?: Packed
  vol?: Packed
  med?: number            // 최근 중위 매매가격 (만원, 면적 무관)
  tr?: { n: number; med: number | null; from: string; to: string }   // 최근 3개월 전용 75~95㎡ 실거래 (건수·실제 금액 중앙값)
  sum: LocalSummary
}

export interface LocalData { id: string; ko: string; generatedAt: string; asOf: string; sqm: number; units: Record<string, LocalUnit> }

export interface LocalGeoUnit {
  name: string
  full: string
  level: 2 | 3            // 2: 시군구 · 3: 일반구(고양시 일산서구 등)·광주 자치구
  parent: string | null
  d: string
  label: [number, number]
  bbox: [number, number, number, number]   // x, y, w, h
  kind?: 'area'           // 구가 없는 시를 나눈 생활권 (행정동을 합침)
  emds?: string[]         // 생활권에 들어간 행정동
}

export interface LocalGeo { id: string; ko: string; source: string; viewBox: [number, number, number, number]; units: Record<string, LocalGeoUnit> }

export interface LocalIndex {
  generatedAt: string
  asOf: string
  sqm: number
  peakBand: number
  files: Record<string, { file: string; unit: string }>   // 전국 지도 id → 지역 파일·단위
  regions: Record<string, LocalSummary>
}

// ─────────────────────────────────────────
// 로딩 — 실패 시 localStorage 캐시로 폴백 (빈 화면 금지)
// ─────────────────────────────────────────
const CACHE_PREFIX = 'reant_house_cache:'

async function loadJson<T>(path: string, cache: boolean): Promise<T> {
  try {
    const r = await fetch(path, { cache: 'no-cache' })
    if (!r.ok) throw new Error(String(r.status))
    const js = (await r.json()) as T
    if (cache) { try { localStorage.setItem(CACHE_PREFIX + path, JSON.stringify(js)) } catch { /* 용량 초과 등 무시 */ } }
    return js
  } catch (e) {
    if (cache) {
      try {
        const raw = localStorage.getItem(CACHE_PREFIX + path)
        if (raw) return JSON.parse(raw) as T
      } catch { /* 저장소 접근 불가 */ }
    }
    throw e
  }
}

const memo = new Map<string, Promise<unknown>>()
function once<T>(path: string, cache: boolean): Promise<T> {
  let p = memo.get(path) as Promise<T> | undefined
  if (!p) {
    p = loadJson<T>(path, cache).catch(e => { memo.delete(path); throw e })
    memo.set(path, p)
  }
  return p
}

export const loadHouseCatalog = () => once<HouseCatalog>('/data/house/catalog.json', true)
export const loadRegions = () => once<Regions>('/data/house/regions.json', true)
export const loadMap = () => once<MapGeo>('/data/house/map.json', true)
export const loadHouseSeries = (key: string) => once<SeriesData>(`/data/house/series/${key}.json`, false)
export const loadLocalIndex = () => once<LocalIndex>('/data/house/local/index.json', true)
export const loadLocal = (fid: string) => once<LocalData>(`/data/house/local/${fid}.json`, true)
export const loadLocalGeo = (fid: string) => once<LocalGeo>(`/data/house/local/geo_${fid}.json`, true)

export function unpack(p: Packed | undefined): [string, number][] {
  if (!p) return []
  let y = Number(p.s.slice(0, 4)), m = Number(p.s.slice(5, 7))
  const out: [string, number][] = []
  for (const v of p.v) {
    if (v !== null) out.push([`${y}-${String(m).padStart(2, '0')}`, v])
    if (++m > 12) { m = 1; y++ }
  }
  return out
}

/** 만원 → '13.9억' · '4.35억' · '9,215만' */
export function fmtWon(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  const a = Math.abs(v)
  if (a < 10000) return `${Math.round(v).toLocaleString('ko-KR')}만`
  return `${(v / 10000).toFixed(a >= 100000 ? 1 : 2)}억`
}

export type PriceTone = 'peak' | 'off' | 'down'

/** 집값 상태: 최고가 ±band% 안이면 '최고가', 3개월 연속 하락이면 '하락 중', 아니면 '고점 대비 −N%' */
export function priceStatus(s: LocalSummary): { tone: PriceTone; label: string; sub: string | null } | null {
  if (s.p84 === undefined || s.dd === undefined) return null
  const gap = s.peak !== undefined ? fmtWon(s.p84 - s.peak) : null
  const off = `고점 대비 ${s.dd.toFixed(1)}%`
  const when = `${gap} · 고점 ${fmtYm(s.peakDate)}`
  if (s.atPeak) return { tone: 'peak', label: '최고가', sub: s.dd < -0.05 ? `${off} · 고점 ${fmtYm(s.peakDate)}` : null }
  if (s.trend === 'down') return { tone: 'down', label: '하락 중', sub: `${off} (${when})` }
  return { tone: 'off', label: off, sub: when }
}

// ─────────────────────────────────────────
// 지도 색
// ─────────────────────────────────────────
const G = ['--g1', '--g2', '--g3', '--g4', '--g5']
const R = ['--r1', '--r2', '--r3', '--r4', '--r5']

/** 값 → 칸 색. vals = 이번 지표의 전 지역 값 (스케일 기준) */
export function fillOf(m: RegionMetric, v: number | null | undefined, vals: number[]): string {
  if (v === null || v === undefined || !vals.length) return 'var(--neu)'
  const step = (x: number, max: number) => Math.min(4, Math.floor((x / (max || 1)) * 5 - 1e-9))
  if (m.id === 'price_dd' || m.id === 'p84_dd') {
    // 0 = 신고가(초록) · 깊을수록 빨강. 84㎡ 집값은 '최고가' 기준(±3%)과 맞춤
    if (v > (m.id === 'p84_dd' ? -3 : -1)) return `var(--g3)`
    const max = Math.max(...vals.map(x => -x), 1)
    return `var(${R[Math.max(0, step(-v, max))]})`
  }
  if (m.good === 'up') {
    const max = Math.max(...vals.map(Math.abs), 0.1)
    return `var(${(v >= 0 ? G : R)[Math.max(0, step(Math.abs(v), max))]})`
  }
  // 순서 기준 (연체율·미분양·대출 증가율): 높을수록 진하게
  const sorted = [...vals].sort((a, b) => a - b)
  const rank = sorted.findIndex(x => x >= v)
  const q = sorted.length > 1 ? rank / (sorted.length - 1) : 0.5
  const i = Math.min(4, Math.floor(q * 5))
  if (m.good === 'down') return `var(${R[i]})`
  return `color-mix(in srgb, var(--accent) ${18 + i * 18}%, var(--neu))`
}

/** 진한 칸 위 글자는 흰색 */
export function textOn(fill: string): string {
  return /--(g4|g5|r3|r4|r5)\)/.test(fill) || /accent\) (8|9)\d%/.test(fill) ? '#fff' : 'var(--ink)'
}

export function fmtRegion(m: RegionMetric, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  if (m.unit === '만원') return fmtWon(v)
  if (m.unit === '%') {
    const sign = (m.id === 'price_yoy' || m.id === 'loan_yoy' || m.id === 'p84_yoy') && v > 0 ? '+' : ''
    return sign + v.toFixed(m.dec) + '%'
  }
  return v.toLocaleString('ko-KR', { maximumFractionDigits: m.dec }) + (m.unit === '호' ? '호' : m.unit)
}

export function fmtYm(d: string | null | undefined): string {
  return d ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : '–'
}
