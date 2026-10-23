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

// ─────────────────────────────────────────
// 지도 색
// ─────────────────────────────────────────
const G = ['--g1', '--g2', '--g3', '--g4', '--g5']
const R = ['--r1', '--r2', '--r3', '--r4', '--r5']

/** 값 → 칸 색. vals = 이번 지표의 전 지역 값 (스케일 기준) */
export function fillOf(m: RegionMetric, v: number | null | undefined, vals: number[]): string {
  if (v === null || v === undefined || !vals.length) return 'var(--neu)'
  const step = (x: number, max: number) => Math.min(4, Math.floor((x / (max || 1)) * 5 - 1e-9))
  if (m.id === 'price_dd') {
    // 0 = 신고가(초록) · 깊을수록 빨강
    if (v > -1) return `var(--g3)`
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
  if (m.unit === '%') {
    const sign = (m.id === 'price_yoy' || m.id === 'loan_yoy') && v > 0 ? '+' : ''
    return sign + v.toFixed(m.dec) + '%'
  }
  return v.toLocaleString('ko-KR', { maximumFractionDigits: m.dec }) + (m.unit === '호' ? '호' : m.unit)
}

export function fmtYm(d: string | null | undefined): string {
  return d ? `${d.slice(0, 4)}.${d.slice(5, 7)}` : '–'
}
