'use client'

import { useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const TradingViewChart = dynamic(
  () => import('@/app/components/TradingViewChart'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-400 text-sm">차트 로딩 중...</div> }
)

// ── Exported types (used by page.tsx) ─────────────────────────────────────

export type RSPoint = { d: string; v: number }

export interface SlimNetBuyItem {
  rank:       number
  fullName:   string
  ticker:     string | null
  koreanName: string
  value:      number
}

export interface SlimNetBuyData {
  asOf:  string
  items: SlimNetBuyItem[]  // top 30 only
}

export interface SlimWlEntry {
  signal:        string
  stage:         string
  bear_strength: number
  rs_excess_pct: number | null
  rs_history:    RSPoint[]
  isBasic?:      boolean   // true = MA100 기반 간이 분석 (워치리스트 미등록)
}

export type SlimWlMap = Record<string, SlimWlEntry>

// ── Internal types ─────────────────────────────────────────────────────────

type Period = 5 | 10 | 20 | 60
type Signal = 'long' | 'long_watch' | 'short' | 'short_watch' | 'neutral'

interface ScreenerRow {
  fullName:      string
  ticker:        string | null
  koreanName:    string
  baseRank:      number
  rankByPeriod:  Record<Period, number | null>
  valueByPeriod: Record<Period, number | null>
  antScore:      number
  techScore:     number | null
  signalBonus:   number
  totalScore:    number
  wl:            SlimWlEntry | null
}

// ── Constants ──────────────────────────────────────────────────────────────

const PERIODS: Period[] = [5, 10, 20, 60]
const PERIOD_LABELS: Record<Period, string> = { 5: '5일', 10: '10일', 20: '20일', 60: '60일' }

const STAGE_ABBR: Record<string, string> = {
  stage1_late: '①→', stage2_early: '②↑', stage2: '②', stage2_extended: '②+',
  stage3: '③', stage3_late: '③→', stage4_early: '④↓', stage4: '④', stage4_extended: '④-',
}

const SIGNAL_KO: Record<Signal, string> = {
  long: '🚀 롱', long_watch: '👀 롱관심',
  short: '📉 숏', short_watch: '⚠️ 숏관심', neutral: '➖ 중립',
}

// ── Score helpers ──────────────────────────────────────────────────────────

// 서학개미 압력: 0~20점 (rank 1위=15, 지속성 최대+5)
function calcAntScore(baseRank: number, rankByPeriod: Record<Period, number | null>): number {
  if (baseRank > 30) return 0
  const base   = ((31 - baseRank) / 30) * 15
  const bonus  = PERIODS.reduce((s, p) => s + (rankByPeriod[p] !== null && rankByPeriod[p]! <= 30 ? 1.25 : 0), 0)
  return Math.min(20, base + bonus)
}

// 기술적 약세: 0~60점 (bear_strength 기반 + 스테이지 + RS 보너스)
function calcTechScore(wl: SlimWlEntry | null): number | null {
  if (!wl) return null
  let s = Math.min(50, wl.bear_strength * 0.5)
  if (wl.stage === 'stage3_late' || wl.stage === 'stage4_early') s += 12
  else if (wl.stage === 'stage4' || wl.stage === 'stage4_extended') s += 8
  if (wl.rs_excess_pct !== null && wl.rs_excess_pct < 0) s += 8
  return Math.min(60, s)
}

function calcSignalBonus(wl: SlimWlEntry | null): number {
  if (!wl) return 0
  if (wl.signal === 'short') return 20
  if (wl.signal === 'short_watch') return 10
  if (wl.signal === 'neutral' && ['stage4', 'stage4_early', 'stage4_extended'].includes(wl.stage)) return 5
  return 0
}

// ── Formatters ─────────────────────────────────────────────────────────────

function fmtBillion(v: number): string {
  const b = Math.abs(v) / 1e8
  return `+${b >= 10 ? b.toFixed(0) : b.toFixed(1)}억`
}

// ── RSSparkline ────────────────────────────────────────────────────────────

function RSSparkline({ data, uid }: { data: RSPoint[]; uid: string }) {
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
  const areaPath =
    `M${xS(0).toFixed(1)},${yZero.toFixed(1)} ` +
    data.map((d, i) => `L${xS(i).toFixed(1)},${yS(d.v).toFixed(1)}`).join(' ') +
    ` L${xS(data.length - 1).toFixed(1)},${yZero.toFixed(1)} Z`
  const lastVal   = data[data.length - 1].v
  const lineColor = lastVal >= 0 ? '#16a34a' : '#dc2626'
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-semibold text-gray-500">RS vs SPY</span>
        <span className="text-[9px] font-mono font-bold" style={{ color: lineColor }}>
          현재 {lastVal >= 0 ? '+' : ''}{lastVal.toFixed(2)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ height: '68px', display: 'block' }}>
        <defs>
          <clipPath id={`above-${uid}`}><rect x={PAD.l} y={PAD.t} width={innerW} height={yZero - PAD.t} /></clipPath>
          <clipPath id={`below-${uid}`}><rect x={PAD.l} y={yZero} width={innerW} height={innerH / 2 + 2} /></clipPath>
        </defs>
        <path d={areaPath} fill="rgba(34,197,94,0.18)" clipPath={`url(#above-${uid})`} />
        <path d={areaPath} fill="rgba(239,68,68,0.18)" clipPath={`url(#below-${uid})`} />
        <line x1={PAD.l} y1={yZero} x2={W - PAD.r} y2={yZero} stroke="#9ca3af" strokeWidth={0.6} strokeDasharray="3,2" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.4} strokeLinejoin="round" />
        <circle cx={xS(data.length - 1)} cy={yS(lastVal)} r={2.5} fill={lineColor} />
        <text x={PAD.l - 2} y={PAD.t + 4}    fontSize={8} textAnchor="end" fill="#9ca3af">+{maxAbs.toFixed(1)}</text>
        <text x={PAD.l - 2} y={yZero}         fontSize={8} textAnchor="end" fill="#9ca3af" dominantBaseline="middle">0</text>
        <text x={PAD.l - 2} y={H - PAD.b - 2} fontSize={8} textAnchor="end" fill="#9ca3af">-{maxAbs.toFixed(1)}</text>
      </svg>
    </div>
  )
}

// ── ScoreDots ──────────────────────────────────────────────────────────────

function ScoreDots({ score, max, color }: { score: number; max: number; color: string }) {
  const filled = Math.round((score / max) * 5)
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="w-2 h-2 rounded-full" style={{ background: i < filled ? color : '#e5e7eb' }} />
      ))}
      <span className="ml-1 text-[10px] font-mono text-gray-600">{score.toFixed(0)}</span>
    </div>
  )
}

// ── NetBuyBars ─────────────────────────────────────────────────────────────

function NetBuyBars({ row }: { row: ScreenerRow }) {
  const maxVal = Math.max(...PERIODS.map(p => row.valueByPeriod[p] ?? 0))
  if (maxVal === 0) return null
  return (
    <div className="mb-1">
      <div className="text-[10px] font-semibold text-gray-500 mb-1.5">서학개미 순매수 (기간별)</div>
      <div className="space-y-1.5">
        {PERIODS.map(p => {
          const v   = row.valueByPeriod[p]
          const pct = v ? (v / maxVal) * 100 : 0
          return (
            <div key={p} className="flex items-center gap-2">
              <span className="text-[9px] w-7 text-gray-400 shrink-0">{PERIOD_LABELS[p]}</span>
              <div className="flex-1 bg-gray-100 rounded h-3 overflow-hidden">
                <div className="h-3 rounded" style={{ width: `${pct}%`, background: '#3b82f6' }} />
              </div>
              <span className="text-[9px] font-mono text-blue-600 w-12 text-right shrink-0">
                {v ? fmtBillion(v) : '–'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── RowModal ───────────────────────────────────────────────────────────────

function RowModal({ row, period, onClose }: { row: ScreenerRow; period: Period; onClose: () => void }) {
  const { wl } = row
  const baseScore  = ((31 - row.baseRank) / 30) * 15
  const persistence = row.antScore - baseScore

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-base font-mono">{row.ticker ?? '—'}</span>
            {row.koreanName && <span className="text-xs text-gray-400">{row.koreanName}</span>}
            {wl && (
              <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                {STAGE_ABBR[wl.stage] ?? wl.stage}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {wl && (
              <span className="text-xs font-bold" style={{
                color: wl.signal === 'short' ? '#dc2626' : wl.signal === 'short_watch' ? '#d97706' : '#6b7280',
              }}>
                {SIGNAL_KO[wl.signal as Signal]}
              </span>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl font-bold leading-none">×</button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* TradingView chart */}
          {row.ticker && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div style={{ height: '300px' }}>
                <TradingViewChart symbol={row.ticker} height={300} />
              </div>
            </div>
          )}

          {/* RS sparkline */}
          {wl && wl.rs_history && wl.rs_history.length >= 3 && (
            <RSSparkline data={wl.rs_history} uid={row.ticker ?? row.fullName.replace(/\s/g, '_')} />
          )}

          {/* NetBuy bars */}
          <NetBuyBars row={row} />

          {/* Score breakdown */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="text-[10px] font-semibold text-gray-500 mb-2.5">숏 점수 브레이크다운</div>
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium text-gray-700">서학개미 압력</div>
                  <div className="text-[9px] text-gray-400 mt-0.5">
                    {PERIOD_LABELS[period]} #{row.baseRank}위 → 기본 {baseScore.toFixed(1)}
                    {persistence > 0 && ` + 지속성 +${persistence.toFixed(1)}`}
                  </div>
                </div>
                <ScoreDots score={row.antScore} max={20} color="#3b82f6" />
              </div>

              {row.techScore !== null && (
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium text-gray-700">
                      기술적 약세
                      {wl?.isBasic && (
                        <span className="ml-1.5 text-[9px] text-gray-400 font-normal bg-gray-100 px-1 rounded">MA100 간이분석</span>
                      )}
                    </div>
                    {wl && (
                      <div className="text-[9px] text-gray-400 mt-0.5">
                        bear {wl.bear_strength.toFixed(1)}
                        {wl.rs_excess_pct !== null
                          ? ` · RS ${wl.rs_excess_pct >= 0 ? '+' : ''}${wl.rs_excess_pct.toFixed(1)}%`
                          : wl.isBasic ? ' · RS 데이터 없음' : ''}
                      </div>
                    )}
                  </div>
                  <ScoreDots score={row.techScore} max={60} color="#f59e0b" />
                </div>
              )}

              {row.signalBonus > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-gray-700">시그널 보너스</div>
                  <ScoreDots score={row.signalBonus} max={20} color="#ef4444" />
                </div>
              )}

              <div className="flex items-center justify-between border-t border-gray-200 pt-2">
                <span className="text-xs font-bold text-gray-800">총점</span>
                <span className="font-bold text-xl font-mono" style={{
                  color: row.totalScore >= 60 ? '#dc2626' : row.totalScore >= 40 ? '#d97706' : '#6b7280',
                }}>
                  {row.totalScore.toFixed(0)}
                </span>
              </div>
            </div>
          </div>

          {/* Period ranks */}
          <div>
            <div className="text-[10px] font-semibold text-gray-500 mb-1.5">기간별 순위</div>
            <div className="grid grid-cols-4 gap-1.5">
              {PERIODS.map(p => (
                <div key={p} className="rounded-lg p-2 text-center"
                  style={{ background: p === period ? '#f0f9ff' : '#f9fafb', border: p === period ? '1px solid #bae6fd' : 'none' }}>
                  <div className="text-[9px] text-gray-400">{PERIOD_LABELS[p]}</div>
                  <div className="text-sm font-bold font-mono text-gray-800 mt-0.5">
                    {row.rankByPeriod[p] != null ? `#${row.rankByPeriod[p]}` : <span className="text-gray-300">–</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-[9px] text-gray-300 break-all">{row.fullName}</div>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────

interface Props {
  netBuy5:  SlimNetBuyData
  netBuy10: SlimNetBuyData
  netBuy20: SlimNetBuyData
  netBuy60: SlimNetBuyData
  wlMap:    SlimWlMap
}

export default function ShortTrackerClient({ netBuy5, netBuy10, netBuy20, netBuy60, wlMap }: Props) {
  const [period,      setPeriod]      = useState<Period>(5)
  const [matchOnly,   setMatchOnly]   = useState(false)
  const [selectedRow, setSelectedRow] = useState<ScreenerRow | null>(null)

  const netBuyData: Record<Period, SlimNetBuyData> = useMemo(
    () => ({ 5: netBuy5, 10: netBuy10, 20: netBuy20, 60: netBuy60 }),
    [netBuy5, netBuy10, netBuy20, netBuy60]
  )

  // Cross-period rank/value lookup (built once)
  const { rankMap, valueMap } = useMemo(() => {
    const rMap: Record<string, Record<Period, number | null>>  = {}
    const vMap: Record<string, Record<Period, number | null>>  = {}
    for (const p of PERIODS) {
      for (const item of netBuyData[p].items) {
        if (!rMap[item.fullName]) {
          rMap[item.fullName] = { 5: null, 10: null, 20: null, 60: null }
          vMap[item.fullName] = { 5: null, 10: null, 20: null, 60: null }
        }
        rMap[item.fullName][p] = item.rank
        vMap[item.fullName][p] = item.value
      }
    }
    return { rankMap: rMap, valueMap: vMap }
  }, [netBuyData])

  // Screener rows for the current period
  const rows = useMemo<ScreenerRow[]>(() => {
    return netBuyData[period].items.map(item => {
      const rankByPeriod  = rankMap[item.fullName]  ?? { 5: null, 10: null, 20: null, 60: null }
      const valueByPeriod = valueMap[item.fullName] ?? { 5: null, 10: null, 20: null, 60: null }
      const wl            = item.ticker ? (wlMap[item.ticker] ?? null) : null
      const antScore      = calcAntScore(item.rank, rankByPeriod)
      const techScore     = calcTechScore(wl)
      const signalBonus   = calcSignalBonus(wl)
      return {
        fullName: item.fullName, ticker: item.ticker, koreanName: item.koreanName,
        baseRank: item.rank, rankByPeriod, valueByPeriod,
        antScore, techScore, signalBonus,
        totalScore: antScore + (techScore ?? 0) + signalBonus,
        wl,
      }
    }).sort((a, b) => b.totalScore - a.totalScore)
  }, [netBuyData, period, rankMap, valueMap, wlMap])

  const displayRows = matchOnly ? rows.filter(r => r.wl !== null) : rows
  const asOf        = netBuyData[period].asOf

  return (
    <div>
      {/* Back link */}
      <div className="mb-4">
        <Link href="/" className="inline-flex items-center text-gray-400 hover:text-gray-700 text-sm transition">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          메인으로
        </Link>
      </div>

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-gray-900">📉 숏 후보 스크리너</h1>
        <p className="text-xs text-gray-500 mt-1">
          서학개미가 가장 많이 사는 종목 = 나중에 빠질 후보 &nbsp;·&nbsp; 리버스 개미 전략
        </p>
        <p className="text-[10px] text-gray-300 mt-0.5">데이터 기준: {asOf}</p>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex gap-1">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                period === p ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <button onClick={() => setMatchOnly(v => !v)}
          className={`text-xs px-3 py-1.5 rounded-lg border transition ${
            matchOnly ? 'bg-red-50 border-red-300 text-red-700 font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}>
          {matchOnly ? '✓ 워치리스트 매칭만' : '전체'}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] text-gray-500">
              <th className="px-3 py-2 font-semibold w-8">#</th>
              <th className="px-3 py-2 font-semibold">종목</th>
              <th className="px-3 py-2 font-semibold text-right">개미매수↑</th>
              <th className="px-3 py-2 font-semibold">서학점수</th>
              <th className="px-3 py-2 font-semibold">기술점수</th>
              <th className="px-3 py-2 font-semibold text-right">총점</th>
              <th className="px-3 py-2 font-semibold">신호</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {displayRows.map(row => (
              <tr key={row.fullName} className="hover:bg-red-50/60 transition-colors cursor-pointer"
                onClick={() => setSelectedRow(row)}>
                <td className="px-3 py-2.5 text-[11px] text-gray-400 font-mono">{row.baseRank}</td>
                <td className="px-3 py-2.5">
                  <div className="font-bold text-gray-900 text-xs font-mono">
                    {row.ticker ?? (
                      <span className="text-gray-400 font-normal text-[10px]">{row.fullName.slice(0, 18)}…</span>
                    )}
                  </div>
                  {row.koreanName && <div className="text-[10px] text-gray-400 mt-0.5">{row.koreanName}</div>}
                  {!row.ticker && <div className="text-[9px] text-gray-300">미매핑</div>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[11px] text-blue-600">
                  {fmtBillion(row.valueByPeriod[period] ?? 0)}
                </td>
                <td className="px-3 py-2.5">
                  <ScoreDots score={row.antScore} max={20} color="#3b82f6" />
                </td>
                <td className="px-3 py-2.5">
                  {row.techScore !== null ? (
                    <div>
                      <ScoreDots score={row.techScore} max={60} color="#f59e0b" />
                      {row.wl?.isBasic && (
                        <span className="text-[9px] text-gray-300 ml-0.5">MA기반</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[11px] text-gray-300">──</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="font-bold text-sm font-mono" style={{
                    color: row.totalScore >= 60 ? '#dc2626' : row.totalScore >= 40 ? '#d97706' : '#6b7280',
                  }}>
                    {row.totalScore.toFixed(0)}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  {row.wl ? (
                    <span className="text-[10px] font-semibold" style={{
                      color: row.wl.signal === 'short' ? '#dc2626' : row.wl.signal === 'short_watch' ? '#d97706' : '#9ca3af',
                    }}>
                      {SIGNAL_KO[row.wl.signal as Signal]}
                    </span>
                  ) : <span className="text-[11px] text-gray-300">–</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {displayRows.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">표시할 종목이 없습니다</div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-gray-400">
        <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />서학개미 압력 (0–20)</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />기술적 약세 (0–60)</span>
        <span>총점 <span className="text-red-500 font-bold">60+</span> = 강한 숏 후보</span>
      </div>

      <p className="text-[10px] text-gray-400 text-center pb-4 mt-6">
        * 투자 조언이 아닙니다. 모든 투자 결정은 본인 책임입니다.
      </p>

      {selectedRow && (
        <RowModal row={selectedRow} period={period} onClose={() => setSelectedRow(null)} />
      )}
    </div>
  )
}
