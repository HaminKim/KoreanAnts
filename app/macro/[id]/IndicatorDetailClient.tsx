'use client'

// 05. INDICATOR DETAIL — Overlay Mode
//  하나의 지표를 크게 보고, S&P500 / Nasdaq-100 / 다른 지표를 '같은 차트에 겹쳐' 비교한다.
//  전체 Zoom/Pan 은 공통, 개별 선은 X축 평행이동(Time Shift)만. Y축: 독립 / 정규화.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Catalog, type Indicator, type Layer,
  loadCatalog, loadSeries, encodeLayers, decodeLayers, fmtNum, fmtPeriod, freqNote, tfLabel, REL_LABEL,
} from '@/app/lib/macro'
import MacroChart, { type ChartLayer, type MacroChartHandle } from '@/app/components/macro/MacroChart'
import { Chip, Label, LayerLegend, PERIODS, Picker, newLayer, useIsMobile, useSeriesMap } from '@/app/components/macro/ui'

export default function IndicatorDetailClient({ id }: { id: string }) {
  const [cat, setCat] = useState<Catalog | null>(null)
  const [err, setErr] = useState(false)
  useEffect(() => { loadCatalog().then(setCat).catch(() => setErr(true)) }, [])
  const ind = cat?.indicators.find(i => i.id === id)

  if (err) return <Msg>지표 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</Msg>
  if (!cat) return <Msg>불러오는 중…</Msg>
  if (!ind) return <Msg>존재하지 않는 지표입니다. <Link href="/macro" className="underline">지표 목록</Link></Msg>
  return <Detail cat={cat} ind={ind} />
}

function Msg({ children }: { children: React.ReactNode }) {
  return <div className="py-32 text-center text-sm" style={{ color: 'var(--ink-mute)' }}>{children}</div>
}

function Detail({ cat, ind }: { cat: Catalog; ind: Indicator }) {
  const chartRef = useRef<MacroChartHandle>(null)
  const defaults = useMemo<Layer[]>(
    () => ind.main.filter(k => cat.series[k]).map(k => newLayer(k, cat.series[k])),
    [cat, ind],
  )
  // URL ?l=… 로 상태 복원 (공유·뒤로가기 대비). Detail 은 catalog 로드 후 브라우저에서만 마운트되므로 window 사용 가능
  const [layers, setLayers] = useState<Layer[]>(() => {
    const ls = decodeLayers(new URLSearchParams(window.location.search).get('l')).filter(l => cat.series[l.key])
    return ls.length ? ls : defaults
  })
  const [yMode, setYMode] = useState<'independent' | 'normalized'>(
    () => (new URLSearchParams(window.location.search).get('y') === 'n' ? 'normalized' : 'independent'),
  )
  const [years, setYears] = useState<number | null>(null)
  const [picker, setPicker] = useState(false)
  const mobile = useIsMobile()

  useEffect(() => {
    const sp = new URLSearchParams()
    const same = encodeLayers(layers) === encodeLayers(defaults)
    if (!same) sp.set('l', encodeLayers(layers))
    if (yMode === 'normalized') sp.set('y', 'n')
    const qs = sp.toString()
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
  }, [layers, yMode, defaults])

  const keys = layers.map(l => l.key)
  const { map, errors } = useSeriesMap(keys, loadSeries)
  const chartLayers: ChartLayer[] = layers
    .map((l, i) => ({ ...l, id: `${l.key}-${i}`, series: map[l.key] }))
    .filter(l => l.series)

  const has = (k: string) => keys.includes(k)
  const toggle = (k: string) => {
    if (has(k)) setLayers(ls => ls.filter(l => l.key !== k))
    else if (cat.series[k]) setLayers(ls => [...ls, newLayer(k, cat.series[k])])
  }
  const update = (i: number, patch: Partial<Layer>) => setLayers(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const anyShift = layers.some(l => l.shift !== 0)
  const setPeriod = useCallback((y: number | null) => { setYears(y); chartRef.current?.setYears(y) }, [])

  const main = cat.series[ind.main[0]]
  const relById = (rid: string) => cat.indicators.find(i => i.id === rid)

  return (
    <div className="macro-bleed pb-16">
      <div className="max-w-[1320px] mx-auto">
        <Link href="/macro" className="text-xs" style={{ color: 'var(--ink-mute)' }}>← 매크로 지표</Link>

        {/* 상단: 지표명·정의 */}
        <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-mute)' }}>
              {cat.categories.find(c => c.id === ind.cat)?.name}{ind.no ? ` · #${ind.no}` : ''}
            </div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{ind.ko}</h1>
            <div className="text-xs" style={{ color: 'var(--ink-2)' }}>{ind.name}</div>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--ink-2)' }}>{ind.what}</p>
          </div>
          {main && (
            <div className="text-right">
              <div className="mono text-2xl font-bold" style={{ color: 'var(--ink)' }}>{fmtNum(main.latest.value, main, main.latest.tf)}</div>
              <div className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>
                {tfLabel(main.latest.tf, main.obsFreq)} · {fmtPeriod(main.latest.date, main.obsFreq)}
                {main.latest.prev !== null && <> · 직전 {fmtNum(main.latest.prev, main, main.latest.tf)}</>}
              </div>
            </div>
          )}
        </div>

        {/* 비교 조작 */}
        <div className="mt-5 flex items-center gap-1.5 flex-wrap">
          <Label>비교</Label>
          <Chip on={has('SPX')} onClick={() => toggle('SPX')}>S&amp;P500 비교</Chip>
          <Chip on={has('NDX')} onClick={() => toggle('NDX')}>Nasdaq-100 비교</Chip>
          <Chip onClick={() => setPicker(true)}>+ 지표 불러오기</Chip>
          {ind.subs.filter(k => cat.series[k]).length > 0 && <span className="ml-2" />}
          {ind.subs.filter(k => cat.series[k]).map(k => (
            <Chip key={k} on={has(k)} onClick={() => toggle(k)} title="보조/연결 지표">{has(k) ? '✓ ' : '+ '}{cat.series[k].label}</Chip>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <Label>기간</Label>
          {PERIODS.map(p => <Chip key={p.label} on={years === p.years} onClick={() => setPeriod(p.years)}>{p.label}</Chip>)}
          <span className="ml-3" />
          <Label>Y축</Label>
          <Chip on={yMode === 'independent'} onClick={() => setYMode('independent')} title="선마다 자기 축 (첫 번째=오른쪽, 두 번째=왼쪽, 나머지는 범례 값)">독립 축</Chip>
          <Chip on={yMode === 'normalized'} onClick={() => setYMode('normalized')} title="겹치는 기간의 평균·표준편차로 표준화(z-score)">정규화</Chip>
          {anyShift && (
            <Chip onClick={() => setLayers(ls => ls.map(l => ({ ...l, shift: 0 })))} className="ml-2">시간 이동 초기화</Chip>
          )}
          <Link href={`/macro/workspace?l=${encodeURIComponent(encodeLayers(layers))}`}
            className="ml-auto px-2.5 py-1 text-xs font-semibold" style={{ border: '1px solid var(--btn-border)', color: 'var(--ink-2)' }}>
            워크스페이스에서 세로로 보기 →
          </Link>
        </div>

        {/* 차트 */}
        <div className="mt-3 pt-1" style={{ borderTop: '1px solid var(--ink)' }}>
          {chartLayers.length ? (
            <MacroChart
              ref={chartRef} mode="overlay" layers={chartLayers} yMode={yMode} initialYears={years}
              height={mobile ? 360 : 480}
              renderLegend={(l, i, color, hover) => (
                <LayerLegend layer={l} color={color} hover={hover}
                  onTf={tf => update(layers.findIndex(x => x.key === l.key), { tf })}
                  onShift={n => update(layers.findIndex(x => x.key === l.key), { shift: n })}
                  onRemove={layers.length > 1 ? () => setLayers(ls => ls.filter(x => x.key !== l.key)) : undefined}
                  compact={i > 0}
                />
              )}
            />
          ) : (
            <div className="h-[480px] flex items-center justify-center text-sm" style={{ color: 'var(--ink-mute)' }}>
              {keys.some(k => errors[k]) ? '데이터를 불러오지 못했습니다' : '차트 불러오는 중…'}
            </div>
          )}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
          휠/핀치로 확대·축소, 드래그로 이동 (모든 선 공통). ◀ ▶ 는 해당 선만 X축으로 평행이동합니다 — 표시용이며 원본 날짜·값은 바뀌지 않고,
          선이 비슷해 보여도 인과·예측력을 증명하지 않습니다.
          {yMode === 'normalized' && ' 정규화: 불러온 지표들이 모두 존재하는 기간의 평균=0, 표준편차=1 (σ).'}
        </p>

        {/* DATA / KNOWLEDGE */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-6">
          <section>
            <H2>해석</H2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}>{ind.read}</p>
            {ind.caution && <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--down-text)' }}>주의 · {ind.caution}</p>}

            {ind.relations.length > 0 && (
              <div className="mt-6">
                <H2>연결된 지표 <span className="font-normal text-[10px]" style={{ color: 'var(--ink-mute)' }}>관계 초안 · 검증 전</span></H2>
                <ul className="space-y-1">
                  {ind.relations.map((r, i) => {
                    const o = relById(r.id)
                    if (!o) return null
                    const lbl = r.dir === 'out' ? REL_LABEL[r.type].out : REL_LABEL[r.type].in
                    return (
                      <li key={i} className="text-xs flex items-center gap-2">
                        <span className="mono w-24 shrink-0" style={{ color: 'var(--ink-mute)' }}>{lbl}</span>
                        {o.status === 'live'
                          ? <Link href={`/macro/${o.id}`} className="font-semibold underline-offset-2 hover:underline" style={{ color: 'var(--accent)' }}>{o.ko}</Link>
                          : <span style={{ color: 'var(--ink-mute)' }}>{o.ko} (준비 중)</span>}
                        <span style={{ color: 'var(--ink-mute)' }}>{o.what}</span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </section>

          <section>
            <H2>데이터</H2>
            <dl className="text-xs space-y-3">
              {ind.main.concat(ind.subs).map(k => cat.series[k]).filter(Boolean).map(s => (
                <div key={s.key} className="pb-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="font-semibold" style={{ color: 'var(--ink)' }}>{s.label}</div>
                  <Row k="Series" v={<a href={s.url} target="_blank" rel="noreferrer" className="underline mono">{s.key}</a>} />
                  <Row k="단위" v={s.units} />
                  <Row k="주기" v={freqNote(s)} />
                  <Row k="기간" v={`${s.first?.slice(0, 7)} ~ ${s.rawLast}`} />
                  {s.updated && <Row k="원천 갱신" v={s.updated.slice(0, 16)} />}
                  <Row k="수집" v={s.fetchedAt.slice(0, 10)} />
                  {s.partialLast && <Row k="" v="마지막 달은 진행 중(부분 집계)" />}
                  {s.note && <p className="mt-1 text-[11px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>{s.note}</p>}
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>

      <Picker cat={cat} open={picker} onClose={() => setPicker(false)} exclude={keys}
        onPick={k => setLayers(ls => [...ls, newLayer(k, cat.series[k])])} />
    </div>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-bold mb-2 pb-1" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--hairline-2)' }}>{children}</h2>
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2 mt-0.5">
      <dt className="w-16 shrink-0" style={{ color: 'var(--ink-mute)' }}>{k}</dt>
      <dd style={{ color: 'var(--ink-2)' }}>{v}</dd>
    </div>
  )
}

