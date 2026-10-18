// 워크스페이스 분석 환경 저장/불러오기 — 1차: 브라우저 localStorage (계정 동기화는 추후)
import type { Layer } from './macro'

export interface WsState {
  v: 1
  mode: 'stack'
  layers: Layer[]                       // 순서 = 세로 나열 순서, tf = 가공값, shift = 개별 X축 이동(개월)
  years: number | null                  // 기간 버튼 (null = 전체)
  range: { from: string; to: string } | null   // 실제 보고 있던 구간 (확대/이동 결과)
  paneH: number                         // 차트 하나 높이(px)
}

export interface Preset { name: string; savedAt: string; state: WsState; builtin?: boolean }

const KEY_PRESETS = 'reant_macro_presets'
const KEY_CURRENT = 'reant_macro_ws_current'

export const BUILTIN_PRESETS: Preset[] = [
  {
    name: '인플레이션과 나스닥', savedAt: '', builtin: true,
    state: {
      v: 1, mode: 'stack', years: 20, range: null, paneH: 160,
      layers: [
        { key: 'CPIAUCSL', tf: 'yoy', shift: 0 },
        { key: 'FEDFUNDS', tf: 'level', shift: 0 },
        { key: 'DFII10', tf: 'level', shift: 0 },
        { key: 'NDX', tf: 'level', shift: 0 },
      ],
    },
  },
  {
    name: '신용 스트레스', savedAt: '', builtin: true,
    state: {
      v: 1, mode: 'stack', years: null, range: null, paneH: 150,
      layers: [
        { key: 'BAMLH0A0HYM2', tf: 'level', shift: 0 },
        { key: 'BAA10Y', tf: 'level', shift: 0 },
        { key: 'DRTSCILM', tf: 'level', shift: 0 },
        { key: 'UNRATE', tf: 'level', shift: 0 },
        { key: 'SPX', tf: 'level', shift: 0 },
      ],
    },
  },
]

function read<T>(k: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(k)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
function write(k: string, v: unknown) {
  try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* 저장 불가 환경 무시 */ }
}

export function listPresets(): Preset[] {
  const ps = read<Preset[]>(KEY_PRESETS, [])
  return Array.isArray(ps) ? ps.filter(p => p && p.name && p.state?.layers) : []
}

export function savePreset(name: string, state: WsState): Preset[] {
  const ps = listPresets().filter(p => p.name !== name)
  ps.unshift({ name, savedAt: new Date().toISOString(), state })
  write(KEY_PRESETS, ps)
  return ps
}

export function deletePreset(name: string): Preset[] {
  const ps = listPresets().filter(p => p.name !== name)
  write(KEY_PRESETS, ps)
  return ps
}

export function loadCurrent(): WsState | null {
  const s = read<WsState | null>(KEY_CURRENT, null)
  return s && Array.isArray(s.layers) ? s : null
}
export function saveCurrent(s: WsState) { write(KEY_CURRENT, s) }
