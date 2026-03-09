'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const TradingViewChart = dynamic(
  () => import('@/app/components/TradingViewChart'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-400 text-sm">차트 로딩 중...</div> }
)

// ─────────────────────────────────────────
// Types
// ─────────────────────────────────────────

type Signal  = 'long' | 'long_watch' | 'short' | 'short_watch' | 'neutral'
type RSPoint = { d: string; v: number }
interface HighLow  { w52: number|null; w26: number|null; w13: number|null }
interface NearHigh { w52: number|null; w26: number|null; w13: number|null }
interface EpsQuarter { d: string; actual: number|null; estimate: number|null; surp: number|null }
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
  highs:           HighLow
  lows:            HighLow
  near_highs:      NearHigh
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

function getCellBg(signal: Signal, stage: string, score: number): string {
  const t = Math.min(1, Math.max(0, score / 100))
  if (stage === 'stage2_early' || stage === 'stage1_late')
    return `rgba(234,179,8,${0.3 + t * 0.5})`
  if (stage === 'stage3_late' || stage === 'stage4_early')
    return `rgba(249,115,22,${0.3 + t * 0.5})`
  if (signal === 'long')        return `rgba(34,197,94,${0.2 + t * 0.55})`
  if (signal === 'long_watch')  return `rgba(34,197,94,${0.08 + t * 0.22})`
  if (signal === 'short')       return `rgba(239,68,68,${0.2 + t * 0.55})`
  if (signal === 'short_watch') return `rgba(239,68,68,${0.08 + t * 0.22})`
  return `rgba(243,244,246,${0.5 + t * 0.3})`
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
// EPSChart — 분기별 실제 EPS 바 차트
//
// 막대 = actual EPS ($), 회색 점선 = estimate
// 초록 = beat (actual >= estimate) / 빨강 = miss / 파랑 = estimate 없음
// 우상단 트렌드 뱃지: ↗ 개선 / ↘ 악화 / → 보합
// ─────────────────────────────────────────

function EPSChart({ eps }: { eps: EpsData }) {
  const history = eps.history.filter(q => q.actual !== null) as (EpsQuarter & { actual: number })[]
  if (history.length < 2) return null

  const W = 400, H = 90
  const PAD = { l: 36, r: 8, t: 14, b: 22 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  // y축 범위: actual + estimate 전부 포함
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
  const barW = Math.max(6, gap * 0.55)

  const trend      = eps.trend
  const trendIcon  = trend === 'improving' ? '↗' : trend === 'declining' ? '↘' : '→'
  const trendColor = trend === 'improving' ? '#15803d' : trend === 'declining' ? '#b91c1c' : '#6b7280'
  const trendLabel = trend === 'improving' ? '개선' : trend === 'declining' ? '악화' : '보합'

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">EPS 실적 (분기 / $) ─ 점선=예상치</span>
        {trend && (
          <span className="text-[9px] font-bold" style={{ color: trendColor }}>
            {trendIcon} {trendLabel}
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '80px', display: 'block' }}>
        {/* 0 기준선 (0이 범위 안에 있을 때만) */}
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

          // 색상: beat=초록, miss=빨강, estimate없음=파랑
          let fill: string
          if (q.estimate === null) {
            fill = isPos ? 'rgba(59,130,246,0.6)' : 'rgba(239,68,68,0.6)'
          } else {
            fill = q.actual >= q.estimate ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)'
          }

          const labelAbove = isPos
          const labelY     = labelAbove ? barTop - 2 : barBot + 8

          return (
            <g key={q.d}>
              {/* 실적 바 */}
              <rect x={cx - barW / 2} y={barTop} width={barW} height={barH} fill={fill} rx={1} />

              {/* 예상치 점선 */}
              {q.estimate !== null && (
                <line
                  x1={cx - barW / 2 - 1} y1={toY(q.estimate)}
                  x2={cx + barW / 2 + 1} y2={toY(q.estimate)}
                  stroke="#6b7280" strokeWidth={1.2} strokeDasharray="2,1"
                />
              )}

              {/* 실제 EPS 수치 */}
              {barH > 5 && (
                <text x={cx} y={labelY} fontSize={6} textAnchor="middle"
                  fill={isPos ? '#15803d' : '#b91c1c'}>
                  {q.actual > 0 ? '+' : ''}{q.actual.toFixed(2)}
                </text>
              )}

              {/* 날짜 레이블 */}
              <text x={cx} y={H - 2} fontSize={6} textAnchor="middle" fill="#9ca3af">
                {q.d.slice(2, 7)}
              </text>
            </g>
          )
        })}

        {/* Y축 레이블 */}
        <text x={PAD.l - 2} y={PAD.t + 3}    fontSize={6} textAnchor="end" fill="#9ca3af">${yMax.toFixed(2)}</text>
        {zeroY >= PAD.t && zeroY <= H - PAD.b && (
          <text x={PAD.l - 2} y={zeroY} fontSize={6} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">0</text>
        )}
        <text x={PAD.l - 2} y={H - PAD.b + 2} fontSize={6} textAnchor="end" fill="#9ca3af">${yMin.toFixed(2)}</text>
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────
// StockCell
// ─────────────────────────────────────────

function StockCell({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  const isTransition =
    stock.stage === 'stage2_early' || stock.stage === 'stage1_late' ||
    stock.stage === 'stage3_late'  || stock.stage === 'stage4_early'
  const maColor    = stock.data.ma_distance_pct >= 0 ? '#166534' : '#991b1b'
  const show52High = stock.highs?.w52 != null && stock.highs.w52 <= 10
  const show52Low  = stock.lows?.w52  != null && stock.lows.w52  <= 10

  return (
    <button
      onClick={onClick}
      title={`${stock.ticker} | MA100 대비 ${stock.data.ma_distance_pct >= 0 ? '+' : ''}${stock.data.ma_distance_pct.toFixed(1)}% | ${SIGNAL_KO[stock.signal]}`}
      className="relative flex flex-col items-center justify-center w-full transition-opacity hover:opacity-75 active:opacity-50 cursor-pointer select-none"
      style={{ background: getCellBg(stock.signal, stock.stage, stock.score), height: '54px', gap: '1px' }}
    >
      {show52High && (
        <span className="absolute top-0.5 right-0.5 text-[8px] leading-none">⭐</span>
      )}
      {!show52High && show52Low && (
        <span className="absolute top-0.5 right-0.5 text-[8px] leading-none">📉</span>
      )}
      <span className="text-[10px] font-bold leading-none" style={{ color: isTransition ? '#1c1917' : '#111827' }}>
        {stock.ticker}
      </span>
      {/* MA100 대비 거리 — 기간 수익률 아님! */}
      <span className="text-[7px] font-mono leading-none" style={{ color: maColor }}>
        MA{stock.data.ma_distance_pct >= 0 ? '+' : ''}{stock.data.ma_distance_pct.toFixed(1)}%
      </span>
      <span className="text-[7px] leading-none text-gray-400">
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
  onSelectStock:  (stock: StockItem, sectorEtf: string) => void
  onSelectSector: (sector: SectorItem) => void
}) {
  const rs = sector.sector_rs_excess
  const rsPositive = rs !== null && rs > 0

  return (
    <div className="bg-white">
      {/* 섹터 헤더 클릭 → ETF 차트 + RS 추이 */}
      <button
        onClick={() => onSelectSector(sector)}
        className="w-full flex items-center justify-between px-2 py-1 bg-gray-50 border-b border-gray-200 hover:bg-gray-100 transition-colors cursor-pointer"
        title={`${sector.name} (${sector.etf}) — SPY 대비 60일 초과수익 ${rs !== null ? (rs >= 0 ? '+' : '') + rs.toFixed(2) + '%' : 'N/A'}`}
      >
        <span className="text-[9px] font-semibold text-gray-600 truncate">
          {sector.emoji} {sector.name}
        </span>
        <div className="flex items-center gap-1 flex-shrink-0 ml-1">
          {rs !== null && (
            <>
              <span
                className="text-[8px] font-mono font-bold"
                style={{ color: rsPositive ? '#15803d' : '#b91c1c' }}
              >
                {rsPositive ? '▲' : '▼'}{Math.abs(rs).toFixed(1)}%
              </span>
              {sector.sector_rs_days > 0 && (
                <span className="text-[7px] text-gray-400 font-mono">
                  {sector.sector_rs_days}일
                </span>
              )}
              {sector.sector_rs_slope_days > 0 && (
                <span
                  className="text-[7px] font-mono font-semibold"
                  style={{ color: sector.sector_rs_slope_dir === 'up' ? '#15803d' : '#b91c1c' }}
                >
                  {sector.sector_rs_slope_dir === 'up' ? '↗' : '↘'}{sector.sector_rs_slope_days}d
                </span>
              )}
            </>
          )}
          <span className="text-[8px] text-gray-300">📈</span>
        </div>
      </button>

      {/* 종목 그리드 — gap이 회색 격자선 */}
      <div className="grid grid-cols-5 bg-gray-200" style={{ gap: '2px', padding: '2px' }}>
        {sector.stocks.map(stock => (
          <StockCell key={stock.ticker} stock={stock} onClick={() => onSelectStock(stock, sector.etf)} />
        ))}
        {Array.from({ length: Math.max(0, 10 - sector.stocks.length) }).map((_, i) => (
          <div key={i} className="bg-gray-50" style={{ height: '54px' }} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// StockDetailModal
// ─────────────────────────────────────────

function StockDetailModal({ stock, sectorEtf, onClose }: { stock: StockItem; sectorEtf: string; onClose: () => void }) {
  const { breakdown: b, data: d } = stock
  const net        = b.net_direction
  const netPct     = Math.min(100, Math.abs(net))
  const isLongSide = net >= 0

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: '800px', maxHeight: '92vh' }}
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
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* 신고가/신저가 뱃지 행 */}
        {(stock.highs?.w52 != null || stock.highs?.w26 != null || stock.highs?.w13 != null ||
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

        {/* TradingView 가격 차트 */}
        <div style={{ height: '300px' }}>
          <TradingViewChart symbol={stock.ticker} height={300} />
        </div>

        {/* 스크롤 영역 */}
        <div className="overflow-y-auto p-4" style={{ maxHeight: '360px' }}>

          {/* RS LINE 차트: vs SPY */}
          {stock.rs_spy_line && stock.rs_spy_line.length >= 3 && (
            <RSLineChart
              data={stock.rs_spy_line}
              label="vs SPY (1년)"
              uid={`spy-${stock.ticker}`}
            />
          )}

          {/* RS LINE 차트: vs 섹터 ETF */}
          {stock.rs_sector_line && stock.rs_sector_line.length >= 3 && (
            <RSLineChart
              data={stock.rs_sector_line}
              label={`vs ${sectorEtf} (1년)`}
              uid={`etf-${stock.ticker}`}
            />
          )}

          {/* EPS 서프라이즈 차트 */}
          {stock.eps && <EPSChart eps={stock.eps} />}

          {/* bull / bear 강도 바 */}
          <div className="space-y-2 mb-4">

            {/* bull strength */}
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono text-green-700 w-28 flex-shrink-0">롱 강도 (bull)</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-green-500"
                    style={{ width: `${Math.min(100, b.bull_strength)}%` }} />
                </div>
                <span className="text-[9px] font-mono text-gray-400 w-12 text-right">
                  {b.bull_strength.toFixed(1)}/100
                </span>
              </div>
              {b.rs_fresh_bull > 0 && (
                <p className="text-[9px] text-green-600 pl-28">⚡ RS 52주 0선 상향 돌파 보너스 +{b.rs_fresh_bull}</p>
              )}
            </div>

            {/* bear strength */}
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-mono text-red-700 w-28 flex-shrink-0">숏 강도 (bear)</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div className="h-2 rounded-full bg-red-500"
                    style={{ width: `${Math.min(100, b.bear_strength)}%` }} />
                </div>
                <span className="text-[9px] font-mono text-gray-400 w-12 text-right">
                  {b.bear_strength.toFixed(1)}/100
                </span>
              </div>
              {b.rs_fresh_bear > 0 && (
                <p className="text-[9px] text-red-600 pl-28">⚡ RS 52주 0선 하향 돌파 보너스 +{b.rs_fresh_bear}</p>
              )}
            </div>

            {/* net direction 미터 */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-mono text-gray-500 w-28 flex-shrink-0">방향 확신도 (net)</span>
              <div className="flex-1 relative bg-gray-100 rounded-full h-2.5 overflow-hidden">
                {/* 중앙 기준선 */}
                <div className="absolute left-1/2 top-0 w-px h-full bg-gray-400 z-10" />
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    width:      `${netPct / 2}%`,
                    left:       isLongSide ? '50%' : `${50 - netPct / 2}%`,
                    background: isLongSide ? '#16a34a' : '#dc2626',
                  }}
                />
              </div>
              <span className="text-[9px] font-mono w-12 text-right"
                style={{ color: isLongSide ? '#15803d' : '#b91c1c' }}>
                {net >= 0 ? '+' : ''}{net.toFixed(1)}
              </span>
            </div>

            {/* MA 기울기 */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-gray-600 w-28 flex-shrink-0">MA100 기울기</span>
              <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                <div className="h-1.5 rounded-full bg-blue-400"
                  style={{ width: `${Math.min(100, (b.ma_slope / 13) * 100)}%` }} />
              </div>
              <span className="text-[9px] font-mono text-gray-400 w-12 text-right">
                {b.ma_slope.toFixed(1)}/13
              </span>
            </div>
          </div>

          {/* 수치 카드 */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {/* MA100 + MA150 */}
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-2.5 col-span-2">
              <div className="text-gray-400 mb-1">현재가 / MA100 / MA150</div>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="font-semibold font-mono text-gray-800">${d.price.toFixed(2)}</span>
                <span className="font-mono text-[11px]" style={{ color: d.ma_distance_pct >= 0 ? '#15803d' : '#b91c1c' }}>
                  MA100 {d.ma_distance_pct >= 0 ? '+' : ''}{d.ma_distance_pct.toFixed(2)}%
                </span>
                {d.ma150_distance_pct != null && (
                  <span className="font-mono text-[11px]" style={{ color: d.ma150_distance_pct >= 0 ? '#15803d' : '#b91c1c' }}>
                    MA150 {d.ma150_distance_pct >= 0 ? '+' : ''}{d.ma150_distance_pct.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>

            {[
              {
                t: 'RS vs SPY (52주)',
                v: d.rs_excess_pct != null
                  ? `${d.rs_excess_pct >= 0 ? '+' : ''}${d.rs_excess_pct.toFixed(2)}%`
                  : 'N/A',
                s: 'SPY 대비 52주 초과수익률',
                c: (d.rs_excess_pct ?? 0) >= 0 ? '#15803d' : '#b91c1c',
              },
              {
                t: 'MA100 기울기',
                v: d.slope_dir === 'bullish' ? '↑ 상향' : '↓ 하향',
                s: d.days_since_slope_turn ? `${d.days_since_slope_turn}일 전 방향 전환` : '-',
                c: d.slope_dir === 'bullish' ? '#15803d' : '#b91c1c',
              },
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
          </div>
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
  { icon: '🟩', text: '초록 = 🚀 롱 시그널 (상승 기대) · 색이 진할수록 점수 높음' },
  { icon: '🟥', text: '빨강 = 📉 숏 시그널 (하락 기대) · 색이 진할수록 점수 높음' },
  { icon: '🟨', text: '노랑/주황 = ⚡ 변곡 (Stage 1말→2초 / 3말→4초) · 진짜 타이밍' },
  { icon: '⬜',  text: '흰색/회색 = 중립 — 뚜렷한 방향 신호 없음' },
  { icon: 'MA%', text: 'MA+N% = 현재 주가가 MA100(100일 이평)보다 위/아래인 거리. 기간 수익률이 아님!' },
  { icon: 'RS%', text: '섹터 헤더 ▲▼N% = 섹터 ETF가 SPY보다 최근 60일간 얼마나 더/덜 올랐나 (기준: SPY=0%)' },
  { icon: '📈',  text: '셀 클릭 → 가격 차트 + RS 추이 그래프 + 상세 점수' },
  { icon: '🗂️',  text: '섹터 헤더 클릭 → 섹터 ETF 차트 + RS 추이 그래프' },
]

const HELP_SCORES = [
  { item: 'RS 52주   (0-30)', desc: 'SPY 대비 52주 초과수익 강도 — 50% 초과 = 만점. 음수면 0점' },
  { item: 'MA 위치   (0-20)', desc: '스위트스팟(0~+15%) = 고점 / 과연장(+30%↑) = 5점 고정 / MA아래 회복 직전도 가점' },
  { item: 'MA 기울기  (0-13)', desc: '기울기 방향 바꾼 지 얼마나 됐나 — 최근일수록 높음' },
  { item: '섹터 60일  (0-25)', desc: '섹터 ETF가 SPY보다 60일간 얼마나 강한가 — 25%↑ = 만점' },
  { item: '시장      (0-12)', desc: 'SPY MA100 위 +6 / SPY 기울기 상승 +6' },
  { item: 'RS 신선도  (+5)', desc: '52주 RS가 최근 30일 내 0선 돌파 시 보너스 +5점' },
]

// ─────────────────────────────────────────
// BottomUp — 신고가/신저가 필터 뷰
// ─────────────────────────────────────────

type HLFilter =
  | 'high52' | 'high26' | 'high13'   // 신고가 달성 (10일 이내)
  | 'near52' | 'near26'               // 신고가 후보 (3% 이내)
  | 'low52'  | 'low26'  | 'low13'    // 신저가 달성 (10일 이내)

type HLResult = { value: number; isNear: boolean }

const HL_DEFS: { key: HLFilter; label: string; isHigh: boolean; isNear?: boolean }[] = [
  { key: 'high52', label: '⭐ 52주 신고가 10일↓', isHigh: true               },
  { key: 'high26', label: '✨ 26주 신고가 10일↓', isHigh: true               },
  { key: 'high13', label: '🔔 13주 신고가 10일↓', isHigh: true               },
  { key: 'near52', label: '🎯 52주 신고가 3% 내', isHigh: true,  isNear: true },
  { key: 'near26', label: '🎯 26주 신고가 3% 내', isHigh: true,  isNear: true },
  { key: 'low52',  label: '📉 52주 신저가 10일↓', isHigh: false              },
  { key: 'low26',  label: '📉 26주 신저가 10일↓', isHigh: false              },
  { key: 'low13',  label: '📉 13주 신저가 10일↓', isHigh: false              },
]

function getHLResult(stock: StockItem, f: HLFilter): HLResult | null {
  const DAYS_THRESHOLD = 10
  const PCT_THRESHOLD  = 3.0
  switch (f) {
    case 'high52': { const d = stock.highs?.w52 ?? null;      return d != null && d <= DAYS_THRESHOLD ? { value: d, isNear: false } : null }
    case 'high26': { const d = stock.highs?.w26 ?? null;      return d != null && d <= DAYS_THRESHOLD ? { value: d, isNear: false } : null }
    case 'high13': { const d = stock.highs?.w13 ?? null;      return d != null && d <= DAYS_THRESHOLD ? { value: d, isNear: false } : null }
    case 'near52': { const p = stock.near_highs?.w52 ?? null; return p != null && p > 0 && p <= PCT_THRESHOLD ? { value: p, isNear: true  } : null }
    case 'near26': { const p = stock.near_highs?.w26 ?? null; return p != null && p > 0 && p <= PCT_THRESHOLD ? { value: p, isNear: true  } : null }
    case 'low52':  { const d = stock.lows?.w52  ?? null;      return d != null && d <= DAYS_THRESHOLD ? { value: d, isNear: false } : null }
    case 'low26':  { const d = stock.lows?.w26  ?? null;      return d != null && d <= DAYS_THRESHOLD ? { value: d, isNear: false } : null }
    case 'low13':  { const d = stock.lows?.w13  ?? null;      return d != null && d <= DAYS_THRESHOLD ? { value: d, isNear: false } : null }
  }
}

// 더 높은 우선순위 필터에도 해당하면 true → 하위 필터에서 제외
// 우선순위: high52 > high26 > high13 / near52 > near26 / low52 > low26 > low13
function isDominated(stock: StockItem, f: HLFilter): boolean {
  switch (f) {
    case 'high26': return getHLResult(stock, 'high52') !== null
    case 'high13': return getHLResult(stock, 'high52') !== null || getHLResult(stock, 'high26') !== null
    case 'near26': return getHLResult(stock, 'near52') !== null
    case 'low26':  return getHLResult(stock, 'low52')  !== null
    case 'low13':  return getHLResult(stock, 'low52')  !== null || getHLResult(stock, 'low26') !== null
    default:       return false
  }
}

function BottomUpView({
  sectors, hlFilter, onSelectStock,
}: {
  sectors:       SectorItem[]
  hlFilter:      HLFilter
  onSelectStock: (stock: StockItem, sectorEtf: string) => void
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
        const maColor  = stock.data.ma_distance_pct >= 0 ? '#166534' : '#991b1b'
        const valColor = isHigh ? '#15803d' : '#b91c1c'
        const badge    = result!.isNear
          ? `🎯 -${result!.value.toFixed(1)}%`
          : `${isHigh ? '⭐' : '📉'} ${result!.value}일 전`
        return (
          <button
            key={`${sec.id}-${stock.ticker}`}
            onClick={() => onSelectStock(stock, sec.etf)}
            className="flex flex-col items-center justify-center gap-0.5 p-1.5 rounded border border-gray-100 hover:opacity-75 active:opacity-50 transition-opacity cursor-pointer"
            style={{ background: getCellBg(stock.signal, stock.stage, stock.score), height: '68px' }}
          >
            <span className="text-[10px] font-bold text-gray-900 leading-none">{stock.ticker}</span>
            <span className="text-[7px] text-gray-500 leading-none">{sec.name}</span>
            <span className="text-[9px] font-bold leading-none" style={{ color: valColor }}>
              {badge}
            </span>
            <span className="text-[7px] font-mono leading-none" style={{ color: maColor }}>
              MA{stock.data.ma_distance_pct >= 0 ? '+' : ''}{stock.data.ma_distance_pct.toFixed(1)}%
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

export default function WatchlistClient() {
  const [data,              setData]              = useState<WatchlistData | null>(null)
  const [loading,           setLoading]           = useState(true)
  const [selectedStock,     setSelectedStock]     = useState<StockItem | null>(null)
  const [selectedSectorEtf, setSelectedSectorEtf] = useState<string>('')
  const [selectedSector,    setSelectedSector]    = useState<SectorItem | null>(null)
  const [viewMode,          setViewMode]          = useState<'topdown' | 'bottomup'>('topdown')
  const [hlFilter,          setHlFilter]          = useState<HLFilter>('high52')
  const [showHelp,          setShowHelp]          = useState(false)

  useEffect(() => {
    fetch('/data/watchlist.json', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: WatchlistData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
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
    long:  allStocks.filter(s => s.signal === 'long').length,
    short: allStocks.filter(s => s.signal === 'short').length,
  }

  const mktColor =
    mc.market_state === 'bull' ? '#15803d' :
    mc.market_state === 'bear' ? '#b91c1c' : '#92400e'

  const handleSelectStock = (stock: StockItem, etf: string) => {
    setSelectedStock(stock)
    setSelectedSectorEtf(etf)
  }

  return (
    <div>
      {/* ── 상단 시장 상태 바 ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold" style={{ color: mktColor }}>
            {mc.market_state.toUpperCase()}
          </span>
          <span className="text-xs text-gray-500">
            SPY{' '}
            <span className="font-mono font-semibold" style={{ color: mc.spy_ma_dist >= 0 ? '#15803d' : '#b91c1c' }}>
              {mc.spy_ma_dist >= 0 ? '+' : ''}{mc.spy_ma_dist.toFixed(1)}%
            </span>
            {' '}vs MA100
          </span>
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{
              background: mc.spy_slope === 'bullish' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              color:      mc.spy_slope === 'bullish' ? '#15803d' : '#b91c1c',
            }}
          >
            기울기 {mc.spy_slope === 'bullish' ? '↑' : '↓'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-600 font-bold">롱 {counts.long}</span>
          <span className="text-red-600 font-bold">숏 {counts.short}</span>
          <span className="text-gray-300 hidden sm:block">{data.asOf}</span>
        </div>
      </div>

      {/* ── 뷰 모드 토글 + 도움말 ── */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex gap-1.5">
          <button
            onClick={() => setViewMode('topdown')}
            className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
              viewMode === 'topdown'
                ? 'bg-gray-800 border-gray-800 text-white'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            📊 탑다운
          </button>
          <button
            onClick={() => setViewMode('bottomup')}
            className={`px-3 py-1 rounded text-xs font-medium border transition-all ${
              viewMode === 'bottomup'
                ? 'bg-gray-800 border-gray-800 text-white'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
            }`}
          >
            🔍 바텀업
          </button>
        </div>
        <button
          onClick={() => setShowHelp(v => !v)}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 border border-gray-200 px-2 py-1 rounded"
        >
          {showHelp ? '▲' : '❓'} 도움말
        </button>
      </div>

      {/* ── 바텀업 고가/저가 필터 칩 ── */}
      {viewMode === 'bottomup' && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {HL_DEFS.map(def => (
            <button
              key={def.key}
              onClick={() => setHlFilter(def.key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                hlFilter === def.key
                  ? (def.isNear
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : def.isHigh
                        ? 'bg-green-600 border-green-600 text-white'
                        : 'bg-red-600 border-red-600 text-white')
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'
              }`}
            >
              {def.label}
            </button>
          ))}
        </div>
      )}

      {/* ── 도움말 패널 (토글) ── */}
      {showHelp && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-100 rounded-xl space-y-3 text-[10px]">
          <div>
            <div className="font-semibold text-blue-700 mb-1.5">📖 히트맵 읽는 법</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-1 gap-x-4">
              {HELP_HOW_TO_READ.map(g => (
                <div key={g.icon} className="flex gap-2">
                  <span className="font-mono text-blue-500 w-8 flex-shrink-0 leading-tight">{g.icon}</span>
                  <span className="text-gray-600 leading-tight">{g.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-blue-100 pt-2">
            <div className="font-semibold text-blue-700 mb-1.5">📊 점수 구성 — bull/bear 각 0~105점, net = bull−bear</div>
            <div className="space-y-1">
              {HELP_SCORES.map(g => (
                <div key={g.item} className="flex gap-2">
                  <span className="font-mono text-blue-600 w-28 flex-shrink-0">{g.item}</span>
                  <span className="text-gray-600">{g.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="border-t border-blue-100 pt-1.5 text-[9px] text-blue-500">
            💡 바텀업: N일 전 = 해당 신고가/신저가 달성 후 경과 거래일 (0=오늘) · 최근 63거래일 내 기준
          </p>
        </div>
      )}

      {viewMode === 'topdown' ? (
        <>
          {/* ── 컬러 범례 ── */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2 text-[9px] text-gray-400 items-center">
            {[
              { bg: 'rgba(234,179,8,0.6)',  label: '⚡ 변곡' },
              { bg: 'rgba(34,197,94,0.55)', label: '🚀 롱' },
              { bg: 'rgba(239,68,68,0.55)', label: '📉 숏' },
              { bg: 'rgba(243,244,246,0.9)',label: '➖ 중립' },
            ].map(({ bg, label }) => (
              <div key={label} className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-sm" style={{ background: bg }} />
                <span>{label}</span>
              </div>
            ))}
            <span className="text-gray-300 ml-1">· 셀 숫자 = MA100 대비 거리 · ⭐ = 52주 신고가 10일 이내</span>
          </div>

          {/* ── 히트맵 본체 ── */}
          <div className="-mx-4 sm:-mx-6">
            <div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 bg-gray-300"
              style={{ gap: '3px' }}
            >
              {data.sectors.map(sector => (
                <SectorBlock
                  key={sector.id}
                  sector={sector}
                  onSelectStock={handleSelectStock}
                  onSelectSector={setSelectedSector}
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
      ) : (
        <BottomUpView
          sectors={data.sectors}
          hlFilter={hlFilter}
          onSelectStock={handleSelectStock}
        />
      )}

      {/* ── 모달들 ── */}
      {selectedStock && (
        <StockDetailModal
          stock={selectedStock}
          sectorEtf={selectedSectorEtf}
          onClose={() => setSelectedStock(null)}
        />
      )}
      {selectedSector && (
        <SectorChartModal sector={selectedSector} onClose={() => setSelectedSector(null)} />
      )}
    </div>
  )
}
