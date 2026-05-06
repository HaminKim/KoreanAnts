'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { KR_STOCK_NAMES, displayTicker } from '@/app/constants/stockNamesKR'
import { createChart, ColorType, AreaSeries, LineSeries, HistogramSeries } from 'lightweight-charts'

function naverUrl(ticker: string): string {
  return `https://finance.naver.com/item/main.naver?code=${displayTicker(ticker)}`
}

function stockName(ticker: string): string {
  const name = KR_STOCK_NAMES[ticker]
  if (!name) return displayTicker(ticker)
  return name.length > 6 ? name.slice(0, 6) + '.' : name
}

// ─────────────────────────────────────────
// Types (미국 버전과 동일 구조)
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
  rs_spy_line:     RSPoint[]   // 코스피 대비 RS
  rs_sector_line:  RSPoint[]
  highs:            HighLow
  lows:             HighLow
  near_highs:       NearHigh
  breakout_onsets?: BreakoutOnsets
  eps?:             EpsData | null
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
    kospi_price:   number
    kospi_ma100:   number
    kospi_ma_dist: number
    kospi_slope:   string
    market_state:  string
  }
  sectors: SectorItem[]
}

// ─────────────────────────────────────────
// 색상 헬퍼
// ─────────────────────────────────────────

function getCellBg(net: number): string {
  if (net === 0) return 'hsl(220,14%,96%)'
  const t = Math.min(1, Math.abs(net) / 72)
  const s = Math.round(12 + t * 63)
  const l = Math.round(97 - t * 54)
  return `hsl(${net > 0 ? 142 : 0},${s}%,${l}%)`
}

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
// RSSparkline
// ─────────────────────────────────────────

function RSSparkline({ data, label, uid }: { data: RSPoint[]; label: string; uid: string }) {
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

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ')
  const areaPath = `M${xS(0).toFixed(1)},${yZero.toFixed(1)} ` +
    data.map((d, i) => `L${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ') +
    ` L${xS(data.length - 1).toFixed(1)},${yZero.toFixed(1)} Z`

  const lastVal   = data[data.length - 1].v
  const lineColor = lastVal >= 0 ? '#16a34a' : '#dc2626'
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
          {crossDate && <span className="text-gray-400">0선 교차 {crossDate.slice(5)}</span>}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '68px', display: 'block' }}>
        <defs>
          <clipPath id={`above-kr-${uid}`}><rect x={PAD.l} y={PAD.t} width={innerW} height={yZero - PAD.t} /></clipPath>
          <clipPath id={`below-kr-${uid}`}><rect x={PAD.l} y={yZero} width={innerW} height={innerH / 2 + 2} /></clipPath>
        </defs>
        <path d={areaPath} fill="rgba(34,197,94,0.18)"  clipPath={`url(#above-kr-${uid})`} />
        <path d={areaPath} fill="rgba(239,68,68,0.18)"  clipPath={`url(#below-kr-${uid})`} />
        <line x1={PAD.l} y1={yZero} x2={W - PAD.r} y2={yZero} stroke="#9ca3af" strokeWidth={0.6} strokeDasharray="3,2" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.4} strokeLinejoin="round" />
        <circle cx={xS(data.length - 1)} cy={yS(lastVal)} r={2.5} fill={lineColor} />
        <text x={PAD.l - 2} y={PAD.t + 4}    fontSize={8} textAnchor="end" fill="#9ca3af">+{maxAbs.toFixed(1)}</text>
        <text x={PAD.l - 2} y={yZero}         fontSize={8} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">0</text>
        <text x={PAD.l - 2} y={H - PAD.b - 2} fontSize={8} textAnchor="end" fill="#9ca3af">-{maxAbs.toFixed(1)}</text>
        <text x={PAD.l}     y={H - 3} fontSize={7} fill="#d1d5db">{data[0].d.slice(5)}</text>
        <text x={W - PAD.r} y={H - 3} fontSize={7} fill="#d1d5db" textAnchor="end">{data[data.length - 1].d.slice(5)}</text>
      </svg>
    </div>
  )
}

// ─────────────────────────────────────────
// RSLineChart (정규화 RS, 기준 100)
// ─────────────────────────────────────────

function calcEMA(data: RSPoint[], period: number): RSPoint[] {
  if (data.length === 0) return []
  const k   = 2 / (period + 1)
  const out: RSPoint[] = []
  let ema = data[0].v
  data.forEach((p, i) => {
    if (i === 0) { out.push({ d: p.d, v: ema }); return }
    ema = p.v * k + ema * (1 - k)
    out.push({ d: p.d, v: ema })
  })
  return out
}

function RSLineChart({ data, label, uid }: { data: RSPoint[]; label: string; uid: string }) {
  if (!data || data.length < 3) return null

  const W = 400, H = 90
  const PAD  = { l: 38, r: 8, t: 6, b: 18 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const base   = 100
  const values = data.map(d => d.v)
  const minV   = Math.min(...values)
  const maxV   = Math.max(...values)
  const range  = Math.max(maxV - minV, 5)
  const padded = range * 0.15

  const lo = minV - padded
  const hi = maxV + padded

  const xS = (i: number) => PAD.l + (i / (data.length - 1)) * innerW
  const yS = (v: number) => PAD.t + innerH * (1 - (v - lo) / (hi - lo))
  const yBase = yS(base)

  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ')
  const areaPath =
    `M${xS(0).toFixed(1)},${yBase.toFixed(1)} ` +
    data.map((d, i) => `L${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ') +
    ` L${xS(data.length - 1).toFixed(1)},${yBase.toFixed(1)} Z`

  const ema20  = calcEMA(data, 20)
  const emaPath = ema20.map((d, i) => `${i === 0 ? 'M' : 'L'}${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ')

  const lastVal   = data[data.length - 1].v
  const lineColor = lastVal >= base ? '#16a34a' : '#dc2626'

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">{label}</span>
        <span className="text-[9px] font-mono font-bold" style={{ color: lineColor }}>
          현재 {lastVal.toFixed(1)} ({lastVal >= base ? '+' : ''}{(lastVal - base).toFixed(1)})
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '80px', display: 'block' }}>
        <defs>
          <clipPath id={`aL-kr-${uid}`}><rect x={PAD.l} y={PAD.t} width={innerW} height={Math.max(0, yBase - PAD.t)} /></clipPath>
          <clipPath id={`bL-kr-${uid}`}><rect x={PAD.l} y={yBase} width={innerW} height={Math.max(0, H - PAD.b - yBase)} /></clipPath>
        </defs>
        <path d={areaPath} fill="rgba(34,197,94,0.15)"  clipPath={`url(#aL-kr-${uid})`} />
        <path d={areaPath} fill="rgba(239,68,68,0.15)"  clipPath={`url(#bL-kr-${uid})`} />
        <line x1={PAD.l} y1={yBase} x2={W - PAD.r} y2={yBase} stroke="#9ca3af" strokeWidth={0.6} strokeDasharray="3,2" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinejoin="round" />
        <path d={emaPath}  fill="none" stroke="#9ca3af"   strokeWidth={0.8} strokeLinejoin="round" strokeDasharray="2,2" />
        <circle cx={xS(data.length - 1)} cy={yS(lastVal)} r={2.5} fill={lineColor} />
        <text x={PAD.l - 2} y={yS(hi) + 4}   fontSize={7.5} textAnchor="end" fill="#9ca3af">{hi.toFixed(0)}</text>
        <text x={PAD.l - 2} y={yBase}         fontSize={7.5} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">{base}</text>
        <text x={PAD.l - 2} y={yS(lo) - 2}   fontSize={7.5} textAnchor="end" fill="#9ca3af">{lo.toFixed(0)}</text>
        <text x={PAD.l}     y={H - 3} fontSize={7} fill="#d1d5db">{data[0].d.slice(5)}</text>
        <text x={W - PAD.r} y={H - 3} fontSize={7} fill="#d1d5db" textAnchor="end">{data[data.length - 1].d.slice(5)}</text>
      </svg>
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
      title={`${KR_STOCK_NAMES[stock.ticker] ?? displayTicker(stock.ticker)} (${displayTicker(stock.ticker)}) | MA100 대비 ${stock.data.ma_distance_pct >= 0 ? '+' : ''}${stock.data.ma_distance_pct.toFixed(1)}% | ${SIGNAL_KO[stock.signal]}`}
      className="relative flex flex-col items-center justify-center w-full transition-opacity hover:opacity-80 active:opacity-60 cursor-pointer select-none"
      style={{ background: getCellBg(net), height: '54px', gap: '1px' }}
    >
      {show52High && <span className="absolute top-0.5 right-0.5 text-[8px] leading-none opacity-70">★</span>}
      {!show52High && show52Low && <span className="absolute top-0.5 right-0.5 text-[7px] leading-none opacity-60">▼</span>}
      <span className="text-[9px] font-bold leading-none truncate w-full text-center px-0.5" style={{ color: colors.ticker }}>
        {stockName(stock.ticker)}
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
  onSelectStock:  (stock: StockItem, sectorEtf: string, sectorName: string, sectorStocks: StockItem[]) => void
  onSelectSector: (sector: SectorItem) => void
}) {
  const rs = sector.sector_rs_excess
  const rsPositive = rs !== null && rs > 0

  return (
    <div className="bg-white border-r border-b border-gray-200 overflow-hidden">
      {sector.etf === 'KOSPI' ? (
        <button
          onClick={() => onSelectSector(sector)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer"
          title="한국 시장 기준 (코스피)"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm">🇰🇷</span>
            <span className="text-[10px] font-bold text-gray-800 truncate">시장 코스피</span>
          </div>
          <span className="text-[11px] font-black tabular-nums px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
            = 0
          </span>
        </button>
      ) : (
        <button
          onClick={() => onSelectSector(sector)}
          className="w-full flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
          title={`${sector.name} (${displayTicker(sector.etf)}) — 코스피 대비 60일 초과수익 ${rs !== null ? (rs >= 0 ? '+' : '') + rs.toFixed(2) + '%' : 'N/A'}`}
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
                  color:       sector.sector_rs_slope_dir === 'up' ? '#16a34a' : '#dc2626',
                  background:  sector.sector_rs_slope_dir === 'up' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                  borderColor: sector.sector_rs_slope_dir === 'up' ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.25)',
                }}
              >
                {sector.sector_rs_slope_dir === 'up' ? '↗' : '↘'} {sector.sector_rs_slope_days}d
              </span>
            )}
          </div>
        </button>
      )}

      <div className="grid grid-cols-5 bg-gray-100" style={{ gap: '1px', padding: '1px' }}>
        {sector.stocks.map(stock => (
          <StockCell key={stock.ticker} stock={stock} onClick={() => onSelectStock(stock, sector.etf, sector.name, sector.stocks)} />
        ))}
        {Array.from({ length: Math.max(0, 15 - sector.stocks.length) }).map((_, i) => (
          <div key={i} className="bg-white" style={{ height: '54px' }} />
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// KRStockChart — Lightweight Charts 인라인 주가 차트
// ─────────────────────────────────────────

function formatKoreanWon(v: number): string {
  if (v >= 100_000_000) {
    const uk  = Math.floor(v / 100_000_000)
    const man = Math.floor((v % 100_000_000) / 10_000)
    return man > 0 ? `${uk}억 ${man}만` : `${uk}억`
  }
  if (v >= 10_000) {
    const man  = Math.floor(v / 10_000)
    const rest = Math.round(v % 10_000)
    return rest > 0 ? `${man}만 ${rest.toLocaleString()}` : `${man}만`
  }
  return Math.round(v).toLocaleString()
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}K`
  return String(v)
}

function KRStockChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(false)

  useEffect(() => {
    if (!containerRef.current) return
    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any = null

    // prevent modal scroll from swallowing wheel events on the chart
    const el = containerRef.current
    const stopWheel = (e: WheelEvent) => e.stopPropagation()
    el.addEventListener('wheel', stopWheel, { passive: false })

    async function load() {
      try {
        const res  = await fetch(`/api/chart?ticker=${encodeURIComponent(ticker)}`)
        const json = await res.json()
        if (cancelled || !containerRef.current) return
        if (!json.data || json.data.length === 0) { setError(true); return }

        const raw: { time: string; value: number; volume?: number }[] = json.data
        const data    = raw.map(d => ({ time: d.time, value: d.value }))
        const volData = raw
          .filter(d => d.volume != null && d.volume > 0)
          .map(d => ({ time: d.time, value: d.volume as number, color: 'rgba(100,116,139,0.35)' }))

        function calcMA(n: number) {
          return data.flatMap((_, i) => {
            if (i < n - 1) return []
            const avg = data.slice(i - n + 1, i + 1).reduce((s, d) => s + d.value, 0) / n
            return [{ time: data[i].time, value: avg }]
          })
        }

        chart = createChart(containerRef.current!, {
          layout:  { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9ca3af' },
          grid:    { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
          rightPriceScale: { borderColor: '#e5e7eb' },
          timeScale:       { borderColor: '#e5e7eb', timeVisible: false },
          crosshair: { mode: 1 },
          handleScroll: { mouseWheel: true, pressedMouseMove: true },
          handleScale:  { mouseWheel: true, pinch: true },
          width:  containerRef.current!.clientWidth,
          height: 320,
          localization: {
            priceFormatter: (v: number) => formatKoreanWon(v),
          },
        })

        // ── 주가 영역
        const area = chart.addSeries(AreaSeries, {
          lineColor:        '#3b82f6',
          topColor:         'rgba(59,130,246,0.10)',
          bottomColor:      'rgba(59,130,246,0)',
          lineWidth:        1.5,
          priceLineVisible: false,
          lastValueVisible: true,
          priceScaleId:     'right',
        })
        area.setData(data)

        // ── MA선
        const MA_DEFS = [
          { n: 5,   color: '#f59e0b' },
          { n: 20,  color: '#10b981' },
          { n: 60,  color: '#8b5cf6' },
          { n: 100, color: '#ef4444' },
          { n: 150, color: '#06b6d4' },
        ]
        for (const { n, color } of MA_DEFS) {
          const maData = calcMA(n)
          if (maData.length < 2) continue
          const line = chart.addSeries(LineSeries, {
            color, lineWidth: 1,
            priceLineVisible: false, lastValueVisible: false, crossHairMarkerVisible: false,
            priceScaleId: 'right',
          })
          line.setData(maData)
        }

        // ── 거래량 히스토그램 (별도 스케일) — v5: add series first, then applyOptions on the series
        if (volData.length > 0) {
          const vol = chart.addSeries(HistogramSeries, {
            priceScaleId:    'vol',
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: { type: 'custom', formatter: (v: number) => formatVolume(v) },
          })
          vol.priceScale().applyOptions({
            scaleMargins: { top: 0.80, bottom: 0 },
            borderVisible: false,
          })
          vol.setData(volData)
        }

        chart.timeScale().fitContent()
        setLoading(false)
      } catch {
        if (!cancelled) setError(true)
      }
    }

    load()
    return () => {
      cancelled = true
      el.removeEventListener('wheel', stopWheel)
      try { chart?.remove() } catch { /* ignore */ }
    }
  }, [ticker])

  return (
    <div className="relative bg-white" style={{ height: '320px' }}>
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm z-10">
          차트 로딩 중...
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 text-sm z-10">
          차트 데이터 없음
        </div>
      )}
      <div ref={containerRef} style={{ height: '320px' }} />
    </div>
  )
}

// ─────────────────────────────────────────
// EPS / Revenue 헬퍼
// ─────────────────────────────────────────

function calcChange(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null
  return (cur - prev) / Math.abs(prev) * 100
}

function fmtChg(v: number | null): { text: string; color: string } {
  if (v == null) return { text: '─', color: '#9ca3af' }
  const sign = v >= 0 ? '+' : ''
  return { text: `${sign}${v.toFixed(1)}%`, color: v >= 0 ? '#15803d' : '#b91c1c' }
}

function fmtKRW(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 10000) return `${(v / 10000).toFixed(0)}만`
  if (abs >= 1000)  return `${(v / 1000).toFixed(1)}천`
  return v.toFixed(0)
}

function fmtAuk(v: number): string {
  if (v >= 10000) {
    const jo = Math.floor(v / 10000)
    const ok = Math.round(v % 10000)
    return ok > 0 ? `${jo}조 ${ok.toLocaleString()}억` : `${jo}조`
  }
  if (v >= 1000)  return `${Math.round(v).toLocaleString()}억`
  return `${v.toFixed(0)}억`
}

// ─────────────────────────────────────────
// EPSChartKR — 분기별 EPS (원화)
// ─────────────────────────────────────────

function EPSChartKR({ eps }: { eps: EpsData }) {
  const history = eps.history.filter(q => q.actual !== null) as (EpsQuarter & { actual: number })[]
  if (history.length < 2) return null

  const W = 400, H = 100
  const PAD = { l: 52, r: 8, t: 14, b: 22 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const allVals = [
    ...history.map(q => q.actual),
    ...history.filter(q => q.estimate != null).map(q => q.estimate as number),
    0,
  ]
  const rawMax = Math.max(...allVals)
  const rawMin = Math.min(...allVals)
  const pad    = Math.max((rawMax - rawMin) * 0.18, 1)
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
  const hasEstimate = history.some(q => q.estimate != null)

  const latestDate = history[history.length - 1]?.d ?? ''
  const isStale = latestDate < '2025-10'

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">
          EPS (분기 / ₩) — 점선=추정치 — {history.length}Q
          {isStale && <span className="ml-1 text-orange-400">⚠ 구데이터</span>}
        </span>
        {trend && (
          <span className="text-[9px] font-bold" style={{ color: trendColor }}>
            {trendIcon} {trendLabel} <span className="text-gray-300 font-normal">({latestDate.slice(2, 7)})</span>
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '90px', display: 'block' }}>
        {/* 0선 */}
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

          // 추정치 있으면 beat/miss 색상, 없으면 기본 파랑/빨강
          let fill: string
          if (q.estimate != null) {
            fill = q.actual >= q.estimate
              ? 'rgba(34,197,94,0.75)'   // beat → 초록
              : 'rgba(239,68,68,0.75)'   // miss → 빨강
          } else {
            fill = isPos ? 'rgba(59,130,246,0.60)' : 'rgba(239,68,68,0.60)'
          }

          return (
            <g key={q.d}>
              <rect x={cx - barW / 2} y={barTop} width={barW} height={barH} fill={fill} rx={1} />
              {/* 추정치 점선 */}
              {q.estimate != null && (
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

        <text x={PAD.l - 2} y={PAD.t + 3}     fontSize={6} textAnchor="end" fill="#9ca3af">₩{fmtKRW(yMax)}</text>
        {zeroY >= PAD.t && zeroY <= H - PAD.b && (
          <text x={PAD.l - 2} y={zeroY} fontSize={6} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">0</text>
        )}
        <text x={PAD.l - 2} y={H - PAD.b + 2} fontSize={6} textAnchor="end" fill="#9ca3af">₩{fmtKRW(yMin)}</text>
      </svg>

      <div className="overflow-x-auto mt-1">
        <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th className="text-left px-1.5 py-0.5 text-gray-400 font-normal">분기</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">EPS(₩)</th>
              {hasEstimate && <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">추정치</th>}
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전분기比</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전년比</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((q, ri) => {
              const i    = history.length - 1 - ri
              const qoq  = calcChange(q.actual, history[i - 1]?.actual)
              const yoy  = calcChange(q.actual, history[i - 4]?.actual)
              const beat = q.estimate != null ? q.actual >= q.estimate : null
              return (
                <tr key={q.d} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td className="px-1.5 py-0.5 font-mono text-gray-500">{q.d.slice(2, 7)}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right font-semibold"
                    style={{ color: q.actual >= 0 ? '#15803d' : '#b91c1c' }}>
                    ₩{q.actual.toLocaleString()}
                  </td>
                  {hasEstimate && (
                    <td className="px-1.5 py-0.5 font-mono text-right text-gray-400">
                      {q.estimate != null ? `₩${q.estimate.toLocaleString()}` : '─'}
                      {beat !== null && (
                        <span className="ml-0.5" style={{ color: beat ? '#15803d' : '#b91c1c' }}>
                          {beat ? '▲' : '▼'}
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: fmtChg(qoq).color }}>{fmtChg(qoq).text}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: fmtChg(yoy).color }}>{fmtChg(yoy).text}</td>
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
// RevenueChartKR — 분기별 매출 (억원)
// ─────────────────────────────────────────

function RevenueChartKR({ eps }: { eps: EpsData }) {
  const history = eps.history.filter(q => q.revenue != null) as (EpsQuarter & { revenue: number })[]
  if (history.length < 2) return null

  const W = 400, H = 80
  const PAD = { l: 48, r: 8, t: 10, b: 22 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b

  const vals   = history.map(q => q.revenue)
  const rawMax = Math.max(...vals)
  const rawMin = Math.min(...vals, 0)
  const pad    = Math.max((rawMax - rawMin) * 0.12, 1)
  const yMax   = rawMax + pad
  const yMin   = Math.max(0, rawMin - pad)
  const toY    = (v: number) => PAD.t + innerH * (1 - (v - yMin) / (yMax - yMin))
  const baseY  = toY(yMin)

  const gap  = innerW / history.length
  const barW = Math.max(5, gap * 0.55)

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">매출 (분기 / 억원) — {history.length}Q</span>
      </div>
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
        <text x={PAD.l - 2} y={PAD.t + 4}     fontSize={6} textAnchor="end" fill="#9ca3af">{fmtAuk(yMax)}</text>
        <text x={PAD.l - 2} y={H - PAD.b + 2}  fontSize={6} textAnchor="end" fill="#9ca3af">{fmtAuk(yMin)}</text>
      </svg>
      <div className="overflow-x-auto mt-1">
        <table className="w-full text-[9px]" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th className="text-left px-1.5 py-0.5 text-gray-400 font-normal">분기</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">매출(억원)</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전분기比</th>
              <th className="text-right px-1.5 py-0.5 text-gray-400 font-normal">전년比</th>
            </tr>
          </thead>
          <tbody>
            {[...history].reverse().map((q, ri) => {
              const i   = history.length - 1 - ri
              const qoq = calcChange(q.revenue, history[i - 1]?.revenue)
              const yoy = calcChange(q.revenue, history[i - 4]?.revenue)
              return (
                <tr key={q.d} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td className="px-1.5 py-0.5 font-mono text-gray-500">{q.d.slice(2, 7)}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right font-semibold text-blue-700">
                    {fmtAuk(q.revenue)}
                  </td>
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: fmtChg(qoq).color }}>{fmtChg(qoq).text}</td>
                  <td className="px-1.5 py-0.5 font-mono text-right" style={{ color: fmtChg(yoy).color }}>{fmtChg(yoy).text}</td>
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

  const [show, setShow] = useState({ rs: true, cards: true, eps: true, revenue: true })
  const toggle = (key: keyof typeof show) => setShow(prev => ({ ...prev, [key]: !prev[key] }))
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
  const [saving, setSaving]   = useState(false)
  const isSaved  = savedTickers.has(stock.ticker)
  const stockUrl = naverUrl(stock.ticker)

  const handleStar = async () => {
    if (!userId || isSaved || saving) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('personal_watchlist_kr').insert({
      user_id: userId,
      ticker:  stock.ticker,
      name:    KR_STOCK_NAMES[stock.ticker] || displayTicker(stock.ticker),
      sector:  sectorName || sectorEtf,
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
            <span className="text-xl font-bold text-gray-900">{displayTicker(stock.ticker)}</span>
            {KR_STOCK_NAMES[stock.ticker] && (
              <span className="text-xs text-gray-400">{KR_STOCK_NAMES[stock.ticker]}</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
              {STAGE_ABBR[stock.stage]} {stock.stage}
            </span>
            <span className="text-sm text-gray-500">{SIGNAL_KO[stock.signal]}</span>
            <span className="text-sm font-bold ml-1" style={{ color: isLongSide ? '#15803d' : '#b91c1c' }}>
              net {net >= 0 ? '+' : ''}{net.toFixed(1)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">MA 5·20·50·100·150</span>
            <button
              onClick={() => setFullscreen(v => !v)}
              title={fullscreen ? '작게 보기' : '전체화면'}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none transition-colors"
            >
              {fullscreen ? '⊡' : '⤢'}
            </button>
            {userId && (
              <button
                onClick={handleStar}
                disabled={isSaved || saving}
                title={isSaved ? '관심종목에 저장됨' : '관심종목에 추가'}
                className={`text-xl leading-none transition-all ${isSaved ? 'text-yellow-400' : 'text-gray-300 hover:text-yellow-400'} disabled:cursor-default`}
              >
                {isSaved ? '⭐' : '☆'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
        </div>

        {/* 신고가/신저가 뱃지 */}
        {!fullscreen && (stock.highs?.w52 != null || stock.highs?.w26 != null || stock.highs?.w13 != null ||
          stock.lows?.w52 != null || stock.lows?.w26 != null || stock.lows?.w13 != null) && (
          <div className="flex flex-wrap gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50">
            {stock.highs?.w52 != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">⭐ 52주 신고가 {stock.highs.w52}일 전</span>}
            {stock.highs?.w26 != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">✨ 26주 신고가 {stock.highs.w26}일 전</span>}
            {stock.highs?.w13 != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">🔔 13주 신고가 {stock.highs.w13}일 전</span>}
            {stock.lows?.w52  != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">📉 52주 신저가 {stock.lows.w52}일 전</span>}
            {stock.lows?.w26  != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">📉 26주 신저가 {stock.lows.w26}일 전</span>}
            {stock.lows?.w13  != null && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">📉 13주 신저가 {stock.lows.w13}일 전</span>}
          </div>
        )}

        {/* 주가 차트 */}
        {!fullscreen && (
          <div className="border-b border-gray-100">
            <KRStockChart ticker={stock.ticker} />
            <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50">
              <span className="text-[9px] text-gray-300">MA 5·20·60·100·150</span>
              <a
                href={stockUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-[10px] text-[#03C75A] hover:underline font-semibold"
              >
                네이버 금융 ↗
              </a>
            </div>
          </div>
        )}

        {/* 섹션 토글 */}
        {!fullscreen && (
          <div className="flex flex-wrap gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50">
            {([
              { key: 'rs',      label: 'RS 차트' },
              { key: 'cards',   label: '수치카드' },
              { key: 'eps',     label: 'EPS' },
              { key: 'revenue', label: '매출' },
            ] as { key: keyof typeof show; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className="text-[10px] px-2 py-0.5 rounded-full border transition-colors"
                style={{
                  background:  show[key] ? '#1f2937' : '#fff',
                  color:       show[key] ? '#fff'    : '#9ca3af',
                  borderColor: show[key] ? '#1f2937' : '#e5e7eb',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* 스크롤 영역 */}
        <div className={`flex-1 min-h-0 overflow-y-auto ${fullscreen ? 'p-6' : 'p-4'}`}>
          {fullscreen ? (
            <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto">
              {stock.rs_spy_line && stock.rs_spy_line.length >= 3 && (
                <div className="w-full">
                  <RSLineChart data={stock.rs_spy_line} label="vs 코스피 (1년)" uid={`kospi-fs-${stock.ticker}`} />
                </div>
              )}
              {stock.rs_sector_line && stock.rs_sector_line.length >= 3 && (
                <div className="w-full">
                  <RSLineChart data={stock.rs_sector_line} label={`vs ${KR_STOCK_NAMES[sectorEtf] ?? sectorName} (1년)`} uid={`etf-fs-${stock.ticker}`} />
                </div>
              )}
              <div className="w-full grid grid-cols-2 gap-3 text-xs">
                {[
                  {
                    t: '섹터 RS vs 코스피 (60일)',
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
              {show.rs && (
                <>
                  {stock.rs_spy_line && stock.rs_spy_line.length >= 3 && (
                    <RSLineChart data={stock.rs_spy_line} label="vs 코스피 (1년)" uid={`kospi-${stock.ticker}`} />
                  )}
                  {stock.rs_sector_line && stock.rs_sector_line.length >= 3 && (
                    <RSLineChart data={stock.rs_sector_line} label={`vs ${KR_STOCK_NAMES[sectorEtf] ?? sectorName} (1년)`} uid={`etf-${stock.ticker}`} />
                  )}
                </>
              )}
              {show.cards && (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    {
                      t: '섹터 RS vs 코스피 (60일)',
                      v: d.sector_rs_excess != null ? `${d.sector_rs_excess >= 0 ? '+' : ''}${d.sector_rs_excess.toFixed(2)}%` : 'N/A',
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
              )}
              {show.eps && stock.eps && stock.eps.history.filter(q => q.actual !== null).length >= 2 && (
                <EPSChartKR eps={stock.eps} />
              )}
              {show.revenue && stock.eps && stock.eps.history.some(q => q.revenue != null) && (
                <RevenueChartKR eps={stock.eps} />
              )}
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
  const isMarket = sector.etf === 'KOSPI'
  const etfUrl   = isMarket ? null : naverUrl(sector.etf)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white border border-gray-200 rounded-2xl shadow-2xl w-full overflow-hidden"
        style={{ maxWidth: '800px', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">{sector.emoji}</span>
            <span className="font-bold text-gray-900">{sector.name}</span>
            {KR_STOCK_NAMES[sector.etf] && (
              <span className="text-xs text-gray-400">{KR_STOCK_NAMES[sector.etf]}</span>
            )}
            {rs !== null && (
              <span className="text-xs font-mono font-bold" style={{ color: rsPositive ? '#15803d' : '#b91c1c' }}>
                {rsPositive ? '▲' : '▼'} {Math.abs(rs).toFixed(2)}% vs 코스피
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">MA 5·20·50·100·150</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">✕</button>
          </div>
        </div>

        {sector.sector_rs_history && sector.sector_rs_history.length >= 3 && (
          <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50">
            <RSSparkline
              data={sector.sector_rs_history}
              label={`${KR_STOCK_NAMES[sector.etf] ?? sector.name} RS vs 코스피  (섹터 60일 초과수익률,  최근 ${sector.sector_rs_history.length}거래일)`}
              uid={`sec-kr-${sector.etf}`}
            />
          </div>
        )}

        {!isMarket ? (
          <div className="border-t border-gray-100">
            <KRStockChart ticker={sector.etf} />
            <div className="flex items-center justify-between px-4 py-1.5 bg-gray-50">
              <span className="text-[9px] text-gray-300">MA 5·20·60·100·150</span>
              {etfUrl && (
                <a
                  href={etfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-[#03C75A] hover:underline font-semibold"
                >
                  네이버 금융 ↗
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            코스피 지수 기준 섹터 — ETF 차트 없음
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// BottomUp 필터 뷰
// ─────────────────────────────────────────

type HLFilter =
  | 'break52' | 'break26' | 'break13'
  | 'hold52'  | 'hold26'
  | 'near52'  | 'near26'
  | 'low52'   | 'low26'   | 'low13'

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
  const BREAK_DAYS = 10, HOLD_DAYS = 60, HOLD_PCT = 7.0, NEAR_PCT = 7.0, LOW_DAYS = 10
  switch (f) {
    case 'break52': { const d = stock.breakout_onsets?.w52 ?? null; return d != null && d <= BREAK_DAYS ? { value: d, isNear: false } : null }
    case 'break26': { const d = stock.breakout_onsets?.w26 ?? null; return d != null && d <= BREAK_DAYS ? { value: d, isNear: false } : null }
    case 'break13': { const d = stock.breakout_onsets?.w13 ?? null; return d != null && d <= BREAK_DAYS ? { value: d, isNear: false } : null }
    case 'hold52': { const d = stock.highs?.w52 ?? null; const p = stock.near_highs?.w52 ?? null; return d != null && d <= HOLD_DAYS && p != null && p <= HOLD_PCT ? { value: d, isNear: false } : null }
    case 'hold26': { const d = stock.highs?.w26 ?? null; const p = stock.near_highs?.w26 ?? null; return d != null && d <= HOLD_DAYS && p != null && p <= HOLD_PCT ? { value: d, isNear: false } : null }
    case 'near52': { const p = stock.near_highs?.w52 ?? null; return p != null && p <= NEAR_PCT ? { value: p, isNear: true  } : null }
    case 'near26': { const p = stock.near_highs?.w26 ?? null; return p != null && p <= NEAR_PCT ? { value: p, isNear: true  } : null }
    case 'low52':  { const d = stock.lows?.w52 ?? null; return d != null && d <= LOW_DAYS ? { value: d, isNear: false } : null }
    case 'low26':  { const d = stock.lows?.w26 ?? null; return d != null && d <= LOW_DAYS ? { value: d, isNear: false } : null }
    case 'low13':  { const d = stock.lows?.w13 ?? null; return d != null && d <= LOW_DAYS ? { value: d, isNear: false } : null }
  }
}

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
    return <div className="flex items-center justify-center py-16 text-gray-400 text-sm">해당 조건의 종목 없음</div>
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 mt-2">
      {items.map(({ stock, sec, result }) => {
        const net    = stock.breakdown.net_direction
        const colors = getCellTextColor(net)
        const badge  = result!.isNear ? `-${result!.value.toFixed(1)}%` : `${result!.value}일 전`
        return (
          <button
            key={`${sec.id}-${stock.ticker}`}
            onClick={() => onSelectStock(stock, sec.etf, sec.name, sec.stocks)}
            className="flex flex-col items-center justify-center gap-0.5 p-1.5 rounded hover:opacity-80 active:opacity-60 transition-opacity cursor-pointer"
            style={{ background: getCellBg(net), height: '68px' }}
          >
            <span className="text-[9px] font-bold leading-none truncate w-full text-center px-0.5" style={{ color: colors.ticker }}>{stockName(stock.ticker)}</span>
            <span className="text-[7px] leading-none" style={{ color: colors.sub }}>{sec.name}</span>
            <span className="text-[9px] font-bold leading-none" style={{ color: isHigh ? colors.ticker : colors.ticker }}>{badge}</span>
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
  const [hoveredId, setHoveredId] = useState<number | null>(null)
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

  const activeSectors = sectors.filter(s => s.etf !== 'KOSPI')
  if (activeSectors.length === 0 || !activeSectors[0].sector_rs_history?.length) return null

  const allDates  = activeSectors[0].sector_rs_history.map(h => h.d)
  const sliced    = allDates.slice(-days)
  const startIdx  = allDates.length - days
  const D         = sliced.length
  const N         = activeSectors.length

  const ranksByDate: Map<number, number>[] = sliced.map((_, di) => {
    const absIdx = startIdx + di
    const vals   = activeSectors.map(s => ({ id: s.id, v: s.sector_rs_history[absIdx]?.v ?? -Infinity }))
    vals.sort((a, b) => b.v - a.v)
    const map = new Map<number, number>()
    vals.forEach((s, i) => map.set(s.id, i + 1))
    return map
  })

  const LEFT_PAD = 34, RIGHT_PAD = 28, DATE_LABEL_H = 36, BOT_PAD = 10, ROW_H = 30
  const COL_W = containerWidth > 0 ? Math.max(8, Math.floor((containerWidth - LEFT_PAD - RIGHT_PAD) / D)) : 14
  const W = LEFT_PAD + D * COL_W + RIGHT_PAD
  const H = DATE_LABEL_H + N * ROW_H + BOT_PAD

  const xOf = (di: number) => LEFT_PAD + di * COL_W + COL_W / 2
  const yOf = (rank: number) => DATE_LABEL_H + (rank - 1) * ROW_H + ROW_H / 2
  const dateStep = COL_W >= 28 ? 1 : COL_W >= 18 ? 2 : COL_W >= 12 ? 3 : 5

  if (containerWidth === 0) return <div ref={containerRef} style={{ minHeight: 200 }} />

  return (
    <div className="mt-2" ref={containerRef}>
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-[11px] text-gray-400 font-semibold mr-1">기간</span>
        {([20, 30, 60] as const).map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${days === d ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            {d}일
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ minWidth: W }}>
          {/* 날짜 레이블 */}
          {sliced.map((d, di) => di % dateStep === 0 && (
            <text key={d} x={xOf(di)} y={DATE_LABEL_H - 6} fontSize={8} fill="#9ca3af" textAnchor="middle">{d.slice(5)}</text>
          ))}

          {activeSectors.map((sector, si) => {
            const color   = BUMP_COLORS[si % BUMP_COLORS.length]
            const ranks   = sliced.map((_, di) => ranksByDate[di].get(sector.id) ?? N)
            const dimmed  = hoveredId !== null && hoveredId !== sector.id
            const isHover = hoveredId === sector.id

            const pathD = ranks
              .map((rank, di) => `${di === 0 ? 'M' : 'L'}${xOf(di).toFixed(1)},${yOf(rank).toFixed(1)}`)
              .join(' ')

            const lastRank = ranks[D - 1]
            const lastY    = yOf(lastRank)
            const prevRank = D >= 2 ? ranks[D - 2] : lastRank
            const delta    = prevRank - lastRank

            return (
              <g key={sector.id} onMouseEnter={() => setHoveredId(sector.id)} onMouseLeave={() => setHoveredId(null)}>
                <path d={pathD} fill="none" stroke={dimmed ? '#e5e7eb' : color}
                  strokeWidth={isHover ? 2.5 : 1.5} strokeLinejoin="round" strokeLinecap="round" opacity={dimmed ? 0.4 : 1} />
                {isHover && ranks.map((rank, di) => (
                  <circle key={di} cx={xOf(di)} cy={yOf(rank)} r={2} fill={color} opacity={0.7} />
                ))}
                {isHover ? (
                  <text x={xOf(D - 1) + 8} y={lastY} fontSize={10.5} fill={color} fontWeight="bold" dominantBaseline="middle">
                    {`${lastRank}위 ${sector.emoji} ${sector.name}`}
                    {delta > 0 ? ` ▲${delta}` : delta < 0 ? ` ▼${Math.abs(delta)}` : ''}
                  </text>
                ) : (
                  <text x={xOf(D - 1) + 8} y={lastY} fontSize={11} fill={dimmed ? '#e5e7eb' : '#374151'} dominantBaseline="middle">
                    {sector.emoji}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-3 grid grid-cols-3 sm:grid-cols-5 gap-1">
        {activeSectors.map((sector, si) => {
          const color    = BUMP_COLORS[si % BUMP_COLORS.length]
          const lastRank = ranksByDate[D - 1].get(sector.id) ?? N
          return (
            <button
              key={sector.id}
              onMouseEnter={() => setHoveredId(sector.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] transition-all ${hoveredId === sector.id ? 'bg-gray-100 font-bold' : 'hover:bg-gray-50'}`}
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

// ─────────────────────────────────────────
// Main
// ─────────────────────────────────────────

const HELP_HOW_TO_READ = [
  { color: 'hsl(142,75%,43%)', text: '초록 — 코스피보다 강한 종목' },
  { color: 'hsl(0,75%,43%)',   text: '빨강 — 코스피보다 약한 종목' },
]

export default function WatchlistKRClient() {
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
  const [compareRight,       setCompareRight]      = useState<SectorItem | null>(null)

  useEffect(() => {
    fetch('/data/watchlist_kr.json', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: WatchlistData) => { setData(d); setLoading(false) })
      .catch((e) => { console.error('watchlist-kr 로드 실패:', e); setLoading(false) })
  }, [])

  useEffect(() => {
    if (!data) return
    const ticker = searchParams.get('stock')
    if (!ticker) return
    const sector = data.sectors.find(s => s.stocks.some(st => st.ticker === ticker))
    const stock  = sector?.stocks.find(st => st.ticker === ticker)
    if (stock && sector) {
      setSelectedStock(stock)
      setSelectedSectorEtf(sector.etf)
      setSelectedSectorName(sector.name)
      setNavStocks(sector.stocks)
    }
  }, [data, searchParams])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase
        .from('personal_watchlist_kr')
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
      데이터 없음 — generate_watchlist_kr.py 를 먼저 실행해 주세요.
    </div>
  )

  const mc        = data.market_context
  const allStocks = data.sectors.flatMap(s => s.stocks)
  const counts = {
    long:  allStocks.filter(s => s.breakdown.net_direction > 0).length,
    short: allStocks.filter(s => s.breakdown.net_direction < 0).length,
  }

  const mktColor =
    mc.market_state === 'bull' ? '#15803d' :
    mc.market_state === 'bear' ? '#b91c1c' : '#92400e'

  const handleSelectStock = (stock: StockItem, etf: string, sectorName: string, sectorStocks?: StockItem[]) => {
    setSelectedStock(stock)
    setSelectedSectorEtf(etf)
    setSelectedSectorName(sectorName)
    if (sectorStocks) setNavStocks(sectorStocks)
  }

  const handleSelectSector = (sector: SectorItem) => {
    if (viewMode === 'compare') {
      if (sector.etf !== 'KOSPI') setCompareRight(sector)
      return
    }
    setSelectedSector(sector)
  }

  const kospiSector = data.sectors.find(s => s.etf === 'KOSPI')

  return (
    <div>
      {/* ── 시장 전환 버튼 ── */}
      <div className="flex gap-1 mb-3 p-1 bg-gray-100 rounded-xl">
        <button className="flex-1 py-1.5 rounded-lg text-[13px] font-bold bg-white text-gray-900 shadow-sm">
          코스피
        </button>
        <button
          onClick={() => router.push('/watchlist')}
          className="flex-1 py-1.5 rounded-lg text-[13px] font-medium text-gray-400 hover:text-gray-600 transition-colors"
        >
          나스닥
        </button>
      </div>

      {/* ── 상단 요약 카드 ── */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-4 shadow-sm">
        {(() => {
          const total   = counts.long + counts.short
          const bullPct = total > 0 ? Math.round((counts.long / total) * 100) : 50
          return (
            <div className="mb-4">
              <p className="text-gray-700 text-sm font-semibold mb-2 text-center">코스피 대비 종목 강도</p>
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

        {/* 코스피 상태 */}
        <div className="flex items-center justify-between text-[11px] py-2 border-t border-gray-100 mb-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">코스피 MA100 대비</span>
            <span className="font-mono font-bold" style={{ color: mktColor }}>
              {mc.kospi_ma_dist >= 0 ? '+' : ''}{mc.kospi_ma_dist.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-400">기울기</span>
            <span className="font-semibold" style={{ color: mktColor }}>
              {mc.kospi_slope === 'bullish' ? '↗ 상향' : '↘ 하향'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold"
              style={{ background: mktColor }}
            >
              {mc.market_state === 'bull' ? '강세장' : mc.market_state === 'bear' ? '약세장' : '중립장'}
            </span>
          </div>
        </div>

        {/* 뷰 모드 토글 */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex gap-1.5">
            {[
              { mode: 'topdown',  label: '📊 탑다운',  cls: 'bg-gray-900 text-white',     inactive: 'bg-gray-100 text-gray-500' },
              { mode: 'bottomup', label: '🔍 바텀업',  cls: 'bg-gray-900 text-white',     inactive: 'bg-gray-100 text-gray-500' },
              { mode: 'compare',  label: '⚖️ 비교',    cls: 'bg-indigo-600 text-white',   inactive: 'bg-gray-100 text-gray-500' },
              { mode: 'ranking',  label: '📈 순위',    cls: 'bg-emerald-600 text-white',  inactive: 'bg-gray-100 text-gray-500' },
            ].map(({ mode, label, cls, inactive }) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode as typeof viewMode); if (mode === 'compare') setCompareRight(null) }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${viewMode === mode ? cls : inactive + ' hover:bg-gray-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowHelp(v => !v)}
            className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-full transition-colors"
          >
            {showHelp ? '▲' : '❓'} 도움말
          </button>
        </div>
      </div>

      {/* ── 바텀업 필터 ── */}
      {viewMode === 'bottomup' && (() => {
        type Cat = { id: string; label: string; activeClass: string; keys: HLFilter[] }
        const CATS: Cat[] = [
          { id: 'break', label: '🔥 신고가 돌파', activeClass: 'bg-emerald-500 text-white', keys: ['break52','break26','break13'] },
          { id: 'hold',  label: '📈 돌파 유지',   activeClass: 'bg-teal-500 text-white',    keys: ['hold52','hold26'] },
          { id: 'near',  label: '🎯 고가 근접',    activeClass: 'bg-blue-500 text-white',    keys: ['near52','near26'] },
          { id: 'low',   label: '📉 신저가',       activeClass: 'bg-rose-500 text-white',    keys: ['low52','low26','low13'] },
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
            <div className="flex gap-1.5">
              {CATS.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setHlFilter(cat.keys[0])}
                  className={`flex-1 py-2 rounded-xl text-[11px] font-bold transition-all ${cat.id === activeCat.id ? cat.activeClass + ' shadow-sm' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              {activeCat.keys.map(key => (
                <button
                  key={key}
                  onClick={() => setHlFilter(key)}
                  className={`px-4 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${hlFilter === key ? activeCat.activeClass + ' border-transparent shadow-sm' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}`}
                >
                  {WEEKS[key]}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {/* ── 도움말 ── */}
      {showHelp && (
        <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-xl text-[10px]">
          <div className="font-semibold text-gray-700 mb-2">색상 읽는 법</div>
          <div className="space-y-1.5">
            {HELP_HOW_TO_READ.map(g => (
              <div key={g.text} className="flex items-center gap-2.5">
                <div className="w-5 h-4 rounded flex-shrink-0" style={{ background: g.color }} />
                <span className="text-gray-600">{g.text}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 text-gray-500 font-semibold">스테이지:</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-gray-400">
            <span>①→ 1말</span>
            <span className="text-yellow-600 font-semibold">②↑ 2초 ★</span>
            <span>② 2진행</span>
            <span>②+ 2확장</span>
            <span className="text-orange-500 font-semibold">③→ 3말 ★</span>
            <span className="text-orange-500 font-semibold">④↓ 4초 ★</span>
            <span>④ 4진행</span>
            <span>④- 4확장</span>
          </div>
        </div>
      )}

      {/* ── 뷰 본체 ── */}
      {viewMode === 'topdown' ? (
        <>
          <div className="-mx-4 sm:-mx-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 border-l border-t border-gray-200">
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
        <BottomUpView sectors={data.sectors} hlFilter={hlFilter} onSelectStock={handleSelectStock} />
      ) : viewMode === 'ranking' ? (
        <SectorRankingView sectors={data.sectors} />
      ) : (
        /* ── 비교 모드 (코스피 기준) ── */
        <div className="mt-2">
          {!compareRight ? (
            <div>
              <p className="text-center text-sm font-semibold text-gray-600 mb-1">코스피와 비교할 섹터를 선택하세요</p>
              <p className="text-center text-[11px] text-gray-400 mb-3">🇰🇷 시장 코스피 = 0 기준</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {data.sectors.filter(s => s.etf !== 'KOSPI').map(sector => (
                  <button
                    key={sector.id}
                    onClick={() => setCompareRight(sector)}
                    className="flex items-center gap-2 p-3 rounded-xl bg-gray-50 hover:bg-indigo-50 hover:border-indigo-200 border border-gray-200 text-left transition-colors"
                  >
                    <span className="text-xl">{sector.emoji}</span>
                    <div>
                      <div className="text-xs font-bold text-gray-700">{sector.name}</div>
                      <div className="text-[10px] text-gray-400">{displayTicker(sector.etf)}</div>
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
            <div>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setCompareRight(null)}
                  className="text-xs px-3 py-1.5 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                >
                  ↺ 다시 선택
                </button>
                <span className="text-xs text-gray-400">
                  🇰🇷 코스피 vs {compareRight.emoji} {compareRight.name}
                </span>
              </div>

              <div className="flex gap-2 items-start">
                {/* 왼쪽: 코스피 */}
                <div className="flex-1 min-w-0 border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                  <div className="px-3 py-2 bg-white border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base">🇰🇷</span>
                      <span className="text-xs font-bold text-gray-800">시장 코스피</span>
                    </div>
                    <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">= 0</span>
                  </div>
                  {kospiSector && (
                    <div className="grid grid-cols-5 bg-gray-100" style={{ gap: '1px', padding: '1px' }}>
                      {kospiSector.stocks.map(stock => (
                        <StockCell key={stock.ticker} stock={stock} onClick={() => handleSelectStock(stock, kospiSector.etf, kospiSector.name, kospiSector.stocks)} />
                      ))}
                      {Array.from({ length: Math.max(0, 15 - kospiSector.stocks.length) }).map((_, i) => (
                        <div key={i} className="bg-white" style={{ height: '54px' }} />
                      ))}
                    </div>
                  )}
                </div>

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
                      <StockCell key={stock.ticker} stock={stock} onClick={() => handleSelectStock(stock, compareRight.etf, compareRight.name, compareRight.stocks)} />
                    ))}
                    {Array.from({ length: Math.max(0, 15 - compareRight.stocks.length) }).map((_, i) => (
                      <div key={i} className="bg-white" style={{ height: '54px' }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
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
