'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/client'
import { KOREAN_NAMES } from '@/app/constants/stockNames'
import { getCellBg, getCellTextColor, setCapturePalette } from '@/app/lib/heatmapColor'

const TradingViewChart = dynamic(
  () => import('@/app/components/TradingViewChart'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-400 text-sm">차트 로딩 중...</div> }
)

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type Signal  = 'long' | 'long_watch' | 'short' | 'short_watch' | 'neutral'
type RSPoint = { d: string; v: number }
interface HighLow        { w52: number|null; w26: number|null; w13: number|null }
interface NearHigh       { w52: number|null; w26: number|null; w13: number|null }
interface BreakoutOnsets { w52: number|null; w26: number|null; w13: number|null }
interface EpsQuarter { d: string; actual: number|null; estimate: number|null; surp: number|null; revenue?: number|null }
interface EpsData    { history: EpsQuarter[]; trend: string|null }

interface StockBreakdown {
  bull_strength: number
  bear_strength: number
  net_direction: number
  ma_slope:      number
  sector_rs_60d: number | null
  rs_fresh_bull: number
  rs_fresh_bear: number
}

interface StockData {
  price:                 number
  ma100:                 number
  ma_distance_pct:       number
  ma150:                 number | null
  ma150_distance_pct:    number | null
  slope_dir:             string
  days_since_slope_turn: number | null
  rs_excess_pct:         number | null
  rs_20d_ma:             number | null
  sector_rs_excess:      number | null
  rs_slope_dir:          string
  rs_slope_days:         number
}

interface StockItem {
  ticker:          string
  score:           number
  signal:          Signal
  stage:           string
  rs_spy_line:     RSPoint[]
  rs_sector_line:  RSPoint[]
  highs:            HighLow
  lows:             HighLow
  near_highs:       NearHigh
  breakout_onsets?: BreakoutOnsets
  eps:             EpsData | null
  breakdown:       StockBreakdown
  data:            StockData
}

interface SectorItem {
  id:                   number
  name:                 string
  etf:                  string
  emoji:                string
  sector_rs_excess:     number | null
  sector_rs_days:       number
  sector_rs_slope_dir:  string
  sector_rs_slope_days: number
  sector_rs_history:    RSPoint[]
  stocks:               StockItem[]
}

interface WatchlistData {
  asOf:  string
  total: number
  market_context: {
    spy_ma_dist:  number
    spy_slope:    string
    market_state: string
  }
  sectors: SectorItem[]
}

// ─────────────────────────────────────────
// 색상 헬퍼 (app/lib/heatmapColor.ts 공유 — import는 파일 상단 참고)
// ─────────────────────────────────────────

const STAGE_ABBR: Record<string, string> = {
  stage1_late: '①→', stage2_early: '②↑', stage2: '②',
  stage2_extended: '②+', stage3: '③', stage3_late: '③→',
  stage4_early: '④↓', stage4: '④', stage4_extended: '④-',
}

const SIGNAL_KO: Record<Signal, string> = {
  long: '🚀 롱', long_watch: '👀 롱관심',
  short: '📉 숏', short_watch: '⚠️ 숏관심', neutral: '➖ 중립',
}

// ─────────────────────────────────────────
// QoQ / YoY 헬퍼
// ─────────────────────────────────────────

function calcChange(curr: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null
  return Math.round((curr - prev) / Math.abs(prev) * 1000) / 10
}

function fmtChg(pct: number | null): { text: string; color: string } {
  if (pct === null) return { text: '─', color: '#9ca3af' }
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, color: pct >= 0 ? '#15803d' : '#b91c1c' }
}

// ─────────────────────────────────────────
// RSSparkline — RS vs SPY 추이 (SVG)
//
// X축 = 날짜(최근 60일)  Y축 = %  기준선 = 0
// 0 위 = 초록 채움, 0 아래 = 빨강 채움
// ─────────────────────────────────────────

function RSSparkline({
  data, label, uid,
}: {
  data:  RSPoint[]
  label: string
  uid:   string
}) {
  if (!data || data.length < 3) return null

  const W = 400, H = 78
  const PAD = { l: 36, r: 8, t: 6, b: 18 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const yZero  = PAD.t + innerH / 2

  const values = data.map(d => d.v)
  const maxAbs = Math.max(...values.map(Math.abs), 0.5)

  const xS = (i: number) => PAD.l + (i / (data.length - 1)) * innerW
  const yS = (v: number) => PAD.t + (innerH / 2) * (1 - v / maxAbs)

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`)
    .join(' ')

  const areaPath =
    `M${xS(0).toFixed(1)},${yZero.toFixed(1)} ` +
    data.map((d, i) => `L${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ') +
    ` L${xS(data.length - 1).toFixed(1)},${yZero.toFixed(1)} Z`

  const lastVal = data[data.length - 1].v
  const lineColor = lastVal >= 0 ? '#16a34a' : '#dc2626'

  // 마지막 0선 교차 날짜
  const crossDate = (() => {
    for (let i = data.length - 1; i > 0; i--) {
      if ((data[i].v >= 0) !== (data[i - 1].v >= 0)) return data[i].d
    }
    return null
  })()

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">{label}</span>
        <div className="flex items-center gap-3 text-[9px]">
          <span className="font-mono font-bold" style={{ color: lineColor }}>
            현재 {lastVal >= 0 ? '+' : ''}{lastVal.toFixed(2)}%
          </span>
          {crossDate && (
            <span className="text-gray-400">0선 교차 {crossDate.slice(5)}</span>
          )}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '68px', display: 'block' }}>
        <defs>
          {/* 0선 위(양수) → 초록 */}
          <clipPath id={`above-${uid}`}>
            <rect x={PAD.l} y={PAD.t} width={innerW} height={yZero - PAD.t} />
          </clipPath>
          {/* 0선 아래(음수) → 빨강 */}
          <clipPath id={`below-${uid}`}>
            <rect x={PAD.l} y={yZero} width={innerW} height={innerH / 2 + 2} />
          </clipPath>
        </defs>

        {/* 면적 채우기 */}
        <path d={areaPath} fill="rgba(34,197,94,0.18)"  clipPath={`url(#above-${uid})`} />
        <path d={areaPath} fill="rgba(239,68,68,0.18)"  clipPath={`url(#below-${uid})`} />

        {/* 0 기준선 */}
        <line
          x1={PAD.l} y1={yZero} x2={W - PAD.r} y2={yZero}
          stroke="#9ca3af" strokeWidth={0.6} strokeDasharray="3,2"
        />

        {/* RS 라인 */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.4} strokeLinejoin="round" />

        {/* 현재값 점 */}
        <circle cx={xS(data.length - 1)} cy={yS(lastVal)} r={2.5} fill={lineColor} />

        {/* Y축 레이블 */}
        <text x={PAD.l - 2} y={PAD.t + 4}    fontSize={8} textAnchor="end" fill="#9ca3af">+{maxAbs.toFixed(1)}</text>
        <text x={PAD.l - 2} y={yZero}         fontSize={8} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">0</text>
        <text x={PAD.l - 2} y={H - PAD.b - 2} fontSize={8} textAnchor="end" fill="#9ca3af">-{maxAbs.toFixed(1)}</text>

        {/* X축 첫/끝 날짜 */}
        <text x={PAD.l}      y={H - 3} fontSize={7} fill="#d1d5db">{data[0].d.slice(5)}</text>
        <text x={W - PAD.r}  y={H - 3} fontSize={7} fill="#d1d5db" textAnchor="end">{data[data.length - 1].d.slice(5)}</text>
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────
// RSLineChart — RS LINE (정규화, 1년=100) + 20일 EMA
//
// Y축 기준선 = 100 (1년 전)
// 100위: 초록 채움 / 100아래: 빨강 채움
// 점선 오버레이: 20일 EMA (회색)
// ─────────────────────────────────────────

function calcEMA(data: RSPoint[], period: number): RSPoint[] {
  const k = 2 / (period + 1)
  let ema = data[0]?.v ?? 100
  return data.map((p, i) => {
    if (i === 0) return { d: p.d, v: ema }
    ema = p.v * k + ema * (1 - k)
    return { d: p.d, v: ema }
  })
}

function RSLineChart({
  data, label, uid,
}: {
  data:  RSPoint[]
  label: string
  uid:   string
}) {
  if (!data || data.length < 3) return null

  const W = 400, H = 90
  const PAD = { l: 38, r: 8, t: 6, b: 18 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const values = data.map(d => d.v)
  const minV   = Math.min(...values, 100)
  const maxV   = Math.max(...values, 100)
  const range  = Math.max(maxV - minV, 5)
  const yPad   = range * 0.1
  const yMin   = minV - yPad
  const yMax   = maxV + yPad

  const xS = (i: number) => PAD.l + (i / (data.length - 1)) * innerW
  const yS = (v: number) => PAD.t + innerH * (1 - (v - yMin) / (yMax - yMin))

  const y100 = yS(100)
  const ema20 = calcEMA(data, 20)

  const linePath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`)
    .join(' ')

  const emaPath = ema20
    .map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`)
    .join(' ')

  const areaPath =
    `M${xS(0).toFixed(1)},${y100.toFixed(1)} ` +
    data.map((d, i) => `L${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ') +
    ` L${xS(data.length - 1).toFixed(1)},${y100.toFixed(1)} Z`

  const lastVal  = data[data.length - 1].v
  const lineColor = lastVal >= 100 ? '#16a34a' : '#dc2626'
  const aboveH   = Math.max(0, y100 - PAD.t)
  const belowH   = Math.max(0, H - PAD.b - y100)

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">{label}</span>
        <div className="flex items-center gap-3 text-[9px]">
          <span className="font-mono font-bold" style={{ color: lineColor }}>
            현재 {lastVal.toFixed(1)} ({lastVal >= 100 ? '+' : ''}{(lastVal - 100).toFixed(1)}%)
          </span>
          <span className="text-gray-400">— EMA20</span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '80px', display: 'block' }}>
        <defs>
          <clipPath id={`above-${uid}`}>
            <rect x={PAD.l} y={PAD.t} width={innerW} height={aboveH} />
          </clipPath>
          <clipPath id={`below-${uid}`}>
            <rect x={PAD.l} y={y100} width={innerW} height={belowH} />
          </clipPath>
        </defs>

        {/* 면적 채우기 */}
        <path d={areaPath} fill="rgba(34,197,94,0.18)"  clipPath={`url(#above-${uid})`} />
        <path d={areaPath} fill="rgba(239,68,68,0.18)"  clipPath={`url(#below-${uid})`} />

        {/* 100 기준선 */}
        <line
          x1={PAD.l} y1={y100} x2={W - PAD.r} y2={y100}
          stroke="#9ca3af" strokeWidth={0.6} strokeDasharray="3,2"
        />

        {/* 20일 EMA (점선, 회색) */}
        <path d={emaPath} fill="none" stroke="#9ca3af" strokeWidth={1} strokeDasharray="3,2" strokeLinejoin="round" />

        {/* RS LINE */}
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.4} strokeLinejoin="round" />

        {/* 현재값 점 */}
        <circle cx={xS(data.length - 1)} cy={yS(lastVal)} r={2.5} fill={lineColor} />

        {/* Y축 레이블 */}
        <text x={PAD.l - 2} y={PAD.t + 4}    fontSize={7} textAnchor="end" fill="#9ca3af">{yMax.toFixed(0)}</text>
        <text x={PAD.l - 2} y={y100}           fontSize={7} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">100</text>
        <text x={PAD.l - 2} y={H - PAD.b - 2}  fontSize={7} textAnchor="end" fill="#9ca3af">{yMin.toFixed(0)}</text>

        {/* X축 첫/끝 날짜 */}
        <text x={PAD.l}      y={H - 3} fontSize={7} fill="#d1d5db">{data[0].d.slice(5)}</text>
        <text x={W - PAD.r}  y={H - 3} fontSize={7} fill="#d1d5db" textAnchor="end">{data[data.length - 1].d.slice(5)}</text>
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────
// EPSChart — 분기별 실제 EPS 바 차트 (최대 12Q)
//
// 막대 = actual EPS ($), 회색 점선 = estimate
// 초록 = beat / 빨강 = miss / 파랑 = estimate 없음
// 하단 테이블: $값 + 전분기대비(QoQ) + 전년대비(YoY)
// ─────────────────────────────────────────

function EPSChart({ eps }: { eps: EpsData }) {
  const history = eps.history.filter(q => q.actual !== null) as (EpsQuarter & { actual: number })[]
  if (history.length < 2) return null

  const W = 400, H = 90
  const PAD = { l: 36, r: 8, t: 14, b: 22 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const allVals = [
    ...history.map(q => q.actual),
    ...history.filter(q => q.estimate !== null).map(q => q.estimate as number),
    0,
  ]
  const rawMax = Math.max(...allVals)
  const rawMin = Math.min(...allVals)
  const pad    = Math.max((rawMax - rawMin) * 0.15, 0.05)
  const yMax   = rawMax + pad
  const yMin   = rawMin - pad
  const toY    = (v: number) => PAD.t + innerH * (1 - (v - yMin) / (yMax - yMin))
  const zeroY  = toY(0)

  const gap  = innerW / history.length
  const barW = Math.max(5, gap * 0.55)

  const trend      = eps.trend
  const trendIcon  = trend === 'improving' ? '↗' : trend === 'declining' ? '↘' : '→'
  const trendColor = trend === 'improving' ? '#15803d' : trend === 'declining' ? '#b91c1c' : '#6b7280'
  const trendLabel = trend === 'improving' ? '개선' : trend === 'declining' ? '악화' : '보합'

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">EPS (분기 / $) ─ 점선=예상치 ─ {history.length}Q</span>
        {trend && (
          <span className="text-[9px] font-bold" style={{ color: trendColor }}>
            {trendIcon} {trendLabel}
          </span>
        )}
      </div>

      {/* 바 차트 */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '80px', display: 'block' }}>
        {zeroY >= PAD.t && zeroY <= H - PAD.b && (
          <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY}
            stroke="#9ca3af" strokeWidth={0.6} strokeDasharray="3,2" />
        )}

        {history.map((q, i) => {
          const cx      = PAD.l + gap * i + gap / 2
          const actualY = toY(q.actual)
          const isPos   = q.actual >= 0
          const barTop  = isPos ? actualY : zeroY
          const barBot  = isPos ? zeroY   : actualY
          const barH    = Math.max(2, barBot - barTop)

          let fill: string
          if (q.estimate === null) {
            fill = isPos ? 'rgba(59,130,246,0.6)' : 'rgba(239,68,68,0.6)'
          } else {
            fill = q.actual >= q.estimate ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'
          }

          return (
            <g key={q.d}>
              <rect x={cx - barW / 2} y={barTop} width={barW} height={barH} fill={fill} rx={1} />
              {q.estimate !== null && (
                <line
                  x1={cx - barW / 2 - 1} y1={toY(q.estimate)}
                  x2={cx + barW / 2 + 1} y2={toY(q.estimate)}
                  stroke="#6b7280" strokeWidth={1.2} strokeDasharray="2,1"
                />
              )}
              <text x={cx} y={H - 2} fontSize={5.5} textAnchor="middle" fill="#9ca3af">
                {q.d.slice(2, 7)}
              </text>
            </g>
          )
        })}

        <text x={PAD.l - 2} y={PAD.t + 3}     fontSize={6} textAnchor="end" fill="#9ca3af">${yMax.toFixed(2)}</text>
        {zeroY >= PAD.t && zeroY <= H - PAD.b && (
          <text x={PAD.l - 2} y={zeroY} fontSize={6} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">0</text>
        )}
        <text x={PAD.l - 2} y={H - PAD.b + 2}  fontSize={6} textAnchor="end" fill="#9ca3af">${yMin.toFixed(2)}</text>
      </svg>

      {/* QoQ / YoY 테이블 */}
      <div className="overflow-x-auto mt-1">
        <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th className="text-left px-1.5 py-0.5 text-gray-400 font-normal">분기</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">EPS</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">예상</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전분기比</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전년比</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((q, ri) => {
              const i = history.length - 1 - ri
              const qoq = calcChange(q.actual, history[i - 1]?.actual)
              const yoy = calcChange(q.actual, history[i - 4]?.actual)
              const qoqFmt = fmtChg(qoq)
              const yoyFmt = fmtChg(yoy)
              const beat = q.estimate !== null ? q.actual >= q.estimate : null
              return (
                <tr key={q.d} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td className="px-1.5 py-0.5 font-mono text-gray-500">{q.d.slice(2, 7)}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right font-semibold"
                    style={{ color: q.actual >= 0 ? '#15803d' : '#b91c1c' }}>
                    ${q.actual.toFixed(2)}
                  </td>
                  <td className="px-1.5 py-0.5 font-mono text-right text-gray-400">
                    {q.estimate != null ? `$${q.estimate.toFixed(2)}` : '─'}
                    {beat !== null && (
                      <span className="ml-0.5" style={{ color: beat ? '#15803d' : '#b91c1c' }}>
                        {beat ? '▲' : '▼'}
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: qoqFmt.color }}>{qoqFmt.text}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: yoyFmt.color }}>{yoyFmt.text}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// RevenueChart — 분기별 매출 바 차트 (최대 12Q)
//
// 단위: $B (십억 달러)
// 하단 테이블: $B값 + 전분기대비(QoQ) + 전년대비(YoY)
// ─────────────────────────────────────────

function RevenueChart({ eps }: { eps: EpsData }) {
  const history = eps.history.filter(q => q.revenue != null) as (EpsQuarter & { revenue: number })[]
  if (history.length < 2) return null

  const W = 400, H = 80
  const PAD = { l: 36, r: 8, t: 10, b: 22 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const vals   = history.map(q => q.revenue)
  const rawMax = Math.max(...vals)
  const rawMin = Math.min(...vals, 0)
  const pad    = Math.max((rawMax - rawMin) * 0.12, 0.1)
  const yMax   = rawMax + pad
  const yMin   = Math.max(0, rawMin - pad)
  const toY    = (v: number) => PAD.t + innerH * (1 - (v - yMin) / (yMax - yMin))
  const baseY  = toY(yMin)

  const gap  = innerW / history.length
  const barW = Math.max(5, gap * 0.55)

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">매출 (분기 / $B) ─ {history.length}Q</span>
      </div>

      {/* 바 차트 */}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '70px', display: 'block' }}>
        {history.map((q, i) => {
          const cx     = PAD.l + gap * i + gap / 2
          const topY   = toY(q.revenue)
          const barH   = Math.max(2, baseY - topY)
          const isGrow = i > 0 && q.revenue >= history[i - 1].revenue
          const fill   = isGrow ? 'rgba(59,130,246,0.65)' : 'rgba(156,163,175,0.55)'

          return (
            <g key={q.d}>
              <rect x={cx - barW / 2} y={topY} width={barW} height={barH} fill={fill} rx={1} />
              <text x={cx} y={H - 2} fontSize={5.5} textAnchor="middle" fill="#9ca3af">
                {q.d.slice(2, 7)}
              </text>
            </g>
          )
        })}

        <text x={PAD.l - 2} y={PAD.t + 4}     fontSize={6} textAnchor="end" fill="#9ca3af">{yMax.toFixed(1)}B</text>
        <text x={PAD.l - 2} y={H - PAD.b + 2}  fontSize={6} textAnchor="end" fill="#9ca3af">{yMin.toFixed(1)}B</text>
      </svg>

      {/* QoQ / YoY 테이블 */}
      <div className="overflow-x-auto mt-1">
        <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th className="text-left px-1.5 py-0.5 text-gray-400 font-normal">분기</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">매출($B)</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전분기比</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전년比</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((q, ri) => {
              const i = history.length - 1 - ri
              const qoq = calcChange(q.revenue, history[i - 1]?.revenue)
              const yoy = calcChange(q.revenue, history[i - 4]?.revenue)
              const qoqFmt = fmtChg(qoq)
              const yoyFmt = fmtChg(yoy)
              return (
                <tr key={q.d} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td className="px-1.5 py-0.5 font-mono text-gray-500">{q.d.slice(2, 7)}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right font-semibold text-blue-700">
                    ${q.revenue.toFixed(2)}B
                  </td>
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: qoqFmt.color }}>{qoqFmt.text}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: yoyFmt.color }}>{yoyFmt.text}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// StockCell
// ─────────────────────────────────────────

function StockCell({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  const net        = stock.breakdown.net_direction
  const colors     = getCellTextColor(net)
  const show52High = stock.highs?.w52 != null && stock.highs.w52 <= 10
  const show52Low  = stock.lows?.w52  != null && stock.lows.w52  <= 10

  return (
    <button
      onClick={onClick}
      title={`${stock.ticker} | MA100 대비 ${stock.data.ma_distance_pct >= 0 ? '+' : ''}${stock.data.ma_distance_pct.toFixed(1)}% | ${SIGNAL_KO[stock.signal]}`}
      className="relative flex flex-col items-center justify-center w-full transition-opacity hover:opacity-80 active:opacity-60 cursor-pointer select-none"
      style={{ background: getCellBg(net), height: '54px', gap: '1px' }}
    >
      {show52High && (
        <span className="absolute top-0.5 right-0.5 text-[8px] leading-none opacity-70" style={{ color: colors.sub }}>★</span>
      )}
      {!show52High && show52Low && (
        <span className="absolute top-0.5 right-0.5 text-[7px] leading-none opacity-60" style={{ color: colors.sub }}>▼</span>
      )}
      <span className="text-[10px] font-bold leading-none mono" style={{ color: colors.ticker }}>
        {stock.ticker}
      </span>
      <span className="text-[7px] leading-none mono" style={{ color: colors.sub }}>
        {stock.data.ma_distance_pct >= 0 ? '+' : ''}{stock.data.ma_distance_pct.toFixed(1)}%
      </span>
      <span className="text-[7px] leading-none" style={{ color: colors.sub, opacity: 0.8 }}>
        {STAGE_ABBR[stock.stage] ?? ''}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────
// SectorBlock
// ─────────────────────────────────────────

function SectorBlock({
  sector, onSelectStock, onSelectSector,
}: {
  sector:         SectorItem
  onSelectStock:  (stock: StockItem, sectorEtf: string, sectorName: string, sectorStocks: StockItem[]) => void
  onSelectSector: (sector: SectorItem) => void
}) {
  const rs = sector.sector_rs_excess
  const rsPositive = rs !== null && rs > 0

  return (
    <div className="overflow-hidden" style={{ borderRight: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)', background: 'var(--surface)' }}>
      {/* 섹터 헤더 */}
      {sector.etf === 'SPY' ? (
        <button
          onClick={() => onSelectSector(sector)}
          className="w-full flex items-center justify-between px-3 py-2 transition-colors cursor-pointer"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--hairline)' }}
          title="미국 시장 기준 (SPY)"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* 미국 국기 SVG */}
            <svg width="16" height="11" viewBox="0 0 18 12" style={{ flexShrink: 0, opacity: 0.85 }}>
              {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                <rect key={i} x="0" y={i * 12/13} width="18" height={12/13 + 0.1} fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
              ))}
              <rect x="0" y="0" width="7.2" height={12 * 7/13} fill="#3C3B6E" />
              {[0,1,2,3,4,1,2,3,4,0].map((col, i) => {
                const row = Math.floor(i / 5)
                return <circle key={i} cx={1.2 + col * 1.4 + (row % 2 === 1 ? 0.7 : 0)} cy={1.1 + row * 1.6} r="0.55" fill="white" />
              })}
            </svg>
            <span className="text-[10px] font-bold truncate" style={{ color: 'var(--ink)' }}>시장 SPY</span>
          </div>
          <span className="text-[11px] font-bold mono" style={{ color: 'var(--ink-mute)' }}>
            = 0
          </span>
        </button>
      ) : (
        <button
          onClick={() => onSelectSector(sector)}
          className="w-full flex items-center justify-between px-3 py-2 transition-colors cursor-pointer"
          style={{ background: 'var(--surface)', borderBottom: '1px solid var(--hairline)' }}
          title={`${sector.name} (${sector.etf}) — SPY 대비 60일 초과수익 ${rs !== null ? (rs >= 0 ? '+' : '') + rs.toFixed(2) + '%' : 'N/A'}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[10px] font-bold truncate" style={{ color: 'var(--ink)' }}>{sector.name}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-1">
            {rs !== null && (
              <span
                className="text-[11px] font-bold mono"
                style={{ color: rsPositive ? 'var(--up-text)' : 'var(--down-text)' }}
              >
                {rsPositive ? '▲' : '▼'}{Math.abs(rs).toFixed(1)}%
              </span>
            )}
            {sector.sector_rs_slope_dir !== 'flat' && sector.sector_rs_slope_days > 0 && (
              <span
                className="text-[10px] font-bold mono"
                style={{ color: sector.sector_rs_slope_dir === 'up' ? 'var(--up-text)' : 'var(--down-text)' }}
              >
                {sector.sector_rs_slope_dir === 'up' ? '↗' : '↘'} {sector.sector_rs_slope_days}d
              </span>
            )}
          </div>
        </button>
      )}

      {/* 종목 그리드 */}
      <div className="grid grid-cols-5" style={{ gap: '1px', padding: '1px', background: 'var(--hairline)' }}>
        {sector.stocks.map(stock => (
          <StockCell key={stock.ticker} stock={stock} onClick={() => onSelectStock(stock, sector.etf, sector.name, sector.stocks)} />
        ))}
        {Array.from({ length: Math.max(0, 15 - sector.stocks.length) }).map((_, i) => (
          <div key={i} style={{ height: '54px', background: 'var(--surface)' }} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// StockDetailModal
// ─────────────────────────────────────────

function StockDetailModal({
  stock, sectorEtf, sectorName, onClose, userId, savedTickers, onSaved,
  onPrev, onNext, hasPrev, hasNext,
}: {
  stock: StockItem
  sectorEtf: string
  sectorName: string
  onClose: () => void
  userId: string | null
  savedTickers: Set<string>
  onSaved: (ticker: string) => void
  onPrev: () => void
  onNext: () => void
  hasPrev: boolean
  hasNext: boolean
}) {
  const { breakdown: b, data: d } = stock
  const net        = b.net_direction
  const netPct     = Math.min(100, Math.abs(net))
  const isLongSide = net >= 0

  // 섹션별 on/off 토글
  const [show, setShow] = useState({ rs: true, eps: true, revenue: true, cards: true })
  const toggle = (key: keyof typeof show) => setShow(prev => ({ ...prev, [key]: !prev[key] }))

  // 풀스크린
  const [fullscreen, setFullscreen] = useState(false)

  // 키보드 좌우 화살표 네비게이션
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft')  { e.preventDefault(); if (hasPrev) onPrev() }
      if (e.key === 'ArrowRight') { e.preventDefault(); if (hasNext) onNext() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [hasPrev, hasNext, onPrev, onNext])

  // ⭐ 관심종목 저장
  const [saving, setSaving] = useState(false)
  const isSaved = savedTickers.has(stock.ticker)

  const handleStar = async () => {
    if (!userId || isSaved || saving) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('personal_watchlist').insert({
      user_id: userId,
      ticker: stock.ticker,
      name: KOREAN_NAMES[stock.ticker] || null,
      sector: sectorName || sectorEtf,
    })
    onSaved(stock.ticker)
    setSaving(false)
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center ${fullscreen ? 'p-0' : 'p-2 sm:p-4'}`}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />

      {/* 좌우 화살표 네비게이션 */}
      {hasPrev && !fullscreen && (
        <button
          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 shadow-lg text-gray-700 hover:bg-white hover:text-black transition-all"
          onClick={e => { e.stopPropagation(); onPrev() }}
          title="이전 종목 (←)"
        >
          ‹
        </button>
      )}
      {hasNext && !fullscreen && (
        <button
          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 shadow-lg text-gray-700 hover:bg-white hover:text-black transition-all"
          onClick={e => { e.stopPropagation(); onNext() }}
          title="다음 종목 (→)"
        >
          ›
        </button>
      )}

      <div
        className={`relative bg-white border border-gray-200 shadow-2xl w-full overflow-hidden flex flex-col ${fullscreen ? 'rounded-none' : 'rounded-2xl'}`}
        style={fullscreen ? { maxWidth: '100vw', maxHeight: '100vh', height: '100vh' } : { maxWidth: '800px', maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl font-bold text-gray-900">{stock.ticker}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {STAGE_ABBR[stock.stage]} {stock.stage}
            </span>
            <span className="text-sm text-gray-500">{SIGNAL_KO[stock.signal]}</span>
            {/* net_direction: + = 롱 강도, - = 숏 강도 */}
            <span
              className="text-sm font-bold ml-1"
              style={{ color: isLongSide ? '#15803d' : '#b91c1c' }}
            >
              net {net >= 0 ? '+' : ''}{net.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">MA 5·20·50·100·150</span>
            <button
              onClick={() => setFullscreen(v => !v)}
              title={fullscreen ? '작게 보기' : '전체화면으로 크게 보기'}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none transition-colors"
            >
              {fullscreen ? '⊡' : '⤢'}
            </button>
            {userId && (
              <button
                onClick={handleStar}
                disabled={isSaved || saving}
                title={isSaved ? '관심종목에 저장됨' : '관심종목에 추가'}
                className={`text-xl leading-none transition-all ${
                  isSaved ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'
                } disabled:cursor-default`}
              >
                {isSaved ? '⭐' : '☆'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* 신고가/신저가 뱃지 행 (풀스크린에서는 숨김) */}
        {!fullscreen && (stock.highs?.w52 != null || stock.highs?.w26 != null || stock.highs?.w13 != null ||
          stock.lows?.w52  != null || stock.lows?.w26  != null || stock.lows?.w13  != null) && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50">
            {stock.highs?.w52 != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                ⭐ 52주 신고가 {stock.highs.w52}일 전
              </span>
            )}
            {stock.highs?.w26 != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                ✨ 26주 신고가 {stock.highs.w26}일 전
              </span>
            )}
            {stock.highs?.w13 != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">
                🔔 13주 신고가 {stock.highs.w13}일 전
              </span>
            )}
            {stock.lows?.w52 != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                📉 52주 신저가 {stock.lows.w52}일 전
              </span>
            )}
            {stock.lows?.w26 != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                📉 26주 신저가 {stock.lows.w26}일 전
              </span>
            )}
            {stock.lows?.w13 != null && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">
                📉 13주 신저가 {stock.lows.w13}일 전
              </span>
            )}
          </div>
        )}

        {/* TradingView 가격 차트 (풀스크린에서는 숨김) */}
        {!fullscreen && (
          <div style={{ height: '300px', flexShrink: 0 }}>
            <TradingViewChart key={stock.ticker} symbol={stock.ticker} height={300} />
          </div>
        )}

        {/* 섹션 토글 바 (풀스크린에서는 숨김) */}
        {!fullscreen && <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50">
          {([
            { key: 'rs',      label: 'RS 차트' },
            { key: 'eps',     label: 'EPS' },
            { key: 'revenue', label: '매출' },
            { key: 'cards',   label: '수치카드' },
          ] as { key: keyof typeof show; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="text-[10px] px-2 py-0.5 rounded-full border transition-colors"
              style={{
                background:   show[key] ? '#1f2937' : '#fff',
                color:        show[key] ? '#fff'    : '#9ca3af',
                borderColor:  show[key] ? '#1f2937' : '#e5e7eb',
              }}
            >
              {label}
            </button>
          ))}
        </div>}

        {/* 스크롤 영역 */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${fullscreen ? 'p-6' : 'p-4'}`}>

          {fullscreen ? (
            /* 풀스크린: 세로 단일 컬럼, 가운데 정렬 */
            <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto">
              {stock.rs_spy_line && stock.rs_spy_line.length >= 3 && (
                <div className="w-full">
                  <RSLineChart data={stock.rs_spy_line} label="vs SPY (1년)" uid={`spy-fs-${stock.ticker}`} />
                </div>
              )}
              {stock.rs_sector_line && stock.rs_sector_line.length >= 3 && (
                <div className="w-full">
                  <RSLineChart data={stock.rs_sector_line} label={`vs ${sectorEtf} (1년)`} uid={`etf-fs-${stock.ticker}`} />
                </div>
              )}
              {stock.eps && <div className="w-full"><EPSChart eps={stock.eps} /></div>}
              {stock.eps && <div className="w-full"><RevenueChart eps={stock.eps} /></div>}
              <div className="w-full grid grid-cols-2 gap-3 text-xs">
                {[
                  {
                    t: '섹터 RS vs SPY (60일)',
                    v: d.sector_rs_excess != null ? `${d.sector_rs_excess >= 0 ? '+' : ''}${d.sector_rs_excess.toFixed(2)}%` : 'N/A',
                    s: '섹터 ETF 60일 초과수익률',
                    c: (d.sector_rs_excess ?? 0) >= 0 ? '#15803d' : '#b91c1c',
                  },
                  {
                    t: 'RS 기울기 (20MA)',
                    v: d.rs_slope_dir === 'up' ? '↗ 상향' : d.rs_slope_dir === 'down' ? '↘ 하향' : '→ 보합',
                    s: d.rs_slope_days > 0 ? `${d.rs_slope_days}일째 유지` : '-',
                    c: d.rs_slope_dir === 'up' ? '#15803d' : d.rs_slope_dir === 'down' ? '#b91c1c' : '#6b7280',
                  },
                ].map(card => (
                  <div key={card.t} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <div className="text-gray-400 text-[10px] mb-1">{card.t}</div>
                    <div className="font-bold font-mono text-sm" style={{ color: card.c }}>{card.v}</div>
                    {card.s && <div className="text-gray-400 text-[9px] mt-0.5">{card.s}</div>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
          {/* RS LINE 차트 */}
          {show.rs && (
            <>
              {stock.rs_spy_line && stock.rs_spy_line.length >= 3 && (
                <RSLineChart data={stock.rs_spy_line} label="vs SPY (1년)" uid={`spy-${stock.ticker}`} />
              )}
              {stock.rs_sector_line && stock.rs_sector_line.length >= 3 && (
                <RSLineChart data={stock.rs_sector_line} label={`vs ${sectorEtf} (1년)`} uid={`etf-${stock.ticker}`} />
              )}
            </>
          )}

          {/* EPS 서프라이즈 차트 + 테이블 */}
          {show.eps && stock.eps && <EPSChart eps={stock.eps} />}

          {/* 매출 차트 + 테이블 */}
          {show.revenue && stock.eps && <RevenueChart eps={stock.eps} />}


          {/* 수치 카드 */}
          {show.cards && <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              {
                t: '섹터 RS vs SPY (60일)',
                v: d.sector_rs_excess != null
                  ? `${d.sector_rs_excess >= 0 ? '+' : ''}${d.sector_rs_excess.toFixed(2)}%`
                  : 'N/A',
                s: '섹터 ETF의 60일 초과수익률',
                c: (d.sector_rs_excess ?? 0) >= 0 ? '#15803d' : '#b91c1c',
              },
              {
                t: 'RS 기울기 (20MA)',
                v: d.rs_slope_dir === 'up' ? '↗ 상향' : d.rs_slope_dir === 'down' ? '↘ 하향' : '→ 보합',
                s: d.rs_slope_days > 0 ? `${d.rs_slope_days}일째 유지` : '-',
                c: d.rs_slope_dir === 'up' ? '#15803d' : d.rs_slope_dir === 'down' ? '#b91c1c' : '#6b7280',
              },
            ].map(card => (
              <div key={card.t} className="bg-gray-50 border border-gray-100 rounded-lg p-2.5">
                <div className="text-gray-400 mb-0.5">{card.t}</div>
                <div className="font-semibold font-mono" style={{ color: card.c }}>{card.v}</div>
                {card.s && <div className="text-gray-400 text-[9px]">{card.s}</div>}
              </div>
            ))}
          </div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// SectorChartModal
// ─────────────────────────────────────────

function SectorChartModal({ sector, onClose }: { sector: SectorItem; onClose: () => void }) {
  const rs = sector.sector_rs_excess
  const rsPositive = rs !== null && rs > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: '800px', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">{sector.emoji}</span>
            <span className="font-bold text-gray-900">{sector.name}</span>
            <span className="text-sm text-gray-400">{sector.etf}</span>
            {rs !== null && (
              <span className="text-xs font-mono font-bold" style={{ color: rsPositive ? '#15803d' : '#b91c1c' }}>
                {rsPositive ? '▲' : '▼'} {Math.abs(rs).toFixed(2)}% vs SPY
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">MA 5·20·50·100·150</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* 섹터 RS 추이 그래프 */}
        {sector.sector_rs_history && sector.sector_rs_history.length >= 3 && (
          <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50">
            <RSSparkline
              data={sector.sector_rs_history}
              label={`${sector.etf} RS vs SPY  (섹터 60일 초과수익률,  최근 ${sector.sector_rs_history.length}거래일)`}
              uid={`sec-${sector.etf}`}
            />
          </div>
        )}

        {/* TradingView ETF 가격 차트 */}
        <div style={{ height: '430px' }}>
          <TradingViewChart symbol={sector.etf} height={430} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 도움말 내용 (읽는 법 + 점수 구성)
// ─────────────────────────────────────────

const HELP_HOW_TO_READ = [
  { color: 'var(--g3)', text: '초록 — 시장보다 강한 종목' },
  { color: 'var(--r3)', text: '빨강 — 시장보다 약한 종목' },
]

// ─────────────────────────────────────────
// BottomUp — 신고가/신저가 필터 뷰
// ─────────────────────────────────────────

type HLFilter =
  | 'break52' | 'break26' | 'break13'  // 신고가 돌파 직후 (≤5일) — 지금 막 뚫은 종목
  | 'hold52'  | 'hold26'               // 돌파 유지 (≤60일 달성 + 고점 7% 이내)
  | 'near52'  | 'near26'               // 고가 근접 (7% 이내, 시점 무관)
  | 'low52'   | 'low26'   | 'low13'   // 신저가 달성 (10일 이내)

type HLResult = { value: number; isNear: boolean }

const HL_DEFS: { key: HLFilter; label: string; isHigh: boolean }[] = [
  { key: 'break52', label: '🔥 52주 신고가 돌파 10일↓', isHigh: true  },
  { key: 'break26', label: '🔥 26주 신고가 돌파 10일↓', isHigh: true  },
  { key: 'break13', label: '🔔 13주 신고가 돌파 10일↓', isHigh: true  },
  { key: 'hold52',  label: '📈 52주 고가 유지 60일↓',   isHigh: true  },
  { key: 'hold26',  label: '📈 26주 고가 유지 60일↓',   isHigh: true  },
  { key: 'near52',  label: '🎯 52주 고가 근접 7%↑',     isHigh: true  },
  { key: 'near26',  label: '🎯 26주 고가 근접 7%↑',     isHigh: true  },
  { key: 'low52',   label: '📉 52주 신저가 10일↓',      isHigh: false },
  { key: 'low26',   label: '📉 26주 신저가 10일↓',      isHigh: false },
  { key: 'low13',   label: '📉 13주 신저가 10일↓',      isHigh: false },
]

function getHLResult(stock: StockItem, f: HLFilter): HLResult | null {
  const BREAK_DAYS = 10
  const HOLD_DAYS  = 60
  const HOLD_PCT   = 7.0
  const NEAR_PCT   = 7.0
  const LOW_DAYS   = 10
  switch (f) {
    // breakout_onsets = 이번 스트릭 시작일 (고공행진 중이면 큰 값, 방금 첫 돌파면 작은 값)
    case 'break52': { const d = stock.breakout_onsets?.w52 ?? null; return d != null && d <= BREAK_DAYS ? { value: d, isNear: false } : null }
    case 'break26': { const d = stock.breakout_onsets?.w26 ?? null; return d != null && d <= BREAK_DAYS ? { value: d, isNear: false } : null }
    case 'break13': { const d = stock.breakout_onsets?.w13 ?? null; return d != null && d <= BREAK_DAYS ? { value: d, isNear: false } : null }
    case 'hold52': {
      const d = stock.highs?.w52 ?? null
      const p = stock.near_highs?.w52 ?? null
      return d != null && d <= HOLD_DAYS && p != null && p <= HOLD_PCT ? { value: d, isNear: false } : null
    }
    case 'hold26': {
      const d = stock.highs?.w26 ?? null
      const p = stock.near_highs?.w26 ?? null
      return d != null && d <= HOLD_DAYS && p != null && p <= HOLD_PCT ? { value: d, isNear: false } : null
    }
    case 'near52': { const p = stock.near_highs?.w52 ?? null; return p != null && p <= NEAR_PCT ? { value: p, isNear: true  } : null }
    case 'near26': { const p = stock.near_highs?.w26 ?? null; return p != null && p <= NEAR_PCT ? { value: p, isNear: true  } : null }
    case 'low52':  { const d = stock.lows?.w52 ?? null; return d != null && d <= LOW_DAYS ? { value: d, isNear: false } : null }
    case 'low26':  { const d = stock.lows?.w26 ?? null; return d != null && d <= LOW_DAYS ? { value: d, isNear: false } : null }
    case 'low13':  { const d = stock.lows?.w13 ?? null; return d != null && d <= LOW_DAYS ? { value: d, isNear: false } : null }
  }
}

// 더 높은 우선순위 필터에도 해당하면 true → 하위 필터에서 중복 제외
// break52 > break26 > break13 > hold52 > hold26 > near52 > near26 / low52 > low26 > low13
function isDominated(stock: StockItem, f: HLFilter): boolean {
  switch (f) {
    case 'break26': return getHLResult(stock, 'break52') !== null
    case 'break13': return getHLResult(stock, 'break52') !== null || getHLResult(stock, 'break26') !== null
    case 'hold52':  return getHLResult(stock, 'break52') !== null
    case 'hold26':  return getHLResult(stock, 'break52') !== null || getHLResult(stock, 'break26') !== null || getHLResult(stock, 'hold52') !== null
    case 'near52':  return getHLResult(stock, 'break52') !== null || getHLResult(stock, 'hold52') !== null
    case 'near26':  return getHLResult(stock, 'break52') !== null || getHLResult(stock, 'break26') !== null || getHLResult(stock, 'hold52') !== null || getHLResult(stock, 'hold26') !== null || getHLResult(stock, 'near52') !== null
    case 'low26':   return getHLResult(stock, 'low52') !== null
    case 'low13':   return getHLResult(stock, 'low52') !== null || getHLResult(stock, 'low26') !== null
    default:        return false
  }
}

function BottomUpView({
  sectors, hlFilter, onSelectStock,
}: {
  sectors:       SectorItem[]
  hlFilter:      HLFilter
  onSelectStock: (stock: StockItem, sectorEtf: string, sectorName: string, sectorStocks: StockItem[]) => void
}) {
  const def    = HL_DEFS.find(d => d.key === hlFilter)!
  const isHigh = def.isHigh

  const items = sectors
    .flatMap(sec => sec.stocks.map(stock => ({ stock, sec, result: getHLResult(stock, hlFilter) })))
    .filter(({ result, stock }) => result !== null && !isDominated(stock, hlFilter))
    .sort((a, b) => a.result!.value - b.result!.value)

  if (items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
        해당 조건의 종목 없음
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 mt-2">
      {items.map(({ stock, sec, result }) => {
        const net    = stock.breakdown.net_direction
        const colors = getCellTextColor(net)
        const badge  = result!.isNear
          ? `-${result!.value.toFixed(1)}%`
          : `${result!.value}일 전`
        return (
          <button
            key={`${sec.id}-${stock.ticker}`}
            onClick={() => onSelectStock(stock, sec.etf, sec.name, sec.stocks)}
            className="flex flex-col items-center justify-center gap-0.5 p-1.5 rounded hover:opacity-80 active:opacity-60 transition-opacity cursor-pointer"
            style={{ background: getCellBg(net), height: '68px' }}
          >
            <span className="text-[10px] font-bold leading-none" style={{ color: colors.ticker }}>{stock.ticker}</span>
            <span className="text-[7px] leading-none" style={{ color: colors.sub }}>{sec.name}</span>
            <span className="text-[9px] font-bold leading-none" style={{ color: isHigh ? colors.ticker : colors.ticker }}>
              {badge}
            </span>
            <span className="text-[7px] font-mono leading-none" style={{ color: colors.sub }}>
              {stock.data.ma_distance_pct >= 0 ? '+' : ''}{stock.data.ma_distance_pct.toFixed(1)}%
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

// ─────────────────────────────────────────
// 섹터 순위 — 랭킹 리스트 + 변동 뱃지 (범프차트 대체)
// ─────────────────────────────────────────

function SectorRankingList({ sectors }: { sectors: SectorItem[] }) {
  const [days, setDays] = useState<20 | 30 | 60>(20)

  const active = sectors.filter(s => s.etf !== 'SPY')
  const histLen = active[0]?.sector_rs_history.length ?? 0
  const backIdx = Math.max(0, histLen - 1 - days)

  const rows = active.map(s => {
    const h = s.sector_rs_history
    const now = h.length ? h[h.length - 1].v : (s.sector_rs_excess ?? 0)
    const then = h.length > backIdx ? h[backIdx].v : now
    return { s, now, then }
  })

  const byNow = [...rows].sort((a, b) => b.now - a.now)
  const byThen = [...rows].sort((a, b) => b.then - a.then)
  const rankThen = new Map(byThen.map((r, i) => [r.s.etf, i + 1]))
  const maxAbs = Math.max(...rows.map(r => Math.abs(r.now)), 5)

  return (
    <div className="mt-2">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[11px] font-semibold mr-1" style={{ color: 'var(--ink-mute)' }}>기간</span>
        {([20, 30, 60] as const).map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className="px-2.5 py-1 text-xs font-semibold transition-all"
            style={{
              background: days === d ? 'var(--accent)' : 'transparent',
              color: days === d ? '#fff' : 'var(--ink-mute)',
              border: `1px solid ${days === d ? 'var(--accent)' : 'var(--hairline)'}`,
            }}
          >
            {d}일
          </button>
        ))}
        <span className="ml-auto text-[10px]" style={{ color: 'var(--ink-mute)' }}>▲▼ = {days}일 전 대비 순위</span>
      </div>

      <div style={{ border: '1px solid var(--hairline)' }}>
        {byNow.map((r, i) => {
          const curRank = i + 1
          const prevRank = rankThen.get(r.s.etf) ?? curRank
          const delta = prevRank - curRank
          const pos = r.now >= 0
          const w = Math.min(50, (Math.abs(r.now) / maxAbs) * 50)
          return (
            <div
              key={r.s.etf}
              className="flex items-center gap-2 px-2.5 py-2"
              style={{ borderBottom: i === byNow.length - 1 ? 'none' : '1px solid var(--hairline)' }}
            >
              <span className="mono text-xs w-5 text-right shrink-0" style={{ color: curRank <= 3 ? 'var(--ink)' : 'var(--ink-mute)', fontWeight: curRank <= 3 ? 700 : 400 }}>{curRank}</span>
              <span className="text-sm shrink-0">{r.s.emoji}</span>
              <span className="text-xs font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--ink)' }}>{r.s.name}</span>

              <div className="relative h-2.5 hidden sm:block shrink-0" style={{ width: 140 }}>
                <div className="absolute inset-y-0" style={{ left: '50%', width: 1, background: 'var(--hairline-2)' }} />
                <div
                  className="absolute inset-y-0"
                  style={{ background: pos ? 'var(--g3)' : 'var(--r3)', left: pos ? '50%' : `${50 - w}%`, width: `${w}%` }}
                />
              </div>

              <span className="mono text-xs w-16 text-right shrink-0" style={{ color: pos ? 'var(--up-text)' : 'var(--down-text)' }}>
                {pos ? '+' : ''}{r.now.toFixed(1)}%
              </span>
              <span
                className="mono text-[11px] w-9 text-right font-bold shrink-0"
                style={{ color: delta > 0 ? 'var(--up-text)' : delta < 0 ? 'var(--down-text)' : 'var(--ink-mute)' }}
              >
                {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${-delta}` : '─'}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
        RS = 섹터 ETF의 SPY 대비 60일 초과수익률. 강할수록 위. 색 막대는 SPY 대비 강도(±).
      </p>
    </div>
  )
}

// ─────────────────────────────────────────
// 섹터 vs 섹터 — RS 라인 비교 차트
// ─────────────────────────────────────────

const CMP_A = '#d98a2b'  // 왼쪽 섹터 (앰버 — 흑/백 배경 모두 가독)
const CMP_B = '#4a90c4'  // 오른쪽 섹터 (스틸블루)

function SectorCompareChart({ a, b }: { a: SectorItem; b: SectorItem }) {
  const sa = a.sector_rs_history ?? []
  const sb = b.sector_rs_history ?? []
  const n = Math.min(sa.length, sb.length)
  if (n < 3) return (
    <div className="py-8 text-center text-xs" style={{ color: 'var(--ink-mute)' }}>비교할 추이 데이터가 부족합니다</div>
  )
  const A = sa.slice(-n)
  const B = sb.slice(-n)
  const dates = A.map(d => d.d)

  const W = 640, H = 240
  const PAD = { l: 42, r: 96, t: 14, b: 24 }
  const iW = W - PAD.l - PAD.r
  const iH = H - PAD.t - PAD.b

  const vals = [...A.map(d => d.v), ...B.map(d => d.v), 0]
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const pad = (hi - lo) * 0.12 || 1
  const yMin = lo - pad
  const yMax = hi + pad

  const xS = (i: number) => PAD.l + (i / (n - 1)) * iW
  const yS = (v: number) => PAD.t + iH * (1 - (v - yMin) / (yMax - yMin))

  const pathOf = (arr: RSPoint[]) =>
    arr.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ')

  const lastA = A[A.length - 1].v
  const lastB = B[B.length - 1].v

  const gridV = [yMin, (yMin + yMax) / 2, yMax]

  return (
    <div>
      <div className="flex items-center gap-4 mb-2 text-[11px] font-semibold flex-wrap">
        <span className="flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
          <span style={{ width: 10, height: 3, background: CMP_A, display: 'inline-block', borderRadius: 2 }} />
          {a.emoji} {a.name}
          <span className="mono" style={{ color: lastA >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>{lastA >= 0 ? '+' : ''}{lastA.toFixed(1)}%</span>
        </span>
        <span className="flex items-center gap-1.5" style={{ color: 'var(--ink)' }}>
          <span style={{ width: 10, height: 3, background: CMP_B, display: 'inline-block', borderRadius: 2 }} />
          {b.emoji} {b.name}
          <span className="mono" style={{ color: lastB >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>{lastB >= 0 ? '+' : ''}{lastB.toFixed(1)}%</span>
        </span>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 420, height: 240, display: 'block' }}>
          {gridV.map((v, i) => (
            <g key={i}>
              <line x1={PAD.l} x2={W - PAD.r} y1={yS(v)} y2={yS(v)} stroke="var(--hairline)" strokeWidth={1} strokeDasharray={Math.abs(v) < 1e-6 ? undefined : '3,3'} />
              <text x={PAD.l - 6} y={yS(v)} fontSize={9} textAnchor="end" dominantBaseline="middle" fill="var(--ink-mute)" className="mono">
                {v >= 0 ? '+' : ''}{v.toFixed(0)}%
              </text>
            </g>
          ))}
          {/* 0선 강조 */}
          {yMin < 0 && yMax > 0 && (
            <line x1={PAD.l} x2={W - PAD.r} y1={yS(0)} y2={yS(0)} stroke="var(--hairline-2)" strokeWidth={1.4} />
          )}

          {[0, Math.floor(n / 2), n - 1].map(i => (
            <text key={i} x={xS(i)} y={H - 8} fontSize={9} textAnchor="middle" fill="var(--ink-mute)" className="mono">
              {dates[i]?.slice(5)}
            </text>
          ))}

          <path d={pathOf(A)} fill="none" stroke={CMP_A} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <path d={pathOf(B)} fill="none" stroke={CMP_B} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          <circle cx={xS(n - 1)} cy={yS(lastA)} r={3} fill={CMP_A} />
          <circle cx={xS(n - 1)} cy={yS(lastB)} r={3} fill={CMP_B} />
          <text x={W - PAD.r + 8} y={yS(lastA)} fontSize={10} dominantBaseline="middle" fill={CMP_A} fontWeight={700}>{a.emoji}</text>
          <text x={W - PAD.r + 8} y={yS(lastB)} fontSize={10} dominantBaseline="middle" fill={CMP_B} fontWeight={700}>{b.emoji}</text>
        </svg>
      </div>
      <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-mute)' }}>세로축 = SPY 대비 60일 초과수익률(%). 위일수록 시장보다 강함.</p>
    </div>
  )
}



export default function WatchlistClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [data,               setData]              = useState<WatchlistData | null>(null)
  const [loading,            setLoading]           = useState(true)
  const [selectedStock,      setSelectedStock]     = useState<StockItem | null>(null)
  const [selectedSectorEtf,  setSelectedSectorEtf] = useState<string>('')
  const [selectedSectorName, setSelectedSectorName] = useState<string>('')
  const [selectedSector,     setSelectedSector]    = useState<SectorItem | null>(null)
  const [navStocks,          setNavStocks]         = useState<StockItem[]>([])
  const [viewMode,           setViewMode]          = useState<'topdown' | 'bottomup' | 'compare' | 'ranking'>('topdown')
  const [hlFilter,           setHlFilter]          = useState<HLFilter>('break52')
  const [showHelp,           setShowHelp]          = useState(false)
  const [userId,             setUserId]            = useState<string | null>(null)
  const [savedTickers,       setSavedTickers]      = useState<Set<string>>(new Set())
  const [compareLeft,        setCompareLeft]       = useState<SectorItem | null>(null)
  const [compareRight,       setCompareRight]      = useState<SectorItem | null>(null)
  const [captureMode,        setCaptureMode]       = useState(false)

  useEffect(() => {
    try { setCaptureMode(localStorage.getItem('reant_wl_capture') === '1') } catch {}
  }, [])
  const toggleCapture = () => setCaptureMode(v => {
    const n = !v
    try { localStorage.setItem('reant_wl_capture', n ? '1' : '0') } catch {}
    return n
  })

  useEffect(() => {
    const CACHE_KEY = 'watchlist_us_cache'
    fetch('/data/watchlist.json', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: WatchlistData) => {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)) } catch {}
        setData(d)
        setLoading(false)
      })
      .catch((e) => {
        console.error('watchlist 로드 실패:', e)
        try {
          const cached = localStorage.getItem(CACHE_KEY)
          if (cached) setData(JSON.parse(cached))
        } catch {}
        setLoading(false)
      })
  }, [])

  // URL ?stock=TICKER 파라미터로 자동 모달 오픈
  useEffect(() => {
    if (!data) return
    const ticker = searchParams.get('stock')
    if (!ticker) return
    const upper = ticker.toUpperCase()
    const sector = data.sectors.find(s => s.stocks.some(st => st.ticker === upper))
    const stock  = sector?.stocks.find(st => st.ticker === upper)
    if (stock && sector) {
      setSelectedStock(stock)
      setSelectedSectorEtf(sector.etf)
      setSelectedSectorName(sector.name)
      setNavStocks(sector.stocks)
    }
  }, [data, searchParams])

  // 로그인 유저 + 저장된 관심종목 조회
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('personal_watchlist')
        .select('ticker')
        .eq('user_id', user.id)
        .then(({ data }) => {
          if (data) setSavedTickers(new Set(data.map((r: { ticker: string }) => r.ticker)))
        })
    })
  }, [])

  const handleSaved = useCallback((ticker: string) => {
    setSavedTickers(prev => new Set([...prev, ticker]))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-32 text-gray-400 text-sm mono">
      분석 데이터 로딩 중...
    </div>
  )

  if (!data) return (
    <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
      데이터 없음 — 스크립트를 먼저 실행해 주세요.
    </div>
  )

  setCapturePalette(captureMode)

  const mc        = data.market_context
  const allStocks = data.sectors.flatMap(s => s.stocks)
  const counts = {
    long:  allStocks.filter(s => s.data.rs_excess_pct !== null && s.data.rs_excess_pct > 0).length,
    short: allStocks.filter(s => s.data.rs_excess_pct !== null && s.data.rs_excess_pct < 0).length,
  }

  const handleSelectStock = (stock: StockItem, etf: string, sectorName: string, sectorStocks?: StockItem[]) => {
    setSelectedStock(stock)
    setSelectedSectorEtf(etf)
    setSelectedSectorName(sectorName)
    if (sectorStocks) setNavStocks(sectorStocks)
  }

  const handleSelectSector = (sector: SectorItem) => {
    if (viewMode === 'compare') {
      if (sector.etf !== 'SPY') setCompareRight(sector)
      return
    }
    setSelectedSector(sector)
  }

  return (
    <div className={captureMode ? 'capture-mode' : undefined} style={captureMode ? { background: 'var(--surface)', margin: '-1rem -1rem 0', padding: '1rem 1rem 2rem', minHeight: '100vh' } : undefined}>
      {/* ── 캡처 모드 토글 (유튜브 자료용) ── */}
      <div className="flex justify-end mb-2">
        <button
          onClick={toggleCapture}
          className="text-[11px] font-semibold px-2.5 py-1 transition-colors"
          style={{
            border: '1px solid var(--hairline)',
            background: captureMode ? 'var(--accent)' : 'transparent',
            color: captureMode ? '#fff' : 'var(--ink-mute)',
          }}
        >
          {captureMode ? '● 캡처 모드' : '○ 캡처 모드'}
        </button>
      </div>
      {/* ── 시장 전환 버튼 ── */}
      <div className="flex mb-3" style={{ border: '1px solid var(--hairline)' }}>
        <button
          onClick={() => router.push('/watchlist-kr')}
          className="flex-1 py-2 text-[13px] font-medium transition-colors"
          style={{ color: 'var(--ink-mute)', borderRight: '1px solid var(--hairline)' }}
        >
          코스피
        </button>
        <button className="flex-1 py-2 text-[13px] font-bold" style={{ background: 'var(--accent)', color: '#fff' }}>
          나스닥
        </button>
      </div>

      {/* ── 상단 요약 카드 ── */}
      <div className="mb-4 pb-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 4 }}>
        {/* 두 핵심 지표 */}
        {(() => {
          const total = counts.long + counts.short
          const bullPct = total > 0 ? Math.round((counts.long / total) * 100) : 50
          return (
            <div className="px-5 pt-4 pb-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <p className="text-sm mb-2 text-center" style={{ color: 'var(--ink-mute)' }}>S&amp;P 500 대비 종목 강도</p>
              <div className="flex items-center justify-center gap-3 mono">
                <p className="text-[26px] font-bold" style={{ color: 'var(--up-text)' }}>{counts.long}</p>
                <span className="font-light text-xl" style={{ color: 'var(--hairline-2)' }}>/</span>
                <p className="text-[26px] font-bold" style={{ color: 'var(--down-text)' }}>{counts.short}</p>
              </div>
              <div className="flex h-1 mt-2.5 mx-auto" style={{ maxWidth: 320 }}>
                <div className="h-full transition-all" style={{ width: `${bullPct}%`, background: 'var(--g3)' }} />
                <div className="h-full flex-1" style={{ background: 'var(--r3)' }} />
              </div>
            </div>
          )
        })()}

        {/* 뷰 모드 토글 + 도움말 */}
        <div className="flex items-center justify-between px-5 pt-3">
          <div className="flex gap-4">
            {([
              ['topdown', '탑다운'],
              ['bottomup', '바텀업'],
              ['compare', '비교'],
              ['ranking', '순위'],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => {
                  if (mode === 'compare') setCompareRight(null)
                  setViewMode(mode)
                }}
                className="text-xs pb-1.5 border-b-2 transition-colors"
                style={{
                  color: viewMode === mode ? 'var(--ink)' : 'var(--ink-mute)',
                  borderColor: viewMode === mode ? 'var(--accent)' : 'transparent',
                  fontWeight: viewMode === mode ? 600 : 500,
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="text-[11px] transition-colors"
            style={{ color: 'var(--ink-mute)' }}
          >
            {showHelp ? '색상 읽는 법 닫기 ▲' : '색상 읽는 법 ?'}
          </button>
        </div>
      </div>

      {/* ── 바텀업 필터 (2단계) ── */}
      {viewMode === 'bottomup' && (() => {
        type Cat = { id: string; label: string; keys: HLFilter[] }
        const CATS: Cat[] = [
          { id: 'break', label: '신고가 돌파', keys: ['break52','break26','break13'] },
          { id: 'hold',  label: '돌파 유지',   keys: ['hold52','hold26'] },
          { id: 'near',  label: '고가 근접',    keys: ['near52','near26'] },
          { id: 'low',   label: '신저가',       keys: ['low52','low26','low13'] },
        ]
        const WEEKS: Record<HLFilter, string> = {
          break52:'52주', break26:'26주', break13:'13주',
          hold52:'52주',  hold26:'26주',
          near52:'52주',  near26:'26주',
          low52:'52주',   low26:'26주',   low13:'13주',
        }
        const activeCat = CATS.find(c => c.keys.includes(hlFilter))!
        return (
          <div className="mb-3 space-y-2">
            {/* 1행: 카테고리 */}
            <div className="flex" style={{ border: '1px solid var(--hairline)' }}>
              {CATS.map(cat => {
                const isActive = cat.id === activeCat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => setHlFilter(cat.keys[0])}
                    className="flex-1 py-2 text-[11px] font-semibold transition-all"
                    style={{
                      background: isActive ? 'var(--accent)' : 'transparent',
                      color: isActive ? '#fff' : 'var(--ink-mute)',
                      borderRight: '1px solid var(--hairline)',
                    }}
                  >
                    {cat.label}
                  </button>
                )
              })}
            </div>
            {/* 2행: 기간 */}
            <div className="flex gap-1.5">
              {activeCat.keys.map(key => (
                <button
                  key={key}
                  onClick={() => setHlFilter(key)}
                  className="px-4 py-1.5 text-[11px] font-semibold transition-all mono"
                  style={{
                    background: hlFilter === key ? 'var(--accent)' : 'var(--surface)',
                    color: hlFilter === key ? '#fff' : 'var(--ink-mute)',
                    border: `1px solid ${hlFilter === key ? 'var(--accent)' : 'var(--hairline)'}`,
                  }}
                >
                  {WEEKS[key]}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── 도움말 패널 (토글) ── */}
      {showHelp && (
        <div className="mb-3 p-3 text-[10px]" style={{ background: 'var(--plane)', border: '1px solid var(--hairline)' }}>
          <div className="font-semibold mb-2" style={{ color: 'var(--ink-2)' }}>색상 읽는 법</div>
          <div className="space-y-1.5">
            {HELP_HOW_TO_READ.map(g => (
              <div key={g.text} className="flex items-center gap-2.5">
                <div className="w-5 h-4 flex-shrink-0" style={{ background: g.color, border: '1px solid var(--hairline-2)' }} />
                <span className="leading-tight" style={{ color: 'var(--ink-2)' }}>{g.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'topdown' ? (
        <>
          {/* ── 히트맵 본체 ── */}
          <div className="-mx-4 sm:-mx-6">
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
              style={{ borderLeft: '1px solid var(--hairline)', borderTop: '1px solid var(--hairline)' }}
            >
              {data.sectors.map(sector => (
                <SectorBlock
                  key={sector.id}
                  sector={sector}
                  onSelectStock={handleSelectStock}
                  onSelectSector={handleSelectSector}
                />
              ))}
            </div>
          </div>

          {/* ── 스테이지 범례 ── */}
          <div className="mt-3 text-[9px] flex flex-wrap gap-x-3 gap-y-0.5 mono" style={{ color: 'var(--ink-mute)' }}>
            <span className="font-medium" style={{ color: 'var(--ink-2)' }}>스테이지:</span>
            <span>①→ 1말</span>
            <span className="font-semibold" style={{ color: 'var(--up-text)' }}>②↑ 2초 ★</span>
            <span>② 2진행</span>
            <span>②+ 2확장</span>
            <span className="font-semibold" style={{ color: 'var(--down-text)' }}>③→ 3말 ★</span>
            <span className="font-semibold" style={{ color: 'var(--down-text)' }}>④↓ 4초 ★</span>
            <span>④ 4진행</span>
            <span>④- 4확장</span>
          </div>
        </>
      ) : viewMode === 'bottomup' ? (
        <BottomUpView
          sectors={data.sectors}
          hlFilter={hlFilter}
          onSelectStock={handleSelectStock}
        />
      ) : viewMode === 'ranking' ? (
        <SectorRankingList sectors={data.sectors} />
      ) : (
        /* ── 비교 모드: 섹터 A vs 섹터 B ── */
        (() => {
          const spySector = data.sectors.find(s => s.etf === 'SPY')
          const left  = compareLeft  ?? spySector ?? null
          const right = compareRight
          const opts  = data.sectors
          const SectorPicker = ({ value, onChange, exclude }: { value: SectorItem | null; onChange: (s: SectorItem) => void; exclude?: string }) => (
            <select
              value={value?.etf ?? ''}
              onChange={e => { const s = opts.find(o => o.etf === e.target.value); if (s) onChange(s) }}
              className="w-full text-xs font-bold px-2 py-2 mono"
              style={{ background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline)' }}
            >
              <option value="" disabled>섹터 선택</option>
              {opts.filter(o => o.etf !== exclude).map(o => (
                <option key={o.etf} value={o.etf}>
                  {o.emoji} {o.name}{o.sector_rs_excess !== null ? `  (${o.sector_rs_excess >= 0 ? '+' : ''}${o.sector_rs_excess.toFixed(1)}%)` : ''}
                </option>
              ))}
            </select>
          )
          return (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1"><SectorPicker value={left} onChange={setCompareLeft} exclude={right?.etf} /></div>
                <span className="text-xs font-black shrink-0" style={{ color: 'var(--ink-mute)' }}>VS</span>
                <div className="flex-1"><SectorPicker value={right} onChange={setCompareRight} exclude={left?.etf} /></div>
              </div>
              <div className="mb-3 text-right">
                <button
                  onClick={() => router.push('/sectors')}
                  className="text-[11px] font-semibold"
                  style={{ color: 'var(--accent)' }}
                >
                  전체 섹터 RS 그래프 크게 보기 →
                </button>
              </div>

              {left && right ? (
                <div>
                  {/* RS 라인 비교 차트 */}
                  <div className="mb-4 p-3" style={{ border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                    <SectorCompareChart a={left} b={right} />
                  </div>

                  {/* 종목 그리드 좌/우 */}
                  <div className="flex gap-2 items-start">
                    {[left, right].map((sec, si) => (
                      <div key={sec.etf} className="flex-1 min-w-0 overflow-hidden" style={{ border: '1px solid var(--hairline)' }}>
                        <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'var(--plane)', borderBottom: '1px solid var(--hairline)' }}>
                          <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{sec.emoji} {sec.name}</span>
                          {sec.sector_rs_excess !== null && (
                            <span className="text-[11px] font-bold mono" style={{ color: sec.sector_rs_excess >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>
                              {sec.sector_rs_excess >= 0 ? '▲' : '▼'}{Math.abs(sec.sector_rs_excess).toFixed(1)}%
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-5" style={{ gap: '1px', padding: '1px', background: 'var(--hairline)' }}>
                          {sec.stocks.map(stock => (
                            <StockCell key={stock.ticker} stock={stock} onClick={() => handleSelectStock(stock, sec.etf, sec.name, sec.stocks)} />
                          ))}
                          {Array.from({ length: Math.max(0, 15 - sec.stocks.length) }).map((_, i) => (
                            <div key={i} style={{ height: '54px', background: 'var(--surface)' }} />
                          ))}
                        </div>
                        <div className="px-2 py-1 text-[9px] text-center mono" style={{ color: 'var(--ink-mute)', borderTop: '1px solid var(--hairline)' }}>
                          {si === 0 ? '◀ 왼쪽' : '오른쪽 ▶'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-sm py-10" style={{ color: 'var(--ink-mute)' }}>
                  비교할 두 섹터를 선택하세요 {right ? '' : '(오른쪽 섹터를 골라 주세요)'}
                </p>
              )}
            </div>
          )
        })()
      )}
      {/* ── 모달들 ── */}
      {selectedStock && (() => {
        const idx = navStocks.findIndex(s => s.ticker === selectedStock.ticker)
        const hasPrev = idx > 0
        const hasNext = idx < navStocks.length - 1
        return (
          <StockDetailModal
            stock={selectedStock}
            sectorEtf={selectedSectorEtf}
            sectorName={selectedSectorName}
            onClose={() => setSelectedStock(null)}
            userId={userId}
            savedTickers={savedTickers}
            onSaved={handleSaved}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={() => hasPrev && handleSelectStock(navStocks[idx - 1], selectedSectorEtf, selectedSectorName)}
            onNext={() => hasNext && handleSelectStock(navStocks[idx + 1], selectedSectorEtf, selectedSectorName)}
          />
        )
      })()}
      {selectedSector && (
        <SectorChartModal sector={selectedSector} onClose={() => setSelectedSector(null)} />
      )}
    </div>
  )
}
