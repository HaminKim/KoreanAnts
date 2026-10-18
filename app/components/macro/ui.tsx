'use client'

// 매크로 화면 공통 UI — 기존 /sectors · /watchlist 의 리포트 톤(각진 버튼, hairline, mono 숫자)을 그대로 따른다.

import { useEffect, useMemo, useState } from 'react'
import {
  type Catalog, type Easy, type Indicator, type Layer, type SeriesSummary, type Tf, type SeriesData,
  fmtNum, fmtPeriod, fmtShift, tfLabel,
} from '@/app/lib/macro'
import type { ChartLayer, HoverInfo, ShadeBand } from './MacroChart'

// ── 버튼 ──
export function Chip({ on = false, onClick, children, title, className = '', disabled = false }: {
  on?: boolean; onClick?: () => void; children: React.ReactNode; title?: string; className?: string; disabled?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} title={title} disabled={disabled}
      className={`px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 ${className}`}
      style={{
        background: on ? 'var(--accent)' : 'transparent',
        color: on ? '#fff' : 'var(--ink-mute)',
        border: `1px solid ${on ? 'var(--accent)' : 'var(--btn-border)'}`,
      }}
    >
      {children}
    </button>
  )
}

export function PrimaryButton({ onClick, children, className = '' }: { onClick?: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 text-xs font-bold whitespace-nowrap ${className}`}
      style={{ background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' }}>
      {children}
    </button>
  )
}

export function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-semibold mr-1" style={{ color: 'var(--ink-mute)' }}>{children}</span>
}

export const PERIODS: { label: string; years: number | null }[] = [
  { label: '5Y', years: 5 }, { label: '10Y', years: 10 }, { label: '20Y', years: 20 }, { label: '전체', years: null },
]

// ── 미니 차트 ──
export function Sparkline({ data, width = 160, height = 40, zeroLine = false }: {
  data: [string, number][]; width?: number; height?: number; zeroLine?: boolean
}) {
  if (data.length < 2) return <div style={{ width, height }} />
  const raw = data.map(d => d[1])
  // 코로나 같은 극단값 때문에 선이 평평해지지 않도록 2~98% 분위로 클립 (끝값은 그대로 강조)
  const sorted = [...raw].sort((a, b) => a - b)
  const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]
  const lo = q(0.02), hi = q(0.98)
  const vs = raw.map(v => Math.min(hi, Math.max(lo, v)))
  let min = Math.min(...vs), max = Math.max(...vs)
  if (zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0) }
  const span = max - min || 1
  const x = (i: number) => (i / (data.length - 1)) * (width - 2) + 1
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6)
  const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join('')
  const up = vs[vs.length - 1] >= vs[vs.length - 2]
  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block', height }}>
      {zeroLine && min < 0 && max > 0 && (
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--hairline-2)" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      )}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={1.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(vs[vs.length - 1])} r={2.2} fill={up ? 'var(--up-text)' : 'var(--down-text)'} />
    </svg>
  )
}

// ── 레전드 (레이어 하나) ──
export function LayerLegend({
  layer, color, hover, onTf, onShift, onRemove, onUp, onDown, compact = false, showControls = true,
}: {
  layer: ChartLayer; color: string; hover: HoverInfo
  onTf?: (tf: Tf) => void; onShift?: (n: number) => void; onRemove?: () => void
  onUp?: () => void; onDown?: () => void; compact?: boolean; showControls?: boolean
}) {
  const s = layer.series
  const step = s.obsFreq === 'Q' ? 3 : 1
  return (
    <div className="flex items-center gap-1.5 flex-wrap text-[11px] px-1.5 py-0.5"
      style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)', border: '1px solid var(--hairline)' }}>
      <span className="inline-block w-3 h-[3px] shrink-0" style={{ background: color }} />
      <span className="font-semibold truncate max-w-[220px]" style={{ color: 'var(--ink)' }} title={s.label}>{s.label}</span>
      {showControls && onTf && s.tf.length > 1 ? (
        <select value={layer.tf} onChange={e => onTf(e.target.value as Tf)}
          className="text-[11px] px-1 py-0 bg-transparent outline-none cursor-pointer"
          style={{ color: 'var(--ink-2)', border: '1px solid var(--btn-border)' }}>
          {s.tf.map(t => <option key={t} value={t}>{tfLabel(t, s.obsFreq)}</option>)}
        </select>
      ) : (
        <span style={{ color: 'var(--ink-mute)' }}>{tfLabel(layer.tf, s.obsFreq)}</span>
      )}
      <span className="mono font-semibold" style={{ color: 'var(--ink)' }}>{fmtNum(hover.value, s, layer.tf)}</span>
      <span className="mono" style={{ color: 'var(--ink-mute)' }}>{fmtPeriod(hover.date, s.obsFreq)}</span>
      {layer.shift !== 0 && (
        <span className="mono font-bold px-1" style={{ color: '#fff', background: color }} title="시간 이동은 표시용이며 원본 날짜는 바뀌지 않습니다">
          {fmtShift(layer.shift)}
        </span>
      )}
      {showControls && onShift && (
        <span className="inline-flex items-center" title="이 선만 X축으로 평행이동 (선행/후행 비교용)">
          <button type="button" onClick={() => onShift(layer.shift - step)} className="px-1 mono" style={{ color: 'var(--ink-2)', border: '1px solid var(--btn-border)' }}>◀</button>
          {!compact && <span className="px-1 text-[10px]" style={{ color: 'var(--ink-mute)' }}>이동</span>}
          <button type="button" onClick={() => onShift(layer.shift + step)} className="px-1 mono" style={{ color: 'var(--ink-2)', border: '1px solid var(--btn-border)' }}>▶</button>
        </span>
      )}
      {showControls && onUp && <button type="button" onClick={onUp} className="px-1" style={{ color: 'var(--ink-mute)' }} title="위로">↑</button>}
      {showControls && onDown && <button type="button" onClick={onDown} className="px-1" style={{ color: 'var(--ink-mute)' }} title="아래로">↓</button>}
      {showControls && onRemove && <button type="button" onClick={onRemove} className="px-1" style={{ color: 'var(--ink-mute)' }} title="제거">✕</button>}
    </div>
  )
}

// ── 지표/지수 불러오기 ──
export interface PickItem { key: string; label: string; ind: Indicator; role: 'main' | 'sub'; s: SeriesSummary }

export function buildPickList(cat: Catalog): PickItem[] {
  const out: PickItem[] = []
  const seen = new Set<string>()
  for (const ind of cat.indicators) {
    if (ind.status !== 'live') continue
    for (const [keys, role] of [[ind.main, 'main'], [ind.subs, 'sub']] as const) {
      for (const k of keys) {
        const s = cat.series[k]
        if (!s || seen.has(k)) continue
        seen.add(k)
        out.push({ key: k, label: s.label, ind, role, s })
      }
    }
  }
  return out
}

type PickerProps = {
  cat: Catalog; open: boolean; onClose: () => void; onPick: (key: string) => void
  only?: 'index' | 'macro'; exclude?: string[]
}

// 열릴 때마다 새로 마운트 → 검색어 자동 초기화
export function Picker(props: PickerProps) {
  return props.open ? <PickerBody {...props} /> : null
}

function PickerBody({ cat, onClose, onPick, only, exclude = [] }: PickerProps) {
  const [q, setQ] = useState('')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const list = useMemo(() => buildPickList(cat), [cat])
  const filtered = list.filter(it => {
    if (only === 'index' && it.ind.cat !== 'market') return false
    if (only === 'macro' && it.ind.cat === 'market') return false
    if (!q) return true
    const hay = `${it.label} ${it.key} ${it.ind.name} ${it.ind.ko}`.toLowerCase()
    return hay.includes(q.toLowerCase())
  })
  const byCat = cat.categories.map(c => ({ c, items: filtered.filter(f => f.ind.cat === c.id) })).filter(g => g.items.length)

  return (
    <div className="fixed inset-0 z-[1000] flex items-start justify-center p-4 pt-[10vh]" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={onClose}>
      <div className="w-full max-w-xl max-h-[75vh] flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--ink)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)}
            placeholder={only === 'index' ? '지수 검색' : '지표 검색 (예: CPI, 실업률, 금리)'}
            className="flex-1 text-sm px-2 py-1.5 outline-none bg-transparent"
            style={{ border: '1px solid var(--btn-border)', color: 'var(--ink)' }} />
          <button type="button" onClick={onClose} className="text-xs px-2 py-1.5" style={{ color: 'var(--ink-mute)', border: '1px solid var(--btn-border)' }}>닫기</button>
        </div>
        <div className="overflow-y-auto p-2">
          {byCat.length === 0 && <p className="text-xs p-4 text-center" style={{ color: 'var(--ink-mute)' }}>검색 결과가 없습니다</p>}
          {byCat.map(({ c, items }) => (
            <div key={c.id} className="mb-2">
              <div className="text-[10px] font-bold tracking-wide px-2 py-1" style={{ color: 'var(--ink-mute)' }}>{c.name}</div>
              {items.map(it => {
                const dis = exclude.includes(it.key)
                return (
                  <button key={it.key} type="button" disabled={dis}
                    onClick={() => { onPick(it.key); onClose() }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 text-left disabled:opacity-40 hover:bg-[var(--plane)]">
                    <span className="text-xs font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--ink)' }}>
                      {it.label}
                      {it.role === 'sub' && <span className="ml-1.5 text-[10px] font-normal" style={{ color: 'var(--ink-mute)' }}>보조 · {it.ind.name}</span>}
                    </span>
                    <span className="mono text-[10px] shrink-0" style={{ color: 'var(--ink-mute)' }}>{it.s.first?.slice(0, 4)}~ · {it.s.obsFreq === 'Q' ? '분기' : '월'}</span>
                    {dis && <span className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>추가됨</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 시리즈 로딩 훅 ──
export function useSeriesMap(keys: string[], load: (k: string) => Promise<SeriesData>) {
  const [map, setMap] = useState<Record<string, SeriesData>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const sig = keys.join(',')
  useEffect(() => {
    let alive = true
    for (const k of keys) {
      if (map[k]) continue
      load(k).then(s => { if (alive) setMap(m => ({ ...m, [k]: s })) })
        .catch(() => { if (alive) setErrors(e => ({ ...e, [k]: true })) })
    }
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig])
  return { map, errors }
}

export function defaultTf(s: SeriesSummary | SeriesData): Tf { return s.tf[0] }

export function newLayer(key: string, s: SeriesSummary | SeriesData, tf?: Tf): Layer {
  return { key, tf: tf && s.tf.includes(tf) ? tf : defaultTf(s), shift: 0 }
}

export function useIsMobile(bp = 640) {
  const [m, setM] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${bp - 1}px)`)
    const on = () => setM(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [bp])
  return m
}

// ── 경기침체/위기 음영 토글 (뷰어별 선호, 브라우저 저장) ──
const SHADE_KEY = 'reant_macro_shade'
export interface Shade { rec: boolean; ev: boolean }

export function useShade(): [Shade, (s: Shade) => void] {
  const [shade, setShade] = useState<Shade>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SHADE_KEY) || 'null')
      if (v && typeof v.rec === 'boolean' && typeof v.ev === 'boolean') return v
    } catch { /* 저장소 접근 불가 */ }
    return { rec: true, ev: true }
  })
  const set = (s: Shade) => {
    setShade(s)
    try { localStorage.setItem(SHADE_KEY, JSON.stringify(s)) } catch { /* 무시 */ }
  }
  return [shade, set]
}

export function shadeBands(cat: Catalog, shade: Shade): ShadeBand[] {
  const out: ShadeBand[] = []
  if (shade.rec) {
    for (const r of cat.recessions ?? []) {
      out.push({ kind: 'rec', from: r.from, to: r.to, label: '경기침체', note: r.ongoing ? 'NBER 경기침체 (진행 중)' : 'NBER 공식 경기침체 구간' })
    }
  }
  if (shade.ev) {
    for (const e of cat.events ?? []) out.push({ kind: 'ev', from: e.from, to: e.to, label: e.name, note: e.note })
  }
  return out
}

export function ShadeToggles({ shade, onChange }: { shade: Shade; onChange: (s: Shade) => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Label>음영</Label>
      <Chip on={shade.rec} onClick={() => onChange({ ...shade, rec: !shade.rec })} title="NBER 공식 경기침체 구간 (FRED USREC)">
        <span className="inline-block w-2 h-2 mr-1 align-middle" style={{ background: 'var(--ink-mute)', opacity: 0.6 }} />경기침체
      </Chip>
      <Chip on={shade.ev} onClick={() => onChange({ ...shade, ev: !shade.ev })} title="닷컴·금융위기(리먼)·코로나·관세 쇼크 등 시장 위기 구간">
        <span className="inline-block w-2 h-2 mr-1 align-middle" style={{ background: 'var(--down-text)', opacity: 0.6 }} />위기·이벤트
      </Chip>
    </span>
  )
}

// ── 쉽게 이해하기: 의미 → ▲ 올라가면 → ▼ 떨어지면 (+참고) ──
export function EasyBlock({ easy, size = 'md', showNote = true }: { easy: Easy; size?: 'md' | 'sm'; showNote?: boolean }) {
  const t = size === 'md' ? 'text-sm' : 'text-[11px]'
  return (
    <div className={`${t} leading-relaxed`}>
      <p style={{ color: 'var(--ink)' }}>{easy.means}</p>
      <p className="mt-1.5 flex gap-1.5">
        <span className="shrink-0 font-bold" style={{ color: 'var(--up-text)' }}>▲ 올라가면</span>
        <span style={{ color: 'var(--ink-2)' }}>{easy.up}</span>
      </p>
      <p className="mt-1 flex gap-1.5">
        <span className="shrink-0 font-bold" style={{ color: 'var(--down-text)' }}>▼ 떨어지면</span>
        <span style={{ color: 'var(--ink-2)' }}>{easy.down}</span>
      </p>
      {showNote && easy.note && <p className="mt-1.5" style={{ color: 'var(--ink-mute)' }}>참고 · {easy.note}</p>}
    </div>
  )
}
