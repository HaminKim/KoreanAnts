// 매크로 데이터 공통 모듈 — Overlay(지표 상세) / Stack(워크스페이스) 가 같이 쓴다.
// 데이터 원천: scripts/macro/build_macro.py → public/data/macro/*

export type Tf = 'level' | 'yoy' | 'mom' | 'qoq' | 'qoq_saar' | 'chg' | 'chg_3ma' | 'avg_3m'

export interface SeriesSummary {
  key: string
  label: string
  units: string
  freq: 'D' | 'W' | 'M' | 'Q'
  obsFreq: 'M' | 'Q'
  agg: 'avg' | 'last' | null
  tf: Tf[]
  dec: number
  note: string | null
  url: string
  first: string | null
  rawLast: string
  partialLast: boolean
  updated: string | null
  fetchedAt: string
  latest: { tf: Tf; date: string | null; value: number | null; prev: number | null }
  spark: [string, number][]
}

export interface Relation { dir: 'in' | 'out'; type: RelType; id: string }
export type RelType = 'drives' | 'leads' | 'lags' | 'confirms' | 'decomposes' | 'affects'

export interface Indicator {
  no: number | null
  id: string
  cat: string
  name: string
  ko: string
  pri: string
  status: 'live' | 'pending' | 'error'
  main: string[]
  subs: string[]
  what: string
  read: string
  caution: string | null
  easy?: Easy | null          // 쉽게 이해하기 (scripts/macro/explain.py)
  relations: Relation[]
}

export interface Category { id: string; name: string; desc: string }

/** 쉽게 이해하기: 의미 → 올라가면 → 떨어지면 (+주의) */
export interface Easy { means: string; up: string; down: string; note?: string | null }

export interface MarketEvent { id: string; name: string; from: string; to: string; note: string }

export interface Catalog {
  generatedAt: string
  recessions?: { from: string; to: string; ongoing?: boolean }[]   // NBER (FRED USREC), 'YYYY-MM'
  events?: MarketEvent[]                                             // 위기·시장 이벤트 (registry.EVENTS)
  start: string
  tfLabel: Record<Tf, string>
  categories: Category[]
  indicators: Indicator[]
  series: Record<string, SeriesSummary>
  seriesEasy?: Record<string, Easy>   // 보조 시리즈 설명
}

export interface SeriesData extends Omit<SeriesSummary, 'latest' | 'spark' | 'first'> {
  d: string[]
  [tf: string]: unknown
}

// ─────────────────────────────────────────
// 로딩 — 실패 시 localStorage 캐시로 폴백 (빈 화면 금지)
// ─────────────────────────────────────────
const CACHE_PREFIX = 'reant_macro_cache:'

function readCache<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + k)
    return raw ? (JSON.parse(raw) as T) : null
  } catch { return null }
}
function writeCache(k: string, v: unknown) {
  try { localStorage.setItem(CACHE_PREFIX + k, JSON.stringify(v)) } catch { /* 용량 초과 등 무시 */ }
}

async function loadJson<T>(url: string, cacheKey: string, cache: boolean): Promise<T> {
  try {
    const r = await fetch(url, { cache: 'no-cache' })
    if (!r.ok) throw new Error(String(r.status))
    const js = (await r.json()) as T
    if (cache) writeCache(cacheKey, js)
    return js
  } catch (e) {
    const c = cache ? readCache<T>(cacheKey) : null
    if (c) return c
    throw e
  }
}

let catalogPromise: Promise<Catalog> | null = null
export function loadCatalog(): Promise<Catalog> {
  if (!catalogPromise) {
    catalogPromise = loadJson<Catalog>('/data/macro/catalog.json', 'catalog', true)
      .catch(e => { catalogPromise = null; throw e })
  }
  return catalogPromise
}

const seriesPromises = new Map<string, Promise<SeriesData>>()
// 시리즈 파일은 크기가 커서 자주 쓰는 지수만 캐시
const CACHE_SERIES = new Set(['SPX', 'NDX'])
export function loadSeries(key: string): Promise<SeriesData> {
  let p = seriesPromises.get(key)
  if (!p) {
    p = loadJson<SeriesData>(`/data/macro/series/${key}.json`, 's:' + key, CACHE_SERIES.has(key))
      .catch(e => { seriesPromises.delete(key); throw e })
    seriesPromises.set(key, p)
  }
  return p
}

// ─────────────────────────────────────────
// 조회 도우미
// ─────────────────────────────────────────
export function indicatorOfSeries(cat: Catalog, key: string): Indicator | undefined {
  return cat.indicators.find(i => i.main.includes(key)) ?? cat.indicators.find(i => i.subs.includes(key))
}

/** 레이어(시리즈)에 맞는 쉬운 설명: 지표의 메인 시리즈면 지표 설명, 보조면 시리즈 설명 */
export function easyOf(cat: Catalog, key: string): Easy | null {
  const main = cat.indicators.find(i => i.main.includes(key))
  if (main?.easy) return main.easy
  return cat.seriesEasy?.[key] ?? indicatorOfSeries(cat, key)?.easy ?? null
}

export const INDEX_KEYS = ['SPX', 'NDX'] as const

// ─────────────────────────────────────────
// 날짜 / Time Shift (원본 날짜는 바꾸지 않고 표시용으로만 이동)
// ─────────────────────────────────────────
export function shiftDate(d: string, months: number): string {
  if (!months) return d
  const y = Number(d.slice(0, 4))
  const m = Number(d.slice(5, 7)) - 1 + months
  const ny = y + Math.floor(m / 12)
  const nm = ((m % 12) + 12) % 12
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${d.slice(8, 10)}`
}

export function fmtShift(months: number): string {
  if (!months) return ''
  return `${months > 0 ? '+' : '−'}${Math.abs(months)}M`
}

export interface Point { time: string; value: number }

/** 시리즈의 변환값을 차트 점으로. shift 는 X축 표시 이동(개월) */
export function points(s: SeriesData, tf: Tf, shift = 0): Point[] {
  const vals = s[tf] as (number | null)[] | undefined
  if (!vals) return []
  const out: Point[] = []
  for (let i = 0; i < s.d.length; i++) {
    const v = vals[i]
    if (v === null || v === undefined) continue
    out.push({ time: shiftDate(s.d[i], shift), value: v })
  }
  return out
}

/** 정규화(표준화): 공통 기간 [from, to] 의 평균·표준편차로 z-score. 원본 날짜 기준으로 계산 */
export function zscore(pts: Point[], from: string | null, to: string | null): { pts: Point[]; mean: number; sd: number } {
  const win = pts.filter(p => (!from || p.time >= from) && (!to || p.time <= to))
  const base = win.length >= 3 ? win : pts
  const mean = base.reduce((a, p) => a + p.value, 0) / Math.max(1, base.length)
  const sd = Math.sqrt(base.reduce((a, p) => a + (p.value - mean) ** 2, 0) / Math.max(1, base.length - 1)) || 1
  return { pts: pts.map(p => ({ time: p.time, value: (p.value - mean) / sd })), mean, sd }
}

// ─────────────────────────────────────────
// 표시 형식
// ─────────────────────────────────────────
const PCT_TF: Tf[] = ['yoy', 'mom', 'qoq', 'qoq_saar']

export function tfLabel(tf: Tf, obsFreq?: 'M' | 'Q'): string {
  switch (tf) {
    case 'level': return '원본'
    case 'yoy': return 'YoY'
    case 'mom': return 'MoM'
    case 'qoq': return 'QoQ'
    case 'qoq_saar': return 'QoQ 연율'
    case 'chg': return obsFreq === 'Q' ? '전분기 대비' : '전월 대비'
    case 'chg_3ma': return '증감 3M평균'
    case 'avg_3m': return '3M 평균'
  }
}

export function unitOf(s: { units: string }, tf: Tf): string {
  if (PCT_TF.includes(tf)) return '%'
  const u = s.units
  if (tf === 'chg' || tf === 'chg_3ma') {
    if (u.startsWith('%')) return '%p'
  }
  if (u.startsWith('%p')) return '%p'
  if (u.startsWith('%')) return '%'
  return ''
}

export function fmtNum(v: number | null | undefined, s: { units: string; dec: number }, tf: Tf): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–'
  const pct = PCT_TF.includes(tf)
  const dec = pct ? 1 : tf === 'level' || tf === 'avg_3m' ? s.dec : Math.max(s.dec, 1)
  const abs = Math.abs(v)
  let body: string
  if (!pct && abs >= 1e6) body = (v / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M'
  else body = v.toLocaleString('en-US', { minimumFractionDigits: abs >= 1000 ? 0 : dec, maximumFractionDigits: abs >= 1000 ? 0 : dec })
  const sign = (pct || tf === 'chg' || tf === 'chg_3ma') && v > 0 ? '+' : ''
  const u = unitOf(s, tf)
  return sign + body + (u ? u : '')
}

export function fmtPeriod(d: string | null, obsFreq: 'M' | 'Q'): string {
  if (!d) return '–'
  const y = d.slice(0, 4)
  const m = Number(d.slice(5, 7))
  if (obsFreq === 'Q') return `${y} Q${Math.floor((m - 1) / 3) + 1}`
  return `${y}.${String(m).padStart(2, '0')}`
}

export const FREQ_LABEL: Record<string, string> = { D: '일별', W: '주별', M: '월별', Q: '분기' }

export function freqNote(s: SeriesSummary | SeriesData): string {
  if (s.freq === 'D' || s.freq === 'W') {
    return `${FREQ_LABEL[s.freq]} 원본 → ${s.agg === 'last' ? '월말 값' : '월평균'}`
  }
  return FREQ_LABEL[s.freq]
}

export const REL_LABEL: Record<RelType, { out: string; in: string }> = {
  drives:     { out: '원인이 됨 →', in: '← 원인' },
  leads:      { out: '선행 →',     in: '← 선행 지표' },
  lags:       { out: '후행 →',     in: '← 후행 지표' },
  confirms:   { out: '확인 →',     in: '← 확인 지표' },
  decomposes: { out: '구성요소 →', in: '← 구성요소' },
  affects:    { out: '영향 →',     in: '← 영향 요인' },
}

// ─────────────────────────────────────────
// 레이어 (차트에 올린 한 줄) + URL 직렬화
// ─────────────────────────────────────────
export interface Layer { key: string; tf: Tf; shift: number }

export function encodeLayers(ls: Layer[]): string {
  return ls.map(l => `${l.key}:${l.tf}:${l.shift}`).join(',')
}
export function decodeLayers(s: string | null): Layer[] {
  if (!s) return []
  return s.split(',').map(t => {
    const [key, tf, shift] = t.split(':')
    return { key, tf: (tf || 'level') as Tf, shift: Number(shift) || 0 }
  }).filter(l => /^[A-Za-z0-9^_]+$/.test(l.key))
}

// 라인 색 (라이트/다크 각각 대비 확인된 값) — 순서대로 배정
export const LINE_COLORS_LIGHT = ['#1f3547', '#c2410c', '#2f8a5b', '#7c3aed', '#0e7490', '#be185d', '#a16207', '#4d7c0f']
export const LINE_COLORS_DARK  = ['#7fa8c4', '#f59e0b', '#5cb583', '#a78bfa', '#22d3ee', '#f472b6', '#facc15', '#a3e635']
