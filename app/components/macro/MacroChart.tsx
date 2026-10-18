'use client'

// 공통 차트 엔진
//  - mode="overlay" : 한 차트에 여러 선을 겹침 (INDICATOR DETAIL)
//  - mode="stack"   : 지표마다 자기 pane, 세로로 나열 (MACRO WORKSPACE). X축 눈금은 맨 아래 하나.
// 규칙
//  - 확대/축소·좌우 이동은 모든 선에 동일 (lightweight-charts 의 단일 time scale 공유)
//  - 개별 선은 X축 '평행이동(shift)'만 허용 — 원본 날짜/값은 바꾸지 않고 표시용 time 만 이동
//  - Y축: independent(선마다 자기 축) / normalized(공통 기간 z-score)

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  createChart, LineSeries, ColorType, CrosshairMode, LineStyle, PriceScaleMode,
  type IChartApi, type ISeriesApi, type Time, type MouseEventParams,
} from 'lightweight-charts'
import {
  type Layer, type Point, type SeriesData, type Tf,
  points, zscore, fmtNum, shiftDate, LINE_COLORS_DARK, LINE_COLORS_LIGHT,
} from '@/app/lib/macro'
import { type Band, type BandStyle, BandsPrimitive, bandsAt, hexToRgba } from './bands'

export type ShadeBand = Band & { note?: string }

export interface ChartLayer extends Layer {
  id: string
  series: SeriesData
}

export interface HoverInfo {
  value: number | null      // 원본 값(정규화 전)
  date: string | null       // 원본 날짜 (shift 이전)
}

export interface MacroChartHandle {
  setYears: (years: number | null) => void
  getRange: () => { from: string; to: string } | null
  setRange: (r: { from: string; to: string }) => void
}

interface Props {
  mode: 'overlay' | 'stack'
  layers: ChartLayer[]
  yMode?: 'independent' | 'normalized'
  height?: number            // overlay 전체 높이
  paneHeight?: number        // stack pane 하나 높이
  initialRange?: { from: string; to: string } | null
  initialYears?: number | null
  onRangeChange?: (r: { from: string; to: string } | null) => void
  renderLegend: (layer: ChartLayer, index: number, color: string, hover: HoverInfo) => React.ReactNode
  bands?: ShadeBand[]        // 경기침체/이벤트 음영 (표시할 것만 넘김)
  logScale?: boolean         // 로그 축 (해당 축의 값이 모두 양수일 때만 적용, 정규화 모드에선 무시)
}

function bandStyle(): BandStyle {
  return {
    recFill: hexToRgba(cssVar('--ink-mute', '#8c887f'), 0.14),
    evFill: hexToRgba(cssVar('--down-text', '#8a2c1c'), 0.11),
    recLabel: cssVar('--ink-mute', '#8c887f'),
    evLabel: cssVar('--down-text', '#8a2c1c'),
    font: '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  }
}

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function useDark() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

export function layerColor(i: number, dark: boolean) {
  const pal = dark ? LINE_COLORS_DARK : LINE_COLORS_LIGHT
  return pal[i % pal.length]
}
export { useDark }

// time 이하 마지막 값 (분기 시리즈를 월 커서로 볼 때 직전 분기값 표시)
function valueAtOrBefore(pts: Point[], t: string): Point | null {
  let lo = 0, hi = pts.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (pts[mid].time <= t) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans >= 0 ? pts[ans] : null
}

const TIME_AXIS_H = 28
const SEP = 1

const MacroChart = forwardRef<MacroChartHandle, Props>(function MacroChart(
  { mode, layers, yMode = 'independent', height = 420, paneHeight = 170, initialRange, initialYears = null, onRangeChange, renderLegend, bands = [], logScale = false },
  ref,
) {
  const boxRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'>[]>([])
  const rawPtsRef = useRef<Point[][]>([])       // 레이어별 원본(정규화 전) 점, shift 반영된 time
  const lastTimeRef = useRef<string | null>(null)
  const firstTimeRef = useRef<string | null>(null)
  const restoreRef = useRef<{ from: string; to: string } | null>(initialRange ?? null)
  const yearsRef = useRef<number | null>(initialYears)
  const initializedRef = useRef(false)          // 기본 기간/복원 구간이 한 번 적용되었는가
  const onRangeRef = useRef(onRangeChange)
  onRangeRef.current = onRangeChange
  const dark = useDark()
  const [hover, setHover] = useState<HoverInfo[] | null>(null)
  const [hoverBands, setHoverBands] = useState<ShadeBand[]>([])
  const bandsRef = useRef<ShadeBand[]>(bands)
  bandsRef.current = bands
  const primsRef = useRef<{ pane: ReturnType<IChartApi['panes']>[number]; prim: BandsPrimitive }[]>([])

  const totalHeight = mode === 'stack'
    ? Math.max(1, layers.length) * (paneHeight + SEP) + TIME_AXIS_H
    : height

  const applyYears = useCallback((years: number | null) => {
    const ch = chartRef.current
    const last = lastTimeRef.current
    const first = firstTimeRef.current
    if (!ch || !last || !first) return
    if (years === null) { ch.timeScale().setVisibleRange({ from: first as Time, to: last as Time }); return }
    let from = shiftDate(last, -12 * years)
    if (from < first) from = first
    ch.timeScale().setVisibleRange({ from: from as Time, to: last as Time })
  }, [])

  useImperativeHandle(ref, () => ({
    setYears: (y) => { yearsRef.current = y; restoreRef.current = null; applyYears(y) },
    getRange: () => {
      const r = chartRef.current?.timeScale().getVisibleRange()
      return r ? { from: String(r.from), to: String(r.to) } : null
    },
    setRange: (r) => { chartRef.current?.timeScale().setVisibleRange({ from: r.from as Time, to: r.to as Time }) },
  }), [applyYears])

  // ── 차트 생성 (1회) ──
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ch = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: cssVar('--ink-2', '#5c5952'),
        fontSize: 11,
        fontFamily: 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, monospace',
        panes: { separatorColor: cssVar('--hairline-2', '#cfcbc0'), separatorHoverColor: 'rgba(0,0,0,0.05)', enableResize: false },
      },
      grid: {
        vertLines: { color: cssVar('--hairline', '#ddd9d0'), style: LineStyle.Dotted },
        horzLines: { color: cssVar('--hairline', '#ddd9d0'), style: LineStyle.Dotted },
      },
      rightPriceScale: { borderColor: cssVar('--hairline', '#ddd9d0'), minimumWidth: 64 },
      leftPriceScale: { borderColor: cssVar('--hairline', '#ddd9d0'), minimumWidth: 64 },
      timeScale: { borderColor: cssVar('--hairline', '#ddd9d0'), rightOffset: 3, minBarSpacing: 0.05 },
      crosshair: { mode: CrosshairMode.Normal },
      localization: { locale: 'ko-KR', dateFormat: 'yyyy.MM' },
    })
    chartRef.current = ch

    const onRange = () => {
      const r = ch.timeScale().getVisibleRange()
      onRangeRef.current?.(r ? { from: String(r.from), to: String(r.to) } : null)
    }
    ch.timeScale().subscribeVisibleTimeRangeChange(onRange)

    const onMove = (p: MouseEventParams<Time>) => {
      if (!p.time) { setHover(null); setHoverBands([]); return }
      const t = String(p.time)
      setHoverBands(bandsAt(bandsRef.current, t) as ShadeBand[])
      setHover(rawPtsRef.current.map(pts => {
        const hit = valueAtOrBefore(pts, t)
        return hit ? { value: hit.value, date: hit.time } : { value: null, date: null }
      }))
    }
    ch.subscribeCrosshairMove(onMove)

    return () => {
      ch.timeScale().unsubscribeVisibleTimeRangeChange(onRange)
      ch.unsubscribeCrosshairMove(onMove)
      ch.remove()
      chartRef.current = null
      seriesRef.current = []
      primsRef.current = []
    }
  }, [])

  // ── 테마 반영 ──
  useEffect(() => {
    const ch = chartRef.current
    if (!ch) return
    const hair = cssVar('--hairline', '#ddd9d0')
    ch.applyOptions({
      layout: { textColor: cssVar('--ink-2', '#5c5952'), panes: { separatorColor: cssVar('--hairline-2', '#cfcbc0') } },
      grid: { vertLines: { color: hair }, horzLines: { color: hair } },
      rightPriceScale: { borderColor: hair },
      leftPriceScale: { borderColor: hair },
      timeScale: { borderColor: hair },
    })
  }, [dark])

  // 레이어 구성이 바뀔 때만 다시 그림 (hover 등은 무시)
  const sig = useMemo(
    () => layers.map(l => `${l.id}|${l.key}|${l.tf}|${l.shift}`).join(';') + `#${mode}#${yMode}#${paneHeight}#${dark}#${logScale}`,
    [layers, mode, yMode, paneHeight, dark, logScale],
  )

  // ── 시리즈 (재)구성 ──
  useEffect(() => {
    const ch = chartRef.current
    if (!ch) return

    // 현재 보이는 구간 보존 (지표 추가/변환 변경 시 화면이 튀지 않게)
    const vis = ch.timeScale().getVisibleRange()
    const keep = restoreRef.current ?? (initializedRef.current && vis ? { from: String(vis.from), to: String(vis.to) } : null)

    for (const s of seriesRef.current) ch.removeSeries(s)
    seriesRef.current = []

    const raw = layers.map(l => points(l.series, l.tf as Tf, l.shift))
    rawPtsRef.current = raw

    // 정규화 공통 기간 = 모든 레이어의 원본(shift 전) 겹치는 구간
    let normFrom: string | null = null, normTo: string | null = null
    if (mode === 'overlay' && yMode === 'normalized') {
      for (const l of layers) {
        const p = points(l.series, l.tf as Tf, 0)
        if (!p.length) continue
        if (!normFrom || p[0].time > normFrom) normFrom = p[0].time
        if (!normTo || p[p.length - 1].time < normTo) normTo = p[p.length - 1].time
      }
      if (normFrom && normTo && normFrom > normTo) { normFrom = null; normTo = null }
    }

    // 독립 축: 단위·변환이 같은 선끼리는 같은 축을 공유 (예: 10Y-2Y 와 10Y-3M 은 둘 다 %p)
    // 첫 번째 단위 그룹 = 오른쪽 축, 두 번째 = 왼쪽 축, 그 이후 = 숨은 축(값은 범례로)
    const groups: string[] = []
    const scaleOf = (l: ChartLayer) => {
      const g = `${l.series.units}|${l.tf}`
      let gi = groups.indexOf(g)
      if (gi < 0) { groups.push(g); gi = groups.length - 1 }
      return gi === 0 ? 'right' : gi === 1 ? 'left' : `ov${gi}`
    }

    // 축별 최솟값 (로그 축 적용 가능 여부 판단)
    const scaleMin = new Map<string, { pane: number; id: string; min: number }>()

    let first: string | null = null, last: string | null = null
    layers.forEach((l, i) => {
      const color = layerColor(i, dark)
      const pane = mode === 'stack' ? i : 0
      let scaleId = 'right'
      if (mode === 'overlay' && yMode === 'independent') scaleId = scaleOf(l)

      let data = raw[i]
      const normalized = mode === 'overlay' && yMode === 'normalized'
      if (normalized) {
        // z-score 는 원본 날짜 기준 공통 구간으로 계산 후, shift 만큼 이동된 점에 같은 변환 적용
        const base = zscore(points(l.series, l.tf as Tf, 0), normFrom, normTo)
        data = raw[i].map(p => ({ time: p.time, value: (p.value - base.mean) / base.sd }))
      }
      const s = ch.addSeries(LineSeries, {
        color,
        lineWidth: i === 0 ? 2 : 2,
        priceScaleId: scaleId,
        lastValueVisible: scaleId === 'right' || scaleId === 'left',
        priceLineVisible: false,
        crosshairMarkerRadius: 3,
        priceFormat: normalized
          ? { type: 'custom', formatter: (v: number) => v.toFixed(1) + 'σ', minMove: 0.01 }
          : { type: 'custom', formatter: (v: number) => fmtNum(v, l.series, l.tf as Tf), minMove: 0.0001 },
      }, pane)
      s.setData(data.map(p => ({ time: p.time as Time, value: p.value })))
      const sk = `${pane}|${scaleId}`
      const mn = data.reduce((m, p) => Math.min(m, p.value), Infinity)
      const prevMin = scaleMin.get(sk)
      scaleMin.set(sk, { pane, id: scaleId, min: Math.min(prevMin?.min ?? Infinity, mn) })
      seriesRef.current.push(s)
      if (data.length) {
        if (!first || data[0].time < first) first = data[0].time
        if (!last || data[data.length - 1].time > last) last = data[data.length - 1].time
      }
    })
    firstTimeRef.current = first
    lastTimeRef.current = last

    // 축 표시
    if (mode === 'overlay') {
      ch.applyOptions({
        leftPriceScale: { visible: yMode === 'independent' && groups.length > 1, scaleMargins: { top: 0.08, bottom: 0.08 } },
        rightPriceScale: { visible: true, scaleMargins: { top: 0.08, bottom: 0.08 } },
      })
      for (let gi = 2; gi < groups.length; gi++) {
        ch.priceScale(`ov${gi}`).applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } })
      }
    } else {
      ch.applyOptions({ leftPriceScale: { visible: false } })
      const panes = ch.panes()
      panes.forEach(p => p.setStretchFactor(1))   // 모든 pane 동일 높이 (차트 전체 높이 = n × paneHeight)
      panes.forEach((_, i) => ch.priceScale('right', i).applyOptions({ scaleMargins: { top: 0.22, bottom: 0.08 } }))
    }

    // 로그 축: 요청 + 정규화 아님 + 그 축의 값이 모두 양수일 때만
    const normalizedNow = mode === 'overlay' && yMode === 'normalized'
    for (const { pane, id, min } of scaleMin.values()) {
      const useLog = logScale && !normalizedNow && min > 0
      ch.priceScale(id, pane).applyOptions({ mode: useLog ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal })
    }

    // 음영 primitive: pane 마다 붙이고, 라벨은 맨 아래 pane 에만
    for (const { pane, prim } of primsRef.current) { try { pane.detachPrimitive(prim) } catch { /* 제거된 pane */ } }
    primsRef.current = []
    const panesNow = ch.panes()
    const rng = first && last ? { first, last } : null
    panesNow.forEach((pane, i) => {
      const prim = new BandsPrimitive(bandStyle(), i === panesNow.length - 1)
      pane.attachPrimitive(prim)
      prim.setData(bandsRef.current, rng)
      primsRef.current.push({ pane, prim })
    })

    // 구간 복원 / 기본 기간
    requestAnimationFrame(() => {
      if (!chartRef.current) return
      if (keep) ch.timeScale().setVisibleRange({ from: keep.from as Time, to: keep.to as Time })
      else applyYears(yearsRef.current)
      restoreRef.current = null
      initializedRef.current = true
    })
    setHover(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])

  // 음영 토글/테마 변경 → 다시 그리기만
  const bandSig = bands.map(b => `${b.kind}${b.from}${b.to}`).join(',')
  useEffect(() => {
    const rng = firstTimeRef.current && lastTimeRef.current ? { first: firstTimeRef.current, last: lastTimeRef.current } : null
    for (const { prim } of primsRef.current) prim.setData(bandsRef.current, rng, bandStyle())
  }, [bandSig, dark])

  // 레전드 위치: stack 이면 각 pane 상단, overlay 면 좌상단에 세로 목록
  const latest: HoverInfo[] = useMemo(() => layers.map(l => {
    const pts = points(l.series, l.tf as Tf, l.shift)
    const p = pts[pts.length - 1]
    return p ? { value: p.value, date: p.time } : { value: null, date: null }
  }), [layers])
  // 레전드에는 shift 이전 '원래 날짜'를 보여준다
  const info = (hover ?? latest).map((h, i) => ({
    value: h.value,
    date: h.date && layers[i] ? shiftDate(h.date, -layers[i].shift) : null,
  }))

  return (
    <div className="relative select-none" style={{ height: totalHeight }}>
      <div ref={boxRef} className="absolute inset-0" />
      {hoverBands.length > 0 && (
        <div className="absolute right-[72px] top-2 z-20 flex flex-col items-end gap-0.5 pointer-events-none">
          {hoverBands.map(b => (
            <div key={b.kind + b.from} className="text-[10px] px-1.5 py-0.5 max-w-[280px]"
              style={{ background: 'var(--surface)', border: `1px solid ${b.kind === 'rec' ? 'var(--hairline-2)' : 'var(--down-text)'}` }}>
              <span className="font-bold" style={{ color: b.kind === 'rec' ? 'var(--ink-2)' : 'var(--down-text)' }}>{b.label}</span>
              <span className="mono ml-1" style={{ color: 'var(--ink-mute)' }}>{b.from.replace('-', '.')}{b.to !== b.from ? `–${b.to.replace('-', '.')}` : ''}</span>
              {b.note && <div style={{ color: 'var(--ink-2)' }}>{b.note}</div>}
            </div>
          ))}
        </div>
      )}
      {mode === 'overlay' ? (
        <div className="absolute left-2 top-2 z-10 flex flex-col gap-1 pointer-events-none max-w-[calc(100%-140px)]">
          {layers.map((l, i) => (
            <div key={l.id} className="pointer-events-auto">{renderLegend(l, i, layerColor(i, dark), info[i] ?? { value: null, date: null })}</div>
          ))}
        </div>
      ) : (
        layers.map((l, i) => (
          <div key={l.id} className="absolute left-2 z-10 pointer-events-auto max-w-[calc(100%-90px)]" style={{ top: i * (paneHeight + SEP) + 4 }}>
            {renderLegend(l, i, layerColor(i, dark), info[i] ?? { value: null, date: null })}
          </div>
        ))
      )}
    </div>
  )
})

export default MacroChart
