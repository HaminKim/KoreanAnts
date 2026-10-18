'use client'

// 06. MACRO WORKSPACE — Stack Mode
//  좌 5/7: 지표마다 자기 차트를 세로로 나열 (겹치지 않음). 모든 차트는 하나의 공통 X축, 눈금은 맨 아래.
//  우 2/7: 불러온 지표 '모두'의 설명 — 각 차트 옆에 같은 높이로 정렬, 높이(S/M/L)에 맞춰 내용 양 조절
//  분석 구성은 이름을 붙여 브라우저에 저장/불러오기.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Catalog, type Layer, loadCatalog, loadSeries, decodeLayers, easyOf, freqNote, indicatorOfSeries,
} from '@/app/lib/macro'
import {
  type Preset, type WsState, BUILTIN_PRESETS, deletePreset, listPresets, loadCurrent, saveCurrent, savePreset,
} from '@/app/lib/macroPresets'
import MacroChart, { type ChartLayer, type MacroChartHandle, layerColor, useDark } from '@/app/components/macro/MacroChart'
import { Chip, DataNotes, EasyBlock, Label, LayerLegend, PERIODS, Picker, ShadeToggles, newLayer, shadeBands, useIsMobile, useSeriesMap, useShade } from '@/app/components/macro/ui'

const HEIGHTS = [{ label: 'S', h: 120 }, { label: 'M', h: 160 }, { label: 'L', h: 220 }]

export default function WorkspaceClient() {
  const [cat, setCat] = useState<Catalog | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { loadCatalog().then(setCat).catch(() => setErr(true)) }, [])
  if (err) return <Msg>지표 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Msg>
  if (!cat) return <Msg>불러오는 중…</Msg>
  return <Workspace cat={cat} />
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div className="py-32 text-center text-sm" style={{ color: 'var(--ink-mute)' }}>{children}</div>
}

function initialState(cat: Catalog): WsState {
  const valid = (ls: Layer[]) => ls.filter(l => cat.series[l.key] && cat.series[l.key].tf.includes(l.tf))
  const fromUrl = valid(decodeLayers(new URLSearchParams(window.location.search).get('l')))
  if (fromUrl.length) return { v: 1, mode: 'stack', layers: fromUrl, years: null, range: null, paneH: 160 }
  const cur = loadCurrent()
  if (cur && valid(cur.layers).length) return { ...cur, layers: valid(cur.layers) }
  return BUILTIN_PRESETS[0].state
}

function Workspace({ cat }: { cat: Catalog }) {
  const chartRef = useRef<MacroChartHandle>(null)
  const dark = useDark()
  const mobile = useIsMobile(1024)
  const [shade, setShade] = useShade()
  const bands = useMemo(() => shadeBands(cat, shade), [cat, shade])
  // Workspace 는 catalog 로드 후 브라우저에서만 마운트됨 → 초기 상태를 바로 계산
  const [init] = useState(() => initialState(cat))
  const [layers, setLayers] = useState<Layer[]>(init.layers)
  const [years, setYears] = useState<number | null>(init.years)
  const [paneH, setPaneH] = useState(init.paneH || 160)
  const [logScale, setLogScale] = useState(!!init.log)
  const [chartKey, setChartKey] = useState(0)          // 프리셋 불러오기 시 차트 재생성 (저장된 구간 복원)
  const [initRange, setInitRange] = useState<{ from: string; to: string } | null>(init.range)
  const rangeRef = useRef<{ from: string; to: string } | null>(init.range)
  const [picker, setPicker] = useState<null | 'macro' | 'index'>(null)
  const [presets, setPresets] = useState<Preset[]>(() => listPresets())
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState('')
  const [loadOpen, setLoadOpen] = useState(false)

  const apply = useCallback((s: WsState) => {
    setLayers(s.layers)
    setYears(s.years)
    setPaneH(s.paneH || 160)
    setLogScale(!!s.log)
    setInitRange(s.range)
    rangeRef.current = s.range
    setChartKey(k => k + 1)
  }, [])

  // URL 의 ?l= 는 한 번 반영 후 지움 (이후 상태는 자동 저장으로 유지)
  useEffect(() => {
    if (window.location.search) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const snapshot = useCallback((): WsState => ({
    v: 1, mode: 'stack', layers, years, paneH, log: logScale, range: chartRef.current?.getRange() ?? rangeRef.current,
  }), [layers, years, paneH, logScale])

  // 자동 저장 (현재 작업 상태)
  useEffect(() => {
    const t = setTimeout(() => saveCurrent(snapshot()), 400)
    return () => clearTimeout(t)
  }, [layers, years, paneH, logScale, snapshot])
  const onRange = useCallback((r: { from: string; to: string } | null) => {
    rangeRef.current = r
  }, [])
  useEffect(() => {
    const save = () => saveCurrent(snapshot())
    window.addEventListener('pagehide', save)
    return () => window.removeEventListener('pagehide', save)
  }, [snapshot])

  const keys = layers.map(l => l.key)
  const { map } = useSeriesMap(keys, loadSeries)
  const chartLayers: ChartLayer[] = layers
    .map((l, i) => ({ ...l, id: `${l.key}-${i}`, series: map[l.key] }))
    .filter(l => l.series)
  const loading = layers.length > 0 && chartLayers.length < layers.length

  const update = (i: number, patch: Partial<Layer>) => setLayers(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const move = (i: number, d: -1 | 1) => setLayers(ls => {
    const j = i + d
    if (j < 0 || j >= ls.length) return ls
    const c = ls.slice(); [c[i], c[j]] = [c[j], c[i]]; return c
  })
  const add = (k: string) => setLayers(ls => [...ls, newLayer(k, cat.series[k])])
  const anyShift = layers.some(l => l.shift !== 0)

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(''), 2200) }
  const doSave = () => {
    const n = name.trim()
    if (!n) return
    setPresets(savePreset(n, snapshot()))
    setSaving(false); setName('')
    flash(`'${n}' 저장됨`)
  }
  const doLoad = (p: Preset) => { apply(p.state); setLoadOpen(false); flash(`'${p.name}' 불러옴`) }

  const n = layers.length

  return (
    <div className="macro-bleed pb-16">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <Link href="/macro" className="text-xs" style={{ color: 'var(--ink-mute)' }}>← 매크로 지표</Link>
          <h1 className="mt-1 text-xl font-bold" style={{ color: 'var(--ink)' }}>매크로 워크스페이스</h1>
          <p className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>지표를 세로로 쌓아 같은 시간축에서 비교합니다 · 어느 차트에서 확대/이동해도 전체가 같이 움직입니다</p>
        </div>
        {/* 저장 / 불러오기 */}
        <div className="flex items-center gap-1.5 flex-wrap relative">
          {notice && <span className="text-[11px] mr-1" style={{ color: 'var(--up-text)' }}>{notice}</span>}
          {saving ? (
            <>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={40}
                onKeyDown={e => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') setSaving(false) }}
                placeholder="예: 인플레이션과 나스닥" className="text-xs px-2 py-1 outline-none bg-transparent w-48"
                style={{ border: '1px solid var(--accent)', color: 'var(--ink)' }} />
              <Chip on onClick={doSave}>저장</Chip>
              <Chip onClick={() => setSaving(false)}>취소</Chip>
            </>
          ) : (
            <Chip onClick={() => setSaving(true)} disabled={!n}>구성 저장</Chip>
          )}
          <Chip on={loadOpen} onClick={() => setLoadOpen(o => !o)}>불러오기 ▾</Chip>
          {loadOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-72 max-h-80 overflow-y-auto"
              style={{ background: 'var(--surface)', border: '1px solid var(--ink)' }}>
              <PresetGroup title="내 저장 구성" items={presets} onLoad={doLoad}
                onDelete={p => setPresets(deletePreset(p.name))} empty="저장한 구성이 없습니다 (이 브라우저에만 저장)" />
              <PresetGroup title="예시" items={BUILTIN_PRESETS} onLoad={doLoad} />
            </div>
          )}
        </div>
      </div>

      {/* 조작 */}
      <div className="mt-4 flex items-center gap-1.5 flex-wrap">
        <Chip onClick={() => setPicker('macro')}>+ 지표 불러오기</Chip>
        <Chip onClick={() => setPicker('index')}>+ 지수 불러오기</Chip>
        <span className="ml-2" />
        <Label>기간</Label>
        {PERIODS.map(p => (
          <Chip key={p.label} on={years === p.years} onClick={() => { setYears(p.years); chartRef.current?.setYears(p.years) }}>{p.label}</Chip>
        ))}
        <span className="ml-2" />
        <Label>높이</Label>
        {HEIGHTS.map(h => <Chip key={h.label} on={paneH === h.h} onClick={() => setPaneH(h.h)}>{h.label}</Chip>)}
        <Chip className="ml-2" on={logScale} onClick={() => setLogScale(v => !v)}
          title="로그 축: 같은 거리 = 같은 % 변화. 값이 모두 양수인 차트에만 적용 (YoY·스프레드 등은 일반 축 유지)">로그</Chip>
        <span className="ml-2" />
        <ShadeToggles shade={shade} onChange={setShade} />
        {anyShift && <Chip className="ml-2" onClick={() => setLayers(ls => ls.map(l => ({ ...l, shift: 0 })))}>시간 이동 초기화</Chip>}
        {n > 0 && <Chip className="ml-auto" onClick={() => setLayers([])}>모두 지우기</Chip>}
      </div>

      <div className="mt-3 grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-5">
        {/* 좌: 세로 나열 차트 */}
        <div className="min-w-0 pt-1" style={{ borderTop: '1px solid var(--ink)' }}>
          {n === 0 ? (
            <div className="py-24 text-center" style={{ border: '1px dashed var(--hairline-2)' }}>
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>비교할 지표를 불러오세요</p>
              <div className="mt-3 flex justify-center gap-1.5">
                <Chip on onClick={() => setPicker('macro')}>+ 지표 불러오기</Chip>
                <Chip onClick={() => setPicker('index')}>+ 지수 불러오기</Chip>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center text-sm" style={{ height: n * paneH, color: 'var(--ink-mute)' }}>차트 불러오는 중…</div>
          ) : (
            <MacroChart
              key={chartKey} ref={chartRef} mode="stack" layers={chartLayers}
              paneHeight={mobile ? Math.min(paneH, 150) : paneH}
              initialRange={initRange} initialYears={years} onRangeChange={onRange} bands={bands} logScale={logScale}
              renderLegend={(l, i, color, hover) => (
                <LayerLegend layer={l} color={color} hover={hover} compact
                  onTf={tf => update(i, { tf })}
                  onShift={s => update(i, { shift: s })}
                  onUp={i > 0 ? () => move(i, -1) : undefined}
                  onDown={i < n - 1 ? () => move(i, 1) : undefined}
                  onRemove={() => setLayers(ls => ls.filter((_, j) => j !== i))}
                />
              )}
            />
          )}
          <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
            ◀ ▶ 는 해당 차트의 선만 X축으로 평행이동합니다(표시용, 원본 날짜 불변). 선행·후행을 눈으로 탐색하는 기능이며 인과관계를 증명하지 않습니다.
          </p>
          <DataNotes cat={cat} keys={keys} />
        </div>

        {/* 우: 지표 설명 — PC 에서는 각 차트(pane) 옆에 같은 높이로 정렬. 높이(S/M/L)에 맞춰 내용 양 조절 */}
        <aside className="min-w-0 pt-1" style={{ borderTop: '1px solid var(--ink)' }}>
          {n === 0 && <p className="text-[11px] pt-2" style={{ color: 'var(--ink-mute)' }}>지표를 불러오면 여기에 정의와 해석이 표시됩니다.</p>}
          {layers.map((l, i) => {
            const s = cat.series[l.key]
            const ind = indicatorOfSeries(cat, l.key)
            if (!s) return null
            const easy = easyOf(cat, l.key)
            // 모바일(차트 아래로 내려감)은 높이 제한 없이 전체, PC 는 S=의미 / M=+▲▼ / L=전체(+참고·단위)
            const tier: 'S' | 'M' | 'L' = mobile ? 'L' : paneH <= 120 ? 'S' : paneH <= 160 ? 'M' : 'L'
            return (
              <div key={`${l.key}-${i}`}
                className="px-1 py-1.5 overflow-y-auto"
                style={{
                  height: mobile ? undefined : paneH + 1,          // pane 높이 + 구분선 1px → 차트와 같은 줄
                  borderBottom: '1px solid var(--hairline)',
                  scrollbarWidth: 'thin',
                }}>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-[3px] shrink-0" style={{ background: layerColor(i, dark) }} />
                  {ind ? (
                    <Link href={`/macro/${ind.id}`} className="text-xs font-bold hover:underline truncate" style={{ color: 'var(--ink)' }}>{s.label}</Link>
                  ) : <span className="text-xs font-bold truncate" style={{ color: 'var(--ink)' }}>{s.label}</span>}
                </div>
                {easy ? (
                  <div className="mt-1">
                    <EasyBlock easy={easy} size="sm" showUpDown={tier !== 'S'} showNote={tier === 'L'} />
                  </div>
                ) : ind ? <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>{ind.what}</p> : null}
                {tier === 'L' && <p className="mt-1 text-[10px]" style={{ color: 'var(--ink-mute)' }}>{s.units} · {freqNote(s)} · {s.first?.slice(0, 4)}~</p>}
              </div>
            )
          })}
        </aside>
      </div>

      <Picker cat={cat} open={picker !== null} only={picker ?? undefined} onClose={() => setPicker(null)} exclude={keys} onPick={add} />
    </div>
  )
}

function PresetGroup({ title, items, onLoad, onDelete, empty }: {
  title: string; items: Preset[]; onLoad: (p: Preset) => void; onDelete?: (p: Preset) => void; empty?: string
}) {
  return (
    <div className="p-1">
      <div className="text-[10px] font-bold px-2 py-1" style={{ color: 'var(--ink-mute)' }}>{title}</div>
      {items.length === 0 && empty && <div className="text-[11px] px-2 py-1.5" style={{ color: 'var(--ink-mute)' }}>{empty}</div>}
      {items.map(p => (
        <div key={p.name} className="flex items-center gap-1 hover:bg-[var(--plane)]">
          <button type="button" onClick={() => onLoad(p)} className="flex-1 text-left px-2 py-1.5 min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>{p.name}</div>
            <div className="text-[10px] truncate" style={{ color: 'var(--ink-mute)' }}>
              {p.state.layers.length}개 지표{p.savedAt ? ` · ${p.savedAt.slice(0, 10)}` : ''}
            </div>
          </button>
          {onDelete && <button type="button" onClick={() => onDelete(p)} className="px-2 text-xs" style={{ color: 'var(--ink-mute)' }} title="삭제">✕</button>}
        </div>
      ))}
    </div>
  )
}
