// 차트 배경 음영: 경기침체(NBER) / 위기·시장 이벤트
// lightweight-charts pane primitive — 시리즈 아래(bottom)에 실제 달력 날짜 기준으로 그린다.
// (개별 선을 Time Shift 해도 음영은 실제 날짜에 고정)

import type {
  IChartApi, IPanePrimitive, IPanePrimitivePaneView, IPrimitivePaneRenderer,
  Logical, PaneAttachedParameter, Time,
} from 'lightweight-charts'
import type { CanvasRenderingTarget2D } from 'fancy-canvas'

export interface Band { from: string; to: string; kind: 'rec' | 'ev'; label?: string }   // from/to = 'YYYY-MM' (to 포함)

export interface BandStyle { recFill: string; evFill: string; evLabel: string; recLabel: string; font: string }

function nextMonth(ym: string): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7))
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

export function hexToRgba(hex: string, a: number): string {
  const h = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return `rgba(128,128,128,${a})`
  const n = parseInt(h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export class BandsPrimitive implements IPanePrimitive<Time> {
  private chart: IChartApi | null = null
  private request: (() => void) | null = null
  private bands: Band[] = []
  private range: { first: string; last: string } | null = null
  constructor(private style: BandStyle, private labels: boolean) {}

  attached(p: PaneAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi
    this.request = p.requestUpdate
  }
  detached() { this.chart = null; this.request = null }

  setData(bands: Band[], range: { first: string; last: string } | null, style?: BandStyle) {
    this.bands = bands
    this.range = range
    if (style) this.style = style
    this.request?.()
  }

  paneViews(): readonly IPanePrimitivePaneView[] {
    const renderer: IPrimitivePaneRenderer = {
      draw: () => {},
      drawBackground: (target: CanvasRenderingTarget2D) => this.drawAll(target),
    }
    return [{ zOrder: () => 'bottom', renderer: () => renderer }]
  }

  private x(ym: string): number | null {
    const ts = this.chart?.timeScale()
    if (!ts) return null
    const idx = ts.timeToIndex(`${ym}-01` as Time, true)
    if (idx === null) return null
    return ts.logicalToCoordinate(idx as unknown as Logical)
  }

  private drawAll(target: CanvasRenderingTarget2D) {
    if (!this.chart || !this.range || !this.bands.length) return
    const { first, last } = this.range
    const firstYm = first.slice(0, 7), lastYm = last.slice(0, 7)
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const spacing = this.chart!.timeScale().options().barSpacing
      const placed: { x1: number; x2: number; row: number }[] = []
      // 경기침체 먼저(아래), 이벤트 위에
      const order = [...this.bands].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'rec' ? -1 : 1))
      for (const b of order) {
        if (b.to < firstYm || b.from > lastYm) continue          // 데이터 범위 밖
        let x1 = this.x(b.from < firstYm ? firstYm : b.from)
        let x2 = this.x(nextMonth(b.to) > lastYm ? lastYm : nextMonth(b.to))
        if (x1 === null || x2 === null) continue
        if (nextMonth(b.to) > lastYm) x2 += spacing / 2
        if (x2 - x1 < 3) { const c = (x1 + x2) / 2; x1 = c - Math.max(1.5, spacing / 2); x2 = c + Math.max(1.5, spacing / 2) }
        if (x2 < 0 || x1 > mediaSize.width) continue
        ctx.fillStyle = b.kind === 'rec' ? this.style.recFill : this.style.evFill
        ctx.fillRect(x1, 0, x2 - x1, mediaSize.height)

        // 경기침체는 회색 음영 관례로 충분 → 라벨 없이(호버 시 표시), 이벤트만 이름 표기
        if (this.labels && b.label && b.kind === 'ev') {
          ctx.font = this.style.font
          const w = ctx.measureText(b.label).width
          const lx = Math.max(2, Math.min(x1 + 2, mediaSize.width - w - 2))
          // 겹치면 다음 줄로 (최대 3줄), 그래도 겹치면 생략
          let row = -1
          for (let r = 0; r < 3; r++) {
            if (!placed.some(p => p.row === r && !(lx + w + 4 < p.x1 || lx > p.x2 + 4))) { row = r; break }
          }
          if (row < 0) continue
          placed.push({ x1: lx, x2: lx + w, row })
          ctx.fillStyle = this.style.evLabel
          ctx.textBaseline = 'bottom'
          ctx.fillText(b.label, lx, mediaSize.height - 3 - row * 12)
        }
      }
    })
  }
}

/** 시점 t('YYYY-MM-DD')에 걸친 구간들 */
export function bandsAt(bands: Band[], t: string): Band[] {
  const ym = t.slice(0, 7)
  return bands.filter(b => b.from <= ym && ym <= b.to)
}
