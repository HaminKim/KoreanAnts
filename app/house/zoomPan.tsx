'use client'

// SVG 지도 확대·이동 (전국 · 시도 · 시군구 지도 공용) — 단지 지도(Leaflet)처럼 손가락으로 자연스럽게
//  - 데스크톱: 휠 = 확대/축소, 끌기 = 이동
//  - 폰: 두 손가락 = 확대/축소(+이동), 확대된 상태에선 한 손가락 = 이동
//    전체 보기 상태에선 한 손가락 세로 끌기는 페이지 스크롤로 넘김 (지도에 갇혀서 스크롤이 안 되는 일 방지)
//  - 끌거나 오므린 뒤 손을 떼도 클릭(지역 선택)으로 치지 않음

import { useEffect, useRef, useState } from 'react'

export type VB = [number, number, number, number]

/** 비율은 full 과 같게, 크기는 full/maxZoom ~ full, 위치는 full 안으로 */
export function clampVB(v: VB, full: VB, maxZoom: number): VB {
  const [fx, fy, fw, fh] = full
  const w = Math.min(fw, Math.max(fw / maxZoom, v[2])), h = w * fh / fw
  const cx = Math.min(fx + fw - w / 2, Math.max(fx + w / 2, v[0] + v[2] / 2))
  const cy = Math.min(fy + fh - h / 2, Math.max(fy + h / 2, v[1] + v[3] / 2))
  return [cx - w / 2, cy - h / 2, w, h]
}

type Gesture = {
  vb: VB                       // 시작할 때 viewBox
  inv: DOMMatrix               // 시작할 때 화면 → 지도 좌표
  cx: number; cy: number       // 시작 중심(화면)
  dist: number                 // 시작 두 손가락 거리 (한 손가락이면 0)
  moved: boolean
}

export function useZoomPan(full: VB, init: VB, maxZoom: number) {
  const [vb, setVbState] = useState<VB>(() => clampVB(init, full, maxZoom))
  const vbRef = useRef(vb)
  const setVb = (v: VB) => { const c = clampVB(v, full, maxZoom); vbRef.current = c; setVbState(c) }
  const ref = useRef<SVGSVGElement>(null)
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const g = useRef<Gesture | null>(null)
  const moved = useRef(false)   // 방금 끌었으면 이어지는 click 무시

  const atFull = vb[2] >= full[2] - 1e-6 * full[2]

  const inverse = () => ref.current?.getScreenCTM()?.inverse() ?? null
  const start = () => {
    const inv = inverse()
    const p = [...pts.current.values()]
    if (!inv || !p.length) { g.current = null; return }
    const cx = p.reduce((s, q) => s + q.x, 0) / p.length, cy = p.reduce((s, q) => s + q.y, 0) / p.length
    const dist = p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0
    g.current = { vb: vbRef.current, inv, cx, cy, dist, moved: g.current?.moved ?? false }
  }

  const zoomAt = (f: number, clientX?: number, clientY?: number) => {
    const v = vbRef.current
    const inv = clientX !== undefined && clientY !== undefined ? inverse() : null
    const c = inv ? new DOMPoint(clientX, clientY).matrixTransform(inv) : null
    const mx = c ? c.x : v[0] + v[2] / 2, my = c ? c.y : v[1] + v[3] / 2
    setVb([mx - (mx - v[0]) * f, my - (my - v[1]) * f, v[2] * f, v[3] * f])
  }

  // 휠은 페이지 스크롤을 막아야 해서 passive: false 로 직접 등록. 전체 보기에서 아래로 굴리면 페이지 스크롤
  useEffect(() => {
    const svg = ref.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      const full0 = vbRef.current[2] >= full[2] - 1e-6 * full[2]
      if (e.deltaY > 0 && full0) return
      e.preventDefault()
      zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.clientX, e.clientY)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full[0], full[1], full[2], full[3]])

  // 끄는 중엔 window 에서 받음 (pointer capture 를 쓰면 click 이 지역 path 대신 svg 로 가서 선택이 안 됨)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!pts.current.has(e.pointerId)) return
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const s = g.current
      if (!s) return
      const p = [...pts.current.values()]
      const cx = p.reduce((a, q) => a + q.x, 0) / p.length, cy = p.reduce((a, q) => a + q.y, 0) / p.length
      const dist = p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0
      if (!s.moved && Math.hypot(cx - s.cx, cy - s.cy) < 5 && (!s.dist || Math.abs(dist - s.dist) < 5)) return
      s.moved = true
      moved.current = true
      const f = s.dist && dist ? s.dist / dist : 1
      // 시작 때 손가락 아래 있던 지점이 지금 손가락 아래 오게
      const a = new DOMPoint(s.cx, s.cy).matrixTransform(s.inv)
      const b = new DOMPoint(cx, cy).matrixTransform(s.inv)
      const w = s.vb[2] * f, h = s.vb[3] * f
      const c = clampVB([a.x - (b.x - s.vb[0]) * f, a.y - (b.y - s.vb[1]) * f, w, h], full, maxZoom)
      vbRef.current = c
      setVbState(c)
    }
    const up = (e: PointerEvent) => {
      if (!pts.current.delete(e.pointerId)) return
      if (pts.current.size) start()   // 두 손가락 → 한 손가락: 남은 손가락 기준으로 다시
      else g.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full[0], full[1], full[2], full[3], maxZoom])

  const svgProps = {
    ref,
    viewBox: vb.map(n => n.toFixed(2)).join(' '),
    style: { touchAction: atFull ? 'pan-y' : 'none', cursor: g.current?.moved ? 'grabbing' : 'grab' } as React.CSSProperties,
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (!pts.current.size) { moved.current = false; g.current = null }
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      start()
    },
    // 끌고 놓은 건 클릭·더블클릭으로 치지 않음
    onClickCapture: (e: React.MouseEvent) => { if (moved.current) { e.stopPropagation(); e.preventDefault(); moved.current = false } },
    onDoubleClickCapture: (e: React.MouseEvent) => { if (moved.current) e.stopPropagation() },
  }

  return { vb, setVb, zoomAt, atFull, svgProps, k: vb[2] / full[2] }
}

/** 모서리 + − 버튼과 전체 보기 */
export function ZoomControls({ zoomAt, atFull, onReset, resetLabel }: {
  zoomAt: (f: number) => void; atFull: boolean; onReset: () => void; resetLabel: string | null
}) {
  const btn = 'w-8 h-8 flex items-center justify-center text-sm font-bold'
  const st = { background: 'var(--surface)', color: 'var(--ink)', border: '1px solid var(--hairline-2)' }
  return <>
    <div className="absolute right-2 top-2 flex flex-col gap-1">
      <button type="button" className={btn} style={st} onClick={() => zoomAt(1 / 1.5)} aria-label="확대" title="확대">+</button>
      <button type="button" className={btn} style={st} onClick={() => zoomAt(1.5)} aria-label="축소" title="축소" disabled={atFull}>−</button>
    </div>
    <div className="absolute left-2 bottom-2 flex items-center gap-1.5 text-[10px] pointer-events-none">
      {resetLabel && (
        <button type="button" onClick={onReset} className="px-2 py-1 font-semibold pointer-events-auto" style={st}>{resetLabel}</button>
      )}
    </div>
  </>
}
