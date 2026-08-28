// 워치리스트 히트맵 셀 색상 — 5단계 diverging (강세=green / 약세=red)
// 값은 app/globals.css의 --g1..g5 / --r1..r5 / --neu 토큰과 1:1 대응.
// (인라인 style에 매 셀마다 동적으로 꽂아야 해서 CSS var가 아닌 상수로 관리)

const GREEN = ['#dcece2', '#8ec2a1', '#2f8a5b', '#1c6b45', '#0f4d30'] as const
const RED   = ['#f2ded9', '#d99686', '#ac4530', '#872f1f', '#5c1f13'] as const
const NEUTRAL = '#f0efec'

const GREEN_TEXT = ['#0b0b0b', '#0b0b0b', '#0b0b0b', '#fff', '#fff'] as const
const RED_TEXT   = ['#0b0b0b', '#0b0b0b', '#fff', '#fff', '#fff'] as const

// ── 캡처 모드 팔레트 (유튜브 자료용, 흑배경) ──
// 전통적 히트맵 관례: 강세=초록 / 약세=빨강. Finviz 계열 다크 팔레트.
// 기준점: -3% #F63538 · -2% #BF4045 · -1% #8B444E · 0% #414554 · +1% #35764E · +2% #2F9E4F · +3% #30CC5A
// 우리 5단계 버킷(약→강)에 맞춰 보간.
const GREEN_CAP = ['#35764E', '#2E8B4C', '#2F9E4F', '#2FB855', '#30CC5A'] as const
const RED_CAP   = ['#8B444E', '#A5424A', '#BF4045', '#DB3B3F', '#F63538'] as const
const NEUTRAL_CAP = '#414554'

let CAPTURE = false
/** WatchlistClient 렌더 시 captureMode 값으로 호출 — 히트맵 셀 색을 흑배경/빨강·파랑으로 전환 */
export function setCapturePalette(on: boolean) { CAPTURE = on }

// net_direction 절대값 구간 경계 — 기존 코드가 /72를 최대치로 정규화해서 쓰던 것과
// 동일한 스케일(0~72선)에 맞춘 5단계 경계. 2 미만은 등락 없음으로 취급.
const THRESHOLDS = [2, 12, 24, 38, 54]

function bucket(absNet: number): number {
  for (let i = 0; i < THRESHOLDS.length; i++) {
    if (absNet < THRESHOLDS[i]) return i - 1 // -1 = neutral
  }
  return THRESHOLDS.length - 1
}

export function getCellBg(net: number): string {
  const idx = bucket(Math.abs(net))
  const G = CAPTURE ? GREEN_CAP : GREEN
  const R = CAPTURE ? RED_CAP : RED
  if (idx < 0) return CAPTURE ? NEUTRAL_CAP : NEUTRAL
  return net > 0 ? G[idx] : R[idx]
}

export function getCellTextColor(net: number): { ticker: string; sub: string } {
  const idx = bucket(Math.abs(net))
  if (CAPTURE) {
    if (idx < 0) return { ticker: '#e6e6e6', sub: 'rgba(255,255,255,0.45)' }
    // 밝은 상단 버킷(+2/+3, -3)은 검은 글씨가 더 선명
    if (idx >= 3) return { ticker: '#0d1512', sub: 'rgba(0,0,0,0.62)' }
    return { ticker: '#fff', sub: 'rgba(255,255,255,0.72)' }
  }
  if (idx < 0) return { ticker: '#0b0b0b', sub: '#8c887f' }
  const color = net > 0 ? GREEN_TEXT[idx] : RED_TEXT[idx]
  const sub = color === '#fff' ? 'rgba(255,255,255,0.68)' : '#8c887f'
  return { ticker: color, sub }
}
