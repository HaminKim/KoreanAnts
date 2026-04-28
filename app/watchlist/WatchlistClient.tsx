'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/client'
import { KOREAN_NAMES } from '@/app/constants/stockNames'

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
// 색상 헬퍼
// ─────────────────────────────────────────

// net_direction 기반 그린/레드 그라데이션
// 0 = 연회색, + = 그린, - = 레드 (스테이지 특수색 없음)
function getCellBg(net: number): string {
  if (net === 0) return 'hsl(220,14%,96%)'
  const t = Math.min(1, Math.abs(net) / 72)
  const s = Math.round(12 + t * 63)
  const l = Math.round(97 - t * 54)
  return `hsl(${net > 0 ? 142 : 0},${s}%,${l}%)`
}

// 배경 밝기에 따라 흰/검정 텍스트 일관 적용
function getCellTextColor(net: number): { ticker: string; sub: string } {
  const t = Math.min(1, Math.abs(net) / 72)
  const l = 97 - t * 54
  if (l < 65) return { ticker: '#fff', sub: 'rgba(255,255,255,0.68)' }
  return { ticker: '#1f2937', sub: '#9ca3af' }
}

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
        <span className="absolute top-0.5 right-0.5 text-[8px] leading-none opacity-70">★</span>
      )}
      {!show52High && show52Low && (
        <span className="absolute top-0.5 right-0.5 text-[7px] leading-none opacity-60">▼</span>
      )}
      <span className="text-[10px] font-bold leading-none" style={{ color: colors.ticker }}>
        {stock.ticker}
      </span>
      <span className="text-[7px] font-mono leading-none" style={{ color: colors.sub }}>
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
  onSelectStock:  (stock: StockItem, sectorEtf: string, sectorName: string) => void
  onSelectSector: (sector: SectorItem) => void
}) {
  const rs = sector.sector_rs_excess
  const rsPositive = rs !== null && rs > 0

  return (
    <div className="bg-white border-r border-b border-gray-200 overflow-hidden">
      {/* 섹터 헤더 */}
      {sector.etf === 'SPY' ? (
        <button
          onClick={() => onSelectSector(sector)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
          title="미국 시장 기준 (SPY)"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {/* 미국 국기 SVG */}
            <svg width="18" height="12" viewBox="0 0 18 12" style={{ flexShrink: 0, borderRadius: '1px', overflow: 'hidden' }}>
              {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                <rect key={i} x="0" y={i * 12/13} width="18" height={12/13 + 0.1} fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
              ))}
              <rect x="0" y="0" width="7.2" height={12 * 7/13} fill="#3C3B6E" />
              {[0,1,2,3,4,1,2,3,4,0].map((col, i) => {
                const row = Math.floor(i / 5)
                return <circle key={i} cx={1.2 + col * 1.4 + (row % 2 === 1 ? 0.7 : 0)} cy={1.1 + row * 1.6} r="0.55" fill="white" />
              })}
            </svg>
            <span className="text-[10px] font-bold text-gray-800 truncate">시장 SPY</span>
          </div>
          <span className="text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
            = 0
          </span>
        </button>
      ) : (
        <button
          onClick={() => onSelectSector(sector)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
          title={`${sector.name} (${sector.etf}) — SPY 대비 60일 초과수익 ${rs !== null ? (rs >= 0 ? '+' : '') + rs.toFixed(2) + '%' : 'N/A'}`}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">{sector.emoji}</span>
            <span className="text-[10px] font-bold text-gray-700 truncate">{sector.name}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-1">
            {rs !== null && (
              <span
                className="text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded-full"
                style={{
                  background: rsPositive ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
                  color: rsPositive ? '#16a34a' : '#dc2626',
                }}
              >
                {rsPositive ? '▲' : '▼'}{Math.abs(rs).toFixed(1)}%
              </span>
            )}
            {sector.sector_rs_slope_dir !== 'flat' && sector.sector_rs_slope_days > 0 && (
              <span
                className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-full border"
                style={{
                  color:      sector.sector_rs_slope_dir === 'up' ? '#16a34a' : '#dc2626',
                  background: sector.sector_rs_slope_dir === 'up' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                  borderColor: sector.sector_rs_slope_dir === 'up' ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)',
                }}
              >
                {sector.sector_rs_slope_dir === 'up' ? '↗' : '↘'} {sector.sector_rs_slope_days}d
              </span>
            )}
          </div>
        </button>
      )}

      {/* 종목 그리드 */}
      <div className="grid grid-cols-5 bg-gray-100" style={{ gap: '1px', padding: '1px' }}>
        {sector.stocks.map(stock => (
          <StockCell key={stock.ticker} stock={stock} onClick={() => onSelectStock(stock, sector.etf, sector.name)} />
        ))}
        {Array.from({ length: Math.max(0, 15 - sector.stocks.length) }).map((_, i) => (
          <div key={i} className="bg-white" style={{ height: '54px' }} />
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
}: {
  stock: StockItem
  sectorEtf: string
  sectorName: string
  onClose: () => void
  userId: string | null
  savedTickers: Set<string>
  onSaved: (ticker: string) => void
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
            <TradingViewChart symbol={stock.ticker} height={300} />
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
  { color: 'hsl(142,75%,43%)', text: '초록 — 시장보다 강한 종목' },
  { color: 'hsl(0,75%,43%)',   text: '빨강 — 시장보다 약한 종목' },
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
  onSelectStock: (stock: StockItem, sectorEtf: string, sectorName: string) => void
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
            onClick={() => onSelectStock(stock, sec.etf, sec.name)}
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
// 섹터 순위 범프 차트
// ─────────────────────────────────────────

const BUMP_COLORS = [
  '#ef4444','#f97316','#eab308','#84cc16','#22c55e',
  '#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6',
  '#a855f7','#ec4899','#f43f5e','#dc2626','#d97706',
  '#f59e0b','#16a34a','#0891b2','#2563eb','#7c3aed',
  '#c026d3','#db2777','#059669','#ca8a04','#0284c7',
  '#be123c',
]

function SectorRankingView({ sectors }: { sectors: SectorItem[] }) {
  const [days, setDays] = useState(60)
  const [hoveredEtf, setHoveredEtf] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const obs = new ResizeObserver(entries => setContainerWidth(entries[0].contentRect.width))
    obs.observe(el)
    setContainerWidth(el.clientWidth)
    return () => obs.disconnect()
  }, [])

  // SPY 제외
  const activeSectors = sectors.filter(s => s.etf !== 'SPY')
  const allDates = activeSectors[0].sector_rs_history.map(h => h.d)
  const sliced = allDates.slice(-days)
  const startIdx = allDates.length - days
  const D = sliced.length
  const N = activeSectors.length // 25

  // 날짜별 순위 계산 (RS 높을수록 1위)
  const ranksByDate: Map<string, number>[] = sliced.map((_, di) => {
    const absIdx = startIdx + di
    const vals = activeSectors.map(s => ({
      etf: s.etf,
      v: s.sector_rs_history[absIdx]?.v ?? -Infinity,
    }))
    vals.sort((a, b) => b.v - a.v)
    const map = new Map<string, number>()
    vals.forEach((s, i) => map.set(s.etf, i + 1))
    return map
  })

  const LEFT_PAD = 34
  const RIGHT_PAD = 28   // 이모지만 표시 — 호버 시 툴팁으로 풀네임
  const DATE_LABEL_H = 36
  const BOT_PAD = 10
  const ROW_H = 30

  // 컨테이너 너비를 꽉 채우도록 COL_W 계산, 최소 8px
  const COL_W = containerWidth > 0
    ? Math.max(8, Math.floor((containerWidth - LEFT_PAD - RIGHT_PAD) / D))
    : 14

  const W = LEFT_PAD + D * COL_W + RIGHT_PAD
  const H = DATE_LABEL_H + N * ROW_H + BOT_PAD

  const xOf = (di: number) => LEFT_PAD + di * COL_W + COL_W / 2
  const yOf = (rank: number) => DATE_LABEL_H + (rank - 1) * ROW_H + ROW_H / 2

  // COL_W에 따라 날짜 표시 간격
  const dateStep = COL_W >= 28 ? 1 : COL_W >= 18 ? 2 : COL_W >= 12 ? 3 : 5

  if (containerWidth === 0) return <div ref={containerRef} style={{ minHeight: 200 }} />

  return (
    <div className="mt-2" ref={containerRef}>
      {/* 날짜 범위 선택 */}
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[11px] text-gray-400 font-semibold mr-1">기간</span>
        {([20, 30, 60] as const).map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
              days === d ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {d}일
          </button>
        ))}
        <span className="ml-auto text-[10px] text-gray-400">위쪽 = SPY 초과 강함</span>
      </div>

      <div className="overflow-x-auto">
        <svg width={W} height={H} style={{ display: 'block' }}>
          <defs>
            <filter id="shadow" x="-10%" y="-30%" width="130%" height="160%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.12" />
            </filter>
          </defs>
          {/* 배경 줄 (짝수 행) */}
          {Array.from({ length: N }, (_, i) => (
            <rect
              key={i}
              x={LEFT_PAD}
              y={DATE_LABEL_H + i * ROW_H}
              width={D * COL_W}
              height={ROW_H}
              fill={i % 2 === 0 ? 'rgba(243,244,246,0.6)' : 'transparent'}
            />
          ))}

          {/* 5위 단위 수평 가이드선 */}
          {[5, 10, 15, 20, 25].map(r => (
            <line
              key={r}
              x1={LEFT_PAD} x2={LEFT_PAD + D * COL_W}
              y1={yOf(r)} y2={yOf(r)}
              stroke="#e5e7eb" strokeWidth={0.8} strokeDasharray="4,3"
            />
          ))}

          {/* 좌측 순위 라벨 */}
          {[1, 5, 10, 15, 20, 25].map(r => (
            <text
              key={r}
              x={LEFT_PAD - 5}
              y={yOf(r)}
              fontSize={9}
              textAnchor="end"
              fill="#9ca3af"
              dominantBaseline="middle"
              fontWeight={r === 1 ? 'bold' : 'normal'}
            >
              {r}위
            </text>
          ))}

          {/* 날짜 라벨 — 기울여서 겹침 방지 */}
          {sliced.map((d, di) => {
            if (di % dateStep !== 0 && di !== D - 1) return null
            const x = xOf(di)
            const y = DATE_LABEL_H - 4
            return (
              <text
                key={d}
                x={x}
                y={y}
                fontSize={9}
                textAnchor="end"
                fill={di === D - 1 ? '#374151' : '#9ca3af'}
                fontWeight={di === D - 1 ? 'bold' : 'normal'}
                transform={`rotate(-40, ${x}, ${y})`}
              >
                {d.slice(5)}
              </text>
            )
          })}

          {/* 오늘 수직선 */}
          <line
            x1={xOf(D - 1)} x2={xOf(D - 1)}
            y1={DATE_LABEL_H} y2={DATE_LABEL_H + N * ROW_H}
            stroke="#d1d5db" strokeWidth={1} strokeDasharray="3,3"
          />

          {/* 섹터 라인 */}
          {activeSectors.map((sector, si) => {
            const color = BUMP_COLORS[si % BUMP_COLORS.length]
            const isHovered = hoveredEtf === sector.etf
            const dimmed = hoveredEtf !== null && !isHovered

            const points = sliced.map((_, di) => ({
              x: xOf(di),
              y: yOf(ranksByDate[di].get(sector.etf) ?? N),
            }))

            // 베지어 커브
            const path = points
              .map((p, i) => {
                if (i === 0) return `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
                const prev = points[i - 1]
                const cx = ((prev.x + p.x) / 2).toFixed(1)
                return `C${cx},${prev.y.toFixed(1)} ${cx},${p.y.toFixed(1)} ${p.x.toFixed(1)},${p.y.toFixed(1)}`
              })
              .join(' ')

            const lastRank = ranksByDate[D - 1].get(sector.etf) ?? N
            const prevRank = D >= 2 ? (ranksByDate[D - 2].get(sector.etf) ?? N) : lastRank
            const delta = prevRank - lastRank
            const lastY = yOf(lastRank)

            return (
              <g
                key={sector.etf}
                onMouseEnter={() => setHoveredEtf(sector.etf)}
                onMouseLeave={() => setHoveredEtf(null)}
                style={{ cursor: 'pointer' }}
              >
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={isHovered ? 3 : 1.8}
                  opacity={dimmed ? 0.1 : isHovered ? 1 : 0.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* 끝점 원 */}
                <circle
                  cx={points[D - 1].x}
                  cy={lastY}
                  r={isHovered ? 5 : 3}
                  fill={color}
                  opacity={dimmed ? 0.1 : 1}
                />
                {/* 우측 라벨 — 평소: 이모지만, 호버: 풀 툴팁 */}
                {isHovered ? (
                  <g>
                    <rect
                      x={xOf(D - 1) + 8}
                      y={lastY - 10}
                      width={118}
                      height={20}
                      rx={4}
                      fill="white"
                      stroke={color}
                      strokeWidth={1}
                      filter="url(#shadow)"
                    />
                    <text
                      x={xOf(D - 1) + 14}
                      y={lastY}
                      fontSize={10.5}
                      fill={color}
                      fontWeight="bold"
                      dominantBaseline="middle"
                    >
                      {`${lastRank}위 ${sector.emoji} ${sector.name}`}
                      {delta > 0 ? ` ▲${delta}` : delta < 0 ? ` ▼${Math.abs(delta)}` : ''}
                    </text>
                  </g>
                ) : (
                  <text
                    x={xOf(D - 1) + 8}
                    y={lastY}
                    fontSize={11}
                    fill={dimmed ? '#e5e7eb' : '#374151'}
                    dominantBaseline="middle"
                  >
                    {sector.emoji}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* 하단 범례 */}
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-1">
        {activeSectors.map((sector, si) => {
          const color = BUMP_COLORS[si % BUMP_COLORS.length]
          const lastRank = ranksByDate[D - 1].get(sector.etf) ?? N
          return (
            <button
              key={sector.etf}
              onMouseEnter={() => setHoveredEtf(sector.etf)}
              onMouseLeave={() => setHoveredEtf(null)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] transition-all ${
                hoveredEtf === sector.etf ? 'bg-gray-100 font-bold' : 'hover:bg-gray-50'
              }`}
            >
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span className="text-gray-600 truncate">{lastRank}위 {sector.emoji} {sector.name}</span>
            </button>
          )
        })}
      </div>
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
  const [viewMode,           setViewMode]          = useState<'topdown' | 'bottomup' | 'compare' | 'ranking'>('topdown')
  const [hlFilter,           setHlFilter]          = useState<HLFilter>('break52')
  const [showHelp,           setShowHelp]          = useState(false)
  const [userId,             setUserId]            = useState<string | null>(null)
  const [savedTickers,       setSavedTickers]      = useState<Set<string>>(new Set())
  const [compareRight,       setCompareRight]      = useState<SectorItem | null>(null)

  useEffect(() => {
    fetch('/data/watchlist.json', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: WatchlistData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
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
    <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
      📊 분석 데이터 로딩 중...
    </div>
  )

  if (!data) return (
    <div className="flex items-center justify-center py-32 text-gray-400 text-sm">
      데이터 없음 — 스크립트를 먼저 실행해 주세요.
    </div>
  )

  const mc        = data.market_context
  const allStocks = data.sectors.flatMap(s => s.stocks)
  const counts = {
    long:  allStocks.filter(s => s.data.rs_excess_pct !== null && s.data.rs_excess_pct > 0).length,
    short: allStocks.filter(s => s.data.rs_excess_pct !== null && s.data.rs_excess_pct < 0).length,
  }

  const mktColor =
    mc.market_state === 'bull' ? '#15803d' :
    mc.market_state === 'bear' ? '#b91c1c' : '#92400e'

  const handleSelectStock = (stock: StockItem, etf: string, sectorName: string) => {
    setSelectedStock(stock)
    setSelectedSectorEtf(etf)
    setSelectedSectorName(sectorName)
  }

  const handleSelectSector = (sector: SectorItem) => {
    if (viewMode === 'compare') {
      if (sector.etf !== 'SPY') setCompareRight(sector)
      return
    }
    setSelectedSector(sector)
  }

  return (
    <div>
      {/* ── 시장 전환 버튼 ── */}
      <div className="flex gap-1 mb-3 p-1 bg-gray-100 rounded-xl">
        <button
          onClick={() => router.push('/watchlist-kr')}
          className="flex-1 py-1.5 rounded-lg text-[13px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          코스피
        </button>
        <button className="flex-1 py-1.5 rounded-lg text-[13px] font-bold bg-white text-gray-900 shadow-sm">
          나스닥
        </button>
      </div>

      {/* ── 상단 요약 카드 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 shadow-sm">
        {/* 두 핵심 지표 */}
        {(() => {
          const total = counts.long + counts.short
          const bullPct = total > 0 ? Math.round((counts.long / total) * 100) : 50
          return (
            <div className="mb-4">
              <p className="text-gray-700 text-sm font-semibold mb-2 text-center">S&P 500 대비 종목 강도</p>
              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="text-center">
                  <p className="text-3xl font-black tracking-tight text-green-500">{counts.long}</p>
                  <p className="text-[11px] text-green-500 font-medium mt-0.5">강한 종목</p>
                </div>
                <span className="text-gray-300 font-light text-2xl">|</span>
                <div className="text-center">
                  <p className="text-3xl font-black tracking-tight text-red-500">{counts.short}</p>
                  <p className="text-[11px] text-red-500 font-medium mt-0.5">약한 종목</p>
                </div>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-100">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${bullPct}%` }} />
                <div className="h-full flex-1 bg-red-500" />
              </div>
              <div className="flex justify-between mt-2">
                <span className="text-[11px] text-gray-400">{counts.long}개 강함</span>
                <span className="text-[11px] text-gray-400">{counts.short}개 약함</span>
              </div>
            </div>
          )
        })()}

        {/* 뷰 모드 토글 + 도움말 */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex gap-1.5">
            <button
              onClick={() => setViewMode('topdown')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'topdown'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              📊 탑다운
            </button>
            <button
              onClick={() => setViewMode('bottomup')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'bottomup'
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              🔍 바텀업
            </button>
            <button
              onClick={() => { setViewMode('compare'); setCompareRight(null) }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'compare'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              ⚖️ 비교
            </button>
            <button
              onClick={() => setViewMode('ranking')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'ranking'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              📈 순위
            </button>
          </div>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-full transition-colors"
          >
            {showHelp ? '▲' : '❓'} 도움말
          </button>
        </div>
      </div>

      {/* ── 바텀업 필터 (2단계) ── */}
      {viewMode === 'bottomup' && (() => {
        type Cat = { id: string; label: string; color: string; activeClass: string; keys: HLFilter[] }
        const CATS: Cat[] = [
          { id: 'break', label: '🔥 신고가 돌파', color: 'emerald', activeClass: 'bg-emerald-500 text-white', keys: ['break52','break26','break13'] },
          { id: 'hold',  label: '📈 돌파 유지',   color: 'teal',    activeClass: 'bg-teal-500 text-white',    keys: ['hold52','hold26'] },
          { id: 'near',  label: '🎯 고가 근접',    color: 'blue',    activeClass: 'bg-blue-500 text-white',    keys: ['near52','near26'] },
          { id: 'low',   label: '📉 신저가',       color: 'rose',    activeClass: 'bg-rose-500 text-white',    keys: ['low52','low26','low13'] },
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
            <div className="flex gap-1.5">
              {CATS.map(cat => {
                const isActive = cat.id === activeCat.id
                return (
                  <button
                    key={cat.id}
                    onClick={() => setHlFilter(cat.keys[0])}
                    className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${
                      isActive ? cat.activeClass + ' shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
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
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                    hlFilter === key
                      ? activeCat.activeClass + ' border-transparent shadow-sm'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
                  }`}
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
        <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[10px]">
          <div className="font-semibold text-gray-700 mb-2">색상 읽는 법</div>
          <div className="space-y-1.5">
            {HELP_HOW_TO_READ.map(g => (
              <div key={g.text} className="flex items-center gap-2.5">
                <div className="w-5 h-4 rounded flex-shrink-0" style={{ background: g.color }} />
                <span className="text-gray-600 leading-tight">{g.text}</span>
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
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 border-l border-t border-gray-200"
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
          <div className="mt-3 text-[9px] text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="font-medium text-gray-500">스테이지:</span>
            <span>①→ 1말</span>
            <span className="text-yellow-600 font-semibold">②↑ 2초 ★</span>
            <span>② 2진행</span>
            <span>②+ 2확장</span>
            <span className="text-orange-500 font-semibold">③→ 3말 ★</span>
            <span className="text-orange-500 font-semibold">④↓ 4초 ★</span>
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
        <SectorRankingView sectors={data.sectors} />
      ) : (
        /* ── 비교 모드 (항상 SPY 기준) ── */
        (() => {
          const spySector = data.sectors.find(s => s.etf === 'SPY')
          return (
            <div className="mt-2">
              {!compareRight ? (
                /* 섹터 선택 */
                <div>
                  <p className="text-center text-sm font-semibold text-gray-600 mb-1">SPY와 비교할 섹터를 선택하세요</p>
                  <p className="text-center text-[11px] text-gray-400 mb-3">🇺🇸 시장 SPY = 0 기준</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {data.sectors.filter(s => s.etf !== 'SPY').map(sector => (
                      <button
                        key={sector.id}
                        onClick={() => setCompareRight(sector)}
                        className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 border border-gray-200 text-left transition-colors"
                      >
                        <span className="text-xl">{sector.emoji}</span>
                        <div>
                          <div className="text-xs font-bold text-gray-700">{sector.name}</div>
                          <div className="text-[10px] text-gray-400">{sector.etf}</div>
                          {sector.sector_rs_excess !== null && (
                            <div className="text-[10px] font-mono font-bold" style={{ color: sector.sector_rs_excess >= 0 ? '#16a34a' : '#dc2626' }}>
                              {sector.sector_rs_excess >= 0 ? '▲' : '▼'}{Math.abs(sector.sector_rs_excess).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* 비교 뷰: SPY vs 선택 섹터 */
                <div>
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => setCompareRight(null)}
                      className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                    >
                      ↺ 다시 선택
                    </button>
                    <span className="text-xs text-gray-400">
                      🇺🇸 SPY vs {compareRight.emoji} {compareRight.name}
                    </span>
                  </div>

                  <div className="flex gap-2 items-start">
                    {/* 왼쪽: SPY */}
                    <div className="flex-1 min-w-0 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <svg width="18" height="12" viewBox="0 0 18 12" style={{ flexShrink: 0, borderRadius: '1px', overflow: 'hidden' }}>
                            {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(i => (
                              <rect key={i} x="0" y={i * 12/13} width="18" height={12/13 + 0.1} fill={i % 2 === 0 ? '#B22234' : '#FFFFFF'} />
                            ))}
                            <rect x="0" y="0" width="7.2" height={12 * 7/13} fill="#3C3B6E" />
                            {[0,1,2,3,4,1,2,3,4,0].map((col, i) => {
                              const row = Math.floor(i / 5)
                              return <circle key={i} cx={1.2 + col * 1.4 + (row % 2 === 1 ? 0.7 : 0)} cy={1.1 + row * 1.6} r="0.55" fill="white" />
                            })}
                          </svg>
                          <span className="text-xs font-bold text-gray-800">시장 SPY</span>
                        </div>
                        <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          = 0
                        </span>
                      </div>
                      {spySector && (
                        <div className="grid grid-cols-5 bg-gray-100" style={{ gap: '1px', padding: '1px' }}>
                          {spySector.stocks.map(stock => (
                            <StockCell key={stock.ticker} stock={stock} onClick={() => handleSelectStock(stock, spySector.etf, spySector.name)} />
                          ))}
                          {Array.from({ length: Math.max(0, 15 - spySector.stocks.length) }).map((_, i) => (
                            <div key={i} className="bg-white" style={{ height: '54px' }} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* VS */}
                    <div className="flex-shrink-0 self-center px-1">
                      <span className="text-base font-black text-gray-400">VS</span>
                    </div>

                    {/* 오른쪽: 선택 섹터 */}
                    <div className="flex-1 min-w-0 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                      <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{compareRight.emoji}</span>
                          <span className="text-xs font-bold text-gray-800">{compareRight.name}</span>
                        </div>
                        {compareRight.sector_rs_excess !== null && (
                          <span className="text-[11px] font-black" style={{ color: compareRight.sector_rs_excess >= 0 ? '#16a34a' : '#dc2626' }}>
                            {compareRight.sector_rs_excess >= 0 ? '▲' : '▼'}{Math.abs(compareRight.sector_rs_excess).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-5 bg-gray-100" style={{ gap: '1px', padding: '1px' }}>
                        {compareRight.stocks.map(stock => (
                          <StockCell key={stock.ticker} stock={stock} onClick={() => handleSelectStock(stock, compareRight.etf, compareRight.name)} />
                        ))}
                        {Array.from({ length: Math.max(0, 15 - compareRight.stocks.length) }).map((_, i) => (
                          <div key={i} className="bg-white" style={{ height: '54px' }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* RS 비교 — 발산형 바 */}
                  {compareRight.sector_rs_excess !== null && (() => {
                    const rs = compareRight.sector_rs_excess
                    const pct = Math.min(50, Math.abs(rs) / 50 * 50) // 최대 ±50% → 50% 너비
                    const isPos = rs >= 0
                    return (
                      <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
                        <p className="text-[10px] text-gray-400 mb-3 text-center font-semibold">SPY 대비 60일 초과수익</p>
                        <div className="relative h-8 flex items-center">
                          {/* 전체 트랙 */}
                          <div className="absolute inset-0 flex">
                            <div className="flex-1 bg-red-50 rounded-l-full" />
                            <div className="flex-1 bg-green-50 rounded-r-full" />
                          </div>
                          {/* 중앙 0선 */}
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gray-400 z-10" />
                          {/* 발산 막대 */}
                          <div
                            className="absolute top-1.5 bottom-1.5 z-20"
                            style={{
                              left:  isPos ? '50%' : `${50 - pct}%`,
                              width: `${pct}%`,
                              background: isPos ? '#16a34a' : '#dc2626',
                              opacity: 0.85,
                              borderRadius: isPos ? '0 9999px 9999px 0' : '9999px 0 0 9999px',
                            }}
                          />
                          {/* 수치 라벨 */}
                          <span
                            className="absolute text-xs font-black font-mono z-30"
                            style={{
                              left: isPos ? `calc(50% + ${pct}% + 6px)` : `calc(${50 - pct}% - 48px)`,
                              color: isPos ? '#15803d' : '#b91c1c',
                            }}
                          >
                            {isPos ? '+' : ''}{rs.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex justify-between mt-1 px-1">
                          <span className="text-[9px] text-red-400 font-semibold">SPY 하회</span>
                          <span className="text-[9px] text-gray-400">0</span>
                          <span className="text-[9px] text-green-500 font-semibold">SPY 상회</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })()
      )}

      {/* ── 모달들 ── */}
      {selectedStock && (
        <StockDetailModal
          stock={selectedStock}
          sectorEtf={selectedSectorEtf}
          sectorName={selectedSectorName}
          onClose={() => setSelectedStock(null)}
          userId={userId}
          savedTickers={savedTickers}
          onSaved={handleSaved}
        />
      )}
      {selectedSector && (
        <SectorChartModal sector={selectedSector} onClose={() => setSelectedSector(null)} />
      )}
    </div>
  )
}
