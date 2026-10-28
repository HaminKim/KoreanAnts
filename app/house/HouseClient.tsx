'use client'

// 한국 부동산 — 지역 지도(전국 → 시군구 → 구, 마우스 올리면 정보, 클릭하면 상세) + 전국 사이클 차트.
// 지역 상세는 84㎡ 환산 집값(금액)과 그 흐름이 먼저, 변화율·대출 지표는 그 뒤.
// API 키가 아직 없는 지표는 마우스를 올리거나 누르면 키 받는 방법을 안내한다.

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type ApiId, type HouseCatalog, type HouseIndicator, type LocalGeo, type LocalGeoUnit, type LocalIndex, type LocalUnit, type MapGeo, type RegionMetric, type Regions,
  fillOf, fmtRegion, fmtWon, fmtYm, loadHouseCatalog, loadHouseSeries, loadLocalIndex, loadMap, loadRegions, priceStatus, textOn,
} from '@/app/lib/house'
import { type Layer, fmtNum, fmtPeriod, tfLabel } from '@/app/lib/macro'
import MacroChart, { type ChartLayer, type MacroChartHandle, type ShadeBand } from '@/app/components/macro/MacroChart'
import { Chip, Label, LayerLegend, PERIODS, Sparkline, newLayer, useIsMobile, useSeriesMap } from '@/app/components/macro/ui'
import { LocalMap, LocalTip, PriceBlock, StatusBadge, childrenOf, localMetrics, localVal, p84Metric, unitData, useLocalFile } from './local'

const DEFAULT_LAYERS = ['KR_HPI_REAL', 'KR_HHCREDIT_GDP', 'KR_CALL']

export default function HouseClient() {
  const [cat, setCat] = useState<HouseCatalog | null>(null)
  const [regions, setRegions] = useState<Regions | null>(null)
  const [geo, setGeo] = useState<MapGeo | null>(null)
  const [err, setErr] = useState(false)
  const [guide, setGuide] = useState<ApiId | null>(null)
  // 시군구 집값 요약 — 없어도 기존 지도는 그대로 (undefined = 아직 받는 중)
  const [lidx, setLidx] = useState<LocalIndex | null | undefined>(undefined)

  useEffect(() => {
    loadHouseCatalog().then(setCat).catch(() => setErr(true))
    loadRegions().then(setRegions).catch(() => setErr(true))
    loadMap().then(setGeo).catch(() => setErr(true))
    loadLocalIndex().then(setLidx).catch(() => setLidx(null))
  }, [])

  // 전국 지도 맨 앞에 '집값(84㎡)' 칩을 끼워 넣음
  const merged = useMemo<Regions | null>(() => {
    if (!regions || !lidx) return regions
    const out: Regions['regions'] = {}
    for (const [id, r] of Object.entries(regions.regions)) {
      const s = lidx.regions[id]
      out[id] = s?.p84 !== undefined
        ? { ...r, values: { ...r.values, p84: { v: s.p84, date: s.date ?? lidx.asOf, prev12: s.p84y ?? null } } }
        : r
    }
    return { ...regions, metrics: [p84Metric(lidx.asOf), ...regions.metrics], regions: out }
  }, [regions, lidx])

  return (
    <div className="pt-2 pb-16">
      <Link href="/explore" className="text-xs" style={{ color: 'var(--ink-mute)' }}>← 분석 선택</Link>
      <h1 className="mt-2 text-2xl font-bold" style={{ color: 'var(--ink)' }}>한국 부동산</h1>
      <p className="mt-1 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--ink-mute)' }}>
        집값, 가계 빚, 대출 환경, 부실 신호를 같이 봅니다. 어느 지역에 빚이 몰리고, 대출이 막히거나 풀릴 때 집값이 어떤 순서로 움직였는지 확인하는 도구예요.
      </p>

      {cat && <KeyStatus cat={cat} onGuide={setGuide} />}
      {cat && guide && <GuidePanel cat={cat} api={guide} onClose={() => setGuide(null)} />}

      {!cat && !err && <div className="mt-10 text-center text-sm py-20" style={{ color: 'var(--ink-mute)' }}>불러오는 중…</div>}
      {err && !cat && <div className="mt-10 text-center text-sm py-20" style={{ color: 'var(--ink-mute)' }}>데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>}

      {cat && merged && geo && lidx !== undefined && <MapSection cat={cat} regions={merged} geo={geo} lidx={lidx} onGuide={setGuide} />}
      {cat && <NationalSection cat={cat} onGuide={setGuide} />}

      {cat && (
        <p className="mt-10 text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
          출처: 한국은행 ECOS(한국부동산원·KB·국토교통부 원자료 포함), 한국부동산원 R-ONE(시군구 집값·전세가율·거래량), BIS·OECD(FRED),
          지도 통계청 행정구역경계(2013) · 시군구 경계 vuski/admdongkor(MIT).
          84㎡ 집값은 ㎡당 평균 매매가격 × 84로 환산한 값이라 실제 단지 시세와 다를 수 있어요.
          지역별 대출은 금융기관 소재지 기준이라 담보 주택 소재지와 다를 수 있어요. 데이터 갱신 {cat.generatedAt.slice(0, 10)}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// API 키 상태 + 안내
// ─────────────────────────────────────────
function KeyStatus({ cat, onGuide }: { cat: HouseCatalog; onGuide: (a: ApiId) => void }) {
  const ids = Object.keys(cat.apis) as ApiId[]
  if (ids.every(a => cat.keys[a])) return null
  return (
    <div className="mt-4 flex items-center gap-2 flex-wrap px-3 py-2 text-[11px]"
      style={{ border: '1px solid var(--hairline)', background: 'var(--plane)' }}>
      <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>데이터 연결</span>
      {ids.map(a => (
        <span key={a} className="inline-flex items-center gap-1">
          <NeedKey cat={cat} api={a} onGuide={onGuide}>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 cursor-pointer"
              style={{ border: '1px solid var(--btn-border)', color: cat.keys[a] ? 'var(--up-text)' : 'var(--ink-2)' }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: cat.keys[a] ? 'var(--up-text)' : 'var(--down-text)' }} />
              {cat.apis[a].name} {cat.keys[a] ? '연결됨' : '· 키 필요'}
            </span>
          </NeedKey>
          {!cat.keys[a] && (
            <a href={cat.apis[a].url} target="_blank" rel="noopener noreferrer"
              className="font-semibold underline underline-offset-2" style={{ color: 'var(--accent)' }}>
              발급 ↗
            </a>
          )}
        </span>
      ))}
      <span style={{ color: 'var(--ink-mute)' }}>흐린 항목은 API 키를 받으면 자동으로 채워져요</span>
    </div>
  )
}

/** 마우스를 올리면 키 받는 방법 미리보기, 누르면 안내 패널 */
function NeedKey({ cat, api, onGuide, children, block = false }: {
  cat: HouseCatalog; api: ApiId; onGuide: (a: ApiId) => void; children: React.ReactNode; block?: boolean
}) {
  const info = cat.apis[api]
  if (cat.keys[api]) return <>{children}</>
  return (
    <span className={`relative group ${block ? 'block h-full' : 'inline-block'}`}
      onClick={e => { e.preventDefault(); e.stopPropagation(); onGuide(api) }}>
      {children}
      <span role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 w-64 p-2.5 text-[11px] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: 'var(--surface)', border: '1px solid var(--ink)', color: 'var(--ink-2)', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
        <b style={{ color: 'var(--ink)' }}>{info.name} API 키가 필요해요</b>
        <span className="block mt-1">{info.unlocks}</span>
        <span className="block mt-1.5" style={{ color: 'var(--ink-mute)' }}>누르면 키 받는 방법을 볼 수 있어요</span>
      </span>
    </span>
  )
}

const SECRETS_URL = 'https://github.com/HaminKim/KoreanAnts/settings/secrets/actions'

function GuidePanel({ cat, api, onClose }: { cat: HouseCatalog; api: ApiId; onClose: () => void }) {
  const info = cat.apis[api]
  return (
    <div className="mt-3 p-4 text-xs leading-relaxed" style={{ border: '1px solid var(--ink)', background: 'var(--surface)' }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{info.name} API 키 받기</div>
          <div className="mt-0.5" style={{ color: 'var(--ink-mute)' }}>무료 · 받으면 채워지는 데이터: {info.unlocks}</div>
        </div>
        <button type="button" onClick={onClose} className="px-1 text-sm" style={{ color: 'var(--ink-mute)' }} aria-label="닫기">✕</button>
      </div>
      <ol className="mt-3 space-y-1 list-decimal pl-4" style={{ color: 'var(--ink-2)' }}>
        {info.steps.map(s => <li key={s}>{s}</li>)}
      </ol>
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <a href={info.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 font-bold"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          발급 페이지 열기 →
        </a>
        <a href={SECRETS_URL} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 font-bold"
          style={{ border: '1px solid var(--ink)', color: 'var(--ink)' }}>
          GitHub Secrets 등록 →
        </a>
        <span style={{ color: 'var(--ink-mute)' }}>
          시크릿 이름 <code className="mono px-1" style={{ background: 'var(--plane)', color: 'var(--ink)' }}>{info.env}</code> · 등록 후 다음 자동 갱신(하루 2번) 때 반영돼요
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────
// 지도 — 전국(17개 시도) → 시군구 → 구 드릴다운
// 누르면 오른쪽에 상세, 더블클릭(또는 상세의 버튼)으로 확대
// ─────────────────────────────────────────
type View = { nid: string; fid: string; parent: string | null } | null   // null = 전국
const SEJONG_UID = '36110'

function MapSection({ cat, regions, geo, lidx, onGuide }: {
  cat: HouseCatalog; regions: Regions; geo: MapGeo; lidx: LocalIndex | null; onGuide: (a: ApiId) => void
}) {
  const [view, setView] = useState<View>(null)
  const [mid, setMid] = useState(regions.metrics[0]?.id)
  const [lmid, setLmid] = useState('p84')
  const [hover, setHover] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const mobile = useIsMobile()

  const metric = regions.metrics.find(m => m.id === mid) ?? regions.metrics[0]
  const ids = Object.keys(regions.regions).filter(id => geo.regions[id])   // 레지스트리 순서 (서울 → 제주)
  const vals = useMemo(
    () => ids.map(id => regions.regions[id]?.values[metric.id]?.v).filter((v): v is number => v !== null && v !== undefined),
    [ids, regions, metric],
  )
  const focus = selected ?? hover

  const local = useLocalFile(view?.fid ?? null)
  const lms = useMemo(() => localMetrics(local.data?.asOf ?? null), [local.data])
  const lmetric = lms.find(m => m.id === lmid) ?? lms[0]

  const zoomable = (nid: string) => !!lidx?.files[nid]
  const go = (v: View) => { setView(v); setSelected(null); setHover(null); setPos(null) }
  const zoomNation = (nid: string) => {
    const f = lidx?.files[nid]
    if (!f) return
    // 광주는 통합 파일(전남광주) 안의 광주 단위로, 세종은 시군구가 하나뿐이라 바로 생활권으로
    const parent = nid === 'sejong' ? SEJONG_UID : f.unit === 'root' || f.unit === 'jeonnam' ? null : f.unit
    go({ nid, fid: f.file, parent })
  }
  const zoomLocal = (uid: string) => view && go({ ...view, parent: uid })

  const onMove = (e: React.MouseEvent) => {
    const r = boxRef.current?.getBoundingClientRect()
    if (r) setPos({ x: Math.min(e.clientX - r.left + 14, r.width - 230), y: e.clientY - r.top + 14 })
  }

  const lgeo = local.geo, ldata = local.data
  const area = view && lgeo && ldata ? ldata.units[view.parent ?? 'root'] : undefined
  const areaName = view ? (view.parent && lgeo ? lgeo.units[view.parent]?.name : lgeo?.ko ?? regions.regions[view.nid]?.ko) : null
  const areaSt = area ? priceStatus(area.sum) : null
  const lids = view && lgeo
    ? Object.keys(lgeo.units).filter(k => (view.parent ? lgeo.units[k].parent === view.parent : lgeo.units[k].level === 2) && lgeo.units[k].d)
    : []
  const unitName = (uid: string) => {
    const u = lgeo?.units[uid]
    if (!u) return ''
    return u.parent && lgeo?.units[u.parent] ? `${lgeo.units[u.parent].name} ${u.name}` : u.name
  }

  return (
    <section className="mt-8">
      <SectionHead title="지역별 지도"
        desc={mobile ? '누르면 그 지역 집값 흐름이, 상세의 버튼으로 시군구·구까지 들어가요' : '누르면 그 지역 집값 흐름이, 더블클릭하면 시군구 → 구 지도로 들어가요'} />

      {/* 지표 칩 */}
      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        {view ? lms.map(m => (
          <span key={m.id}><Chip on={m.id === lmetric.id} onClick={() => setLmid(m.id)} title={m.desc}>{m.short}</Chip></span>
        )) : regions.metrics.map(m => {
          const chip = (
            <Chip on={m.id === metric.id} onClick={() => setMid(m.id)} title={m.available ? m.desc : undefined}>
              {m.short}{!m.available && <span className="ml-1 opacity-70">· 키 필요</span>}
            </Chip>
          )
          return m.available ? <span key={m.id}>{chip}</span> : (
            <span key={m.id} onClickCapture={() => setMid(m.id)}>
              <NeedKey cat={cat} api={m.need} onGuide={onGuide}>{chip}</NeedKey>
            </span>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] leading-relaxed max-w-2xl" style={{ color: 'var(--ink-mute)' }}>
        {view
          ? <>{lmetric.desc}{lmetric.asOf && <> · 기준 {fmtYm(lmetric.asOf)}</>}</>
          : <>{metric.desc}{metric.asOf && <> · 기준 {fmtYm(metric.asOf)}</>}</>}
      </p>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4">
        {/* 지도 */}
        <div ref={boxRef} className="relative self-start" onMouseMove={onMove} onMouseLeave={() => { setHover(null); setPos(null) }}
          style={{ border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
          {/* 위치 (브레드크럼) + 지금 보고 있는 지역 요약 */}
          <div className="flex items-center justify-between gap-2 flex-wrap px-3 py-2 text-[11px]" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <nav className="flex items-center gap-1 flex-wrap" aria-label="지역 위치">
              <Crumb on={!view} onClick={() => go(null)}>전국</Crumb>
              {view && <>
                <span style={{ color: 'var(--ink-mute)' }}>›</span>
                <Crumb on={!view.parent} onClick={() => go({ ...view, parent: null })}>{lgeo?.ko ?? regions.regions[view.nid]?.ko}</Crumb>
              </>}
              {view?.parent && lgeo?.units[view.parent] && <>
                <span style={{ color: 'var(--ink-mute)' }}>›</span>
                <Crumb on>{lgeo.units[view.parent].name}</Crumb>
              </>}
            </nav>
            {view && area?.sum.p84 !== undefined && (
              <span className="flex items-center gap-1.5">
                <span style={{ color: 'var(--ink-mute)' }}>{areaName} 84㎡</span>
                <b className="mono" style={{ color: 'var(--ink)' }}>{fmtWon(area.sum.p84)}</b>
                {areaSt && <StatusBadge tone={areaSt.tone} label={areaSt.label} small />}
              </span>
            )}
            {!view && <span style={{ color: 'var(--ink-mute)' }}>{mobile ? '지역을 누르세요' : '더블클릭 = 확대'}</span>}
          </div>

          {!view ? (
            <svg viewBox={geo.viewBox.join(' ')} className="block w-full h-auto select-none" role="img" aria-label="대한민국 시도 지도">
              {ids.map(id => {
                const r = regions.regions[id]
                const v = r?.values[metric.id]?.v
                const fill = metric.available ? fillOf(metric, v, vals) : 'var(--neu)'
                const on = focus === id
                return (
                  <path key={id} d={geo.regions[id].d} fill={fill}
                    stroke={on ? 'var(--ink)' : 'var(--surface)'} strokeWidth={on ? 1.6 : 0.7} strokeLinejoin="round"
                    style={{ cursor: 'pointer', transition: 'fill .2s' }}
                    onMouseEnter={() => setHover(id)}
                    onClick={() => {
                      setSelected(id)
                      if (!metric.available) onGuide(metric.need)
                    }}
                    onDoubleClick={() => zoomNation(id)} />
                )
              })}
              {/* 선택 지역 테두리를 맨 위에 다시 그림 */}
              {focus && geo.regions[focus] && (
                <path d={geo.regions[focus].d} fill="none" stroke="var(--ink)" strokeWidth={1.8} pointerEvents="none" />
              )}
              {ids.map(id => {
                const r = regions.regions[id]
                const [x, y] = geo.regions[id].label
                const v = r?.values[metric.id]?.v
                const fill = metric.available ? fillOf(metric, v, vals) : 'var(--neu)'
                const small = id === 'sejong'
                return (
                  <g key={id} pointerEvents="none" transform={`translate(${x},${y})`}>
                    <text textAnchor="middle" fontSize={small ? 9 : 11} fontWeight={700} fill={textOn(fill)}>{r?.ko}</text>
                    {metric.available && v !== undefined && v !== null && !small && (
                      <text y={12} textAnchor="middle" fontSize={9.5} className="mono" fill={textOn(fill)}>{fmtRegion(metric, v)}</text>
                    )}
                  </g>
                )
              })}
            </svg>
          ) : lgeo && ldata ? (
            <LocalMap geo={lgeo} data={ldata} parent={view.parent} metric={lmetric} focus={focus}
              onHover={setHover} onPick={setSelected} onZoom={zoomLocal} />
          ) : (
            <div className="h-[360px] flex flex-col items-center justify-center gap-3 text-[11px]" style={{ color: 'var(--ink-mute)' }}>
              {local.err ? <>
                <span>시군구 지도를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</span>
                <button type="button" onClick={() => go(null)} className="underline">전국 지도로 돌아가기</button>
              </> : '시군구 지도 불러오는 중…'}
            </div>
          )}

          {!view && !metric.available && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <button type="button" onClick={() => onGuide(metric.need)} className="px-3 py-1.5 text-[11px] font-bold"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                {cat.apis[metric.need].name} API 키를 받으면 색이 채워져요 →
              </button>
            </div>
          )}

          {/* 마우스오버 툴팁 (데스크톱) */}
          {!mobile && hover && pos && (!view
            ? <RegionTip regions={regions} id={hover} metric={metric} cat={cat} style={{ left: pos.x, top: pos.y }} />
            : lgeo && ldata && lgeo.units[hover] && (
              <LocalTip name={unitName(hover)} unit={unitData(lgeo, ldata, hover)} metrics={lms} metric={lmetric}
                area={lgeo.units[hover].kind === 'area' && !ldata.units[hover]}
                style={{ left: pos.x, top: pos.y }} />
            ))}
        </div>

        {/* 오른쪽: 선택 지역 상세 또는 순위 */}
        <div style={{ border: '1px solid var(--hairline)', background: 'var(--surface)' }} className="p-3 self-start">
          {!view ? (
            selected
              ? <RegionDetail regions={regions} id={selected} metric={metric} cat={cat} lidx={lidx} onGuide={onGuide}
                  onClose={() => setSelected(null)} onZoom={zoomable(selected) ? () => zoomNation(selected) : undefined} />
              : <Ranking regions={regions} metric={metric} ids={ids} onPick={setSelected} cat={cat} onGuide={onGuide} />
          ) : !lgeo || !ldata ? (
            <div className="py-10 text-center text-[11px]" style={{ color: 'var(--ink-mute)' }}>{local.err ? '–' : '불러오는 중…'}</div>
          ) : selected && lgeo.units[selected] ? (
            <UnitDetail name={unitName(selected)} sido={lgeo.ko} geo={lgeo.units[selected]} unit={unitData(lgeo, ldata, selected)} sqm={ldata.sqm}
              onClose={() => setSelected(null)}
              zoomLabel={childLabel(lgeo, selected)}
              onZoom={!view.parent && childrenOf(lgeo, selected).length ? () => zoomLocal(selected) : undefined} />
          ) : (
            <RankList title={`${areaName} ${lmetric.label} 순위`} sub={`기준 ${fmtYm(lmetric.id === 'vol' ? area?.sum.volDate ?? lmetric.asOf : lmetric.asOf)} · 지역을 누르면 집값 흐름이 보여요`}
              metric={lmetric} onPick={setSelected}
              rows={lids.map(k => ({ id: k, name: lgeo.units[k].name, v: localVal(unitData(lgeo, ldata, k)?.sum, lmetric.id), emds: lgeo.units[k].emds }))} />
          )}
        </div>
      </div>
    </section>
  )
}

/** 하위 단위 이름: 일반구면 '구', 행정동을 묶은 단위면 '생활권' */
function childLabel(geo: LocalGeo, uid: string) {
  return childrenOf(geo, uid).some(k => geo.units[k].kind === 'area') ? '생활권' : '구'
}

function Crumb({ on, onClick, children }: { on: boolean; onClick?: () => void; children: React.ReactNode }) {
  return on
    ? <span className="font-bold" style={{ color: 'var(--ink)' }}>{children}</span>
    : <button type="button" onClick={onClick} className="font-semibold underline underline-offset-2" style={{ color: 'var(--accent)' }}>{children}</button>
}

function RegionTip({ regions, id, metric, cat, style }: {
  regions: Regions; id: string; metric: RegionMetric; cat: HouseCatalog; style: React.CSSProperties
}) {
  const r = regions.regions[id]
  if (!r) return null
  return (
    <div className="pointer-events-none absolute z-20 w-[220px] p-2.5 text-[11px]"
      style={{ ...style, background: 'var(--surface)', border: '1px solid var(--ink)', boxShadow: '0 4px 14px rgba(0,0,0,.12)' }}>
      <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{r.name}</div>
      <table className="mt-1.5 w-full">
        <tbody>
          {regions.metrics.map(m => {
            const v = r.values[m.id]
            return (
              <tr key={m.id} style={{ color: m.id === metric.id ? 'var(--ink)' : 'var(--ink-2)', fontWeight: m.id === metric.id ? 700 : 400 }}>
                <td className="py-0.5 pr-2">{m.short}</td>
                <td className="py-0.5 text-right mono">
                  {v ? fmtRegion(m, v.v) : <span style={{ color: 'var(--ink-mute)' }}>{m.available ? '–' : '키 필요'}</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {!metric.available && (
        <div className="mt-1.5 pt-1.5" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-mute)' }}>
          {cat.apis[metric.need].name} API 키를 받으면 표시돼요. 지역을 누르면 방법을 볼 수 있어요
        </div>
      )}
      {r.note && <div className="mt-1.5" style={{ color: 'var(--ink-mute)' }}>{r.note}</div>}
    </div>
  )
}

function Ranking({ regions, metric, ids, onPick, cat, onGuide }: {
  regions: Regions; metric: RegionMetric; ids: string[]; onPick: (id: string) => void; cat: HouseCatalog; onGuide: (a: ApiId) => void
}) {
  if (!metric.available) {
    return (
      <div className="h-full flex flex-col">
        <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{metric.label} 순위</div>
        <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
          이 지표는 {cat.apis[metric.need].name} API 키가 필요해요. 키를 받으면 17개 시도 순위와 지역별 흐름이 여기에 표시돼요.
        </div>
        <ul className="mt-3 grid grid-cols-2 gap-x-3 text-[11px]" style={{ color: 'var(--ink-mute)' }}>
          {ids.map(id => (
            <li key={id} className="py-1 cursor-pointer flex justify-between" style={{ borderBottom: '1px solid var(--hairline)' }}
              onClick={() => onPick(id)}>
              <span>{regions.regions[id]?.ko}</span><span className="mono">–</span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => onGuide(metric.need)} className="mt-4 self-start px-3 py-1.5 text-[11px] font-bold"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          API 키 받는 방법 →
        </button>
      </div>
    )
  }
  return (
    <RankList title={`${metric.label} 순위`} sub={`기준 ${fmtYm(metric.asOf)} · 지역을 누르면 흐름이 보여요`} metric={metric} onPick={onPick}
      rows={ids.map(id => ({ id, name: regions.regions[id]?.ko ?? id, v: regions.regions[id]?.values[metric.id]?.v ?? null }))} />
  )
}

function RankList({ title, sub, rows, metric, onPick }: {
  title: string; sub: string; rows: { id: string; name: string; v: number | null; emds?: string[] }[]; metric: RegionMetric; onPick: (id: string) => void
}) {
  const sorted = [...rows].sort((a, b) => (b.v ?? -Infinity) - (a.v ?? -Infinity))
  const vals = sorted.map(r => r.v).filter((v): v is number => v !== null)
  // 생활권처럼 아직 값이 하나도 없으면 순위 대신 어떤 동이 묶였는지 보여 줌
  if (!vals.length && rows.some(r => r.emds)) {
    return (
      <div>
        <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{title.replace(/ 순위$/, '')} · 생활권</div>
        <div className="text-[10px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
          생활권 집값은 국토부 실거래가를 연결하면 채워져요. 지금은 어떤 동이 묶였는지만 보여요
        </div>
        <ul className="mt-2">
          {rows.map(x => (
            <li key={x.id} onClick={() => onPick(x.id)} className="py-1.5 cursor-pointer text-[11px]" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{x.name}</span>
              {x.emds && <span className="block text-[10px]" style={{ color: 'var(--ink-mute)' }}>{x.emds.join(', ')}</span>}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  const max = Math.max(...vals.map(Math.abs), 1e-9)
  const wide = Math.max(...rows.map(r => r.name.length)) > 3
  return (
    <div>
      <div className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{title}</div>
      <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{sub}</div>
      <ul className="mt-2 max-h-[560px] overflow-y-auto">
        {sorted.map((x, i) => (
          <li key={x.id} onClick={() => onPick(x.id)} className="flex items-center gap-2 py-[3px] cursor-pointer text-[11px]">
            <span className="mono w-4 text-right shrink-0" style={{ color: 'var(--ink-mute)' }}>{i + 1}</span>
            <span className={`${wide ? 'w-16' : 'w-8'} shrink-0 font-semibold truncate`} style={{ color: 'var(--ink)' }}>{x.name}</span>
            <span className="flex-1 h-2.5 relative" style={{ background: 'var(--plane)' }}>
              {x.v !== null && (
                <span className="absolute inset-y-0 left-0"
                  style={{ width: `${(Math.abs(x.v) / max) * 100}%`, background: fillOf(metric, x.v, vals) }} />
              )}
            </span>
            <span className="mono w-16 text-right shrink-0" style={{ color: x.v === null ? 'var(--ink-mute)' : 'var(--ink)' }}>{fmtRegion(metric, x.v)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 전국 지도에서 고른 시도: 집값(84㎡) → 흐름 → 변화율 … 그 아래 대출·부실 지표 */
function RegionDetail({ regions, id, metric, cat, lidx, onGuide, onClose, onZoom }: {
  regions: Regions; id: string; metric: RegionMetric; cat: HouseCatalog; lidx: LocalIndex | null
  onGuide: (a: ApiId) => void; onClose: () => void; onZoom?: () => void
}) {
  const r = regions.regions[id]
  const f = lidx?.files[id]
  const local = useLocalFile(f?.file ?? null)
  if (!r) return null
  const ecos = regions.metrics.filter(m => m.id !== 'p84')
  const showHist = metric.id !== 'p84'
  const hist = showHist ? (r.hist[metric.id] ?? []).filter((p): p is [string, number] => p[1] !== null) : []
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{r.name}</div>
          {r.note && <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{r.note}</div>}
        </div>
        <button type="button" onClick={onClose} className="text-[11px] px-1 shrink-0" style={{ color: 'var(--ink-mute)' }}>순위 보기 ✕</button>
      </div>

      {f && (
        <div className="mt-3">
          <PriceBlock sum={lidx?.regions[id]} unit={local.data?.units[f.unit]} sqm={lidx?.sqm ?? 84} loading={!local.data && !local.err} />
          {onZoom && (
            <button type="button" onClick={onZoom} className="mt-3 w-full px-3 py-1.5 text-[11px] font-bold"
              style={{ background: 'var(--accent)', color: '#fff' }}>
              {r.ko} 시군구 지도로 보기 →
            </button>
          )}
        </div>
      )}

      <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
        <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>실거래·대출·부실 (한국은행)</div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {ecos.map(m => {
            const v = r.values[m.id]
            const box = (
              <div className="p-2 h-full" style={{ border: `1px solid ${m.id === metric.id ? 'var(--ink)' : 'var(--hairline)'}`, opacity: v ? 1 : 0.55 }}>
                <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{m.short}</div>
                <div className="mono text-sm font-bold" style={{ color: 'var(--ink)' }}>{v ? fmtRegion(m, v.v) : '–'}</div>
                <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>
                  {v ? <>{fmtYm(v.date)}{v.prev12 !== null && <> · 1년 전 {fmtRegion(m, v.prev12)}</>}</> : (m.available ? '데이터 없음' : '키 필요')}
                </div>
              </div>
            )
            return v || m.available ? <div key={m.id}>{box}</div>
              : <NeedKey key={m.id} cat={cat} api={m.need} onGuide={onGuide} block>{box}</NeedKey>
          })}
        </div>

        {showHist && (
          <div className="mt-3">
            <div className="text-[11px] font-semibold" style={{ color: 'var(--ink-2)' }}>{metric.label} · 최근 흐름</div>
            {hist.length > 1 ? (
              <div className="mt-1">
                <Sparkline data={hist} height={70} zeroLine={metric.unit === '%' && metric.id !== 'delinq'} />
                <div className="flex justify-between text-[10px] mono" style={{ color: 'var(--ink-mute)' }}>
                  <span>{fmtYm(hist[0][0])}</span><span>{fmtYm(hist[hist.length - 1][0])}</span>
                </div>
              </div>
            ) : (
              <div className="mt-1 h-[70px] flex items-center justify-center text-[11px]" style={{ background: 'var(--plane)', color: 'var(--ink-mute)' }}>
                {metric.available ? '데이터 없음' : <button type="button" onClick={() => onGuide(metric.need)} className="underline">{cat.apis[metric.need].name} API 키가 필요해요</button>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 시군구·구 상세 */
function UnitDetail({ name, sido, geo, unit, sqm, zoomLabel, onClose, onZoom }: {
  name: string; sido: string; geo: LocalGeoUnit; unit: LocalUnit | undefined; sqm: number; zoomLabel: string
  onClose: () => void; onZoom?: () => void
}) {
  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{name}</div>
          <div className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>
            {sido}{geo.kind === 'area' && geo.emds && <> · 생활권: {geo.emds.join(', ')}</>}
          </div>
        </div>
        <button type="button" onClick={onClose} className="text-[11px] px-1 shrink-0" style={{ color: 'var(--ink-mute)' }}>순위 보기 ✕</button>
      </div>
      <div className="mt-3">
        {unit
          ? <PriceBlock sum={undefined} unit={unit} sqm={sqm} />
          : <div className="text-[11px] leading-relaxed" style={{ color: 'var(--ink-mute)' }}>
              {geo.kind === 'area'
                ? '생활권 집값은 국토부 실거래가를 연결하면 채워져요. 지금은 시 전체 집값을 위쪽에서 볼 수 있어요.'
                : '부동산원 통계에 따로 나오지 않는 지역이에요.'}
            </div>}
      </div>
      {onZoom && (
        <button type="button" onClick={onZoom} className="mt-3 w-full px-3 py-1.5 text-[11px] font-bold"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {name} {zoomLabel}별로 보기 →
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────
// 전국 사이클
// ─────────────────────────────────────────
function NationalSection({ cat, onGuide }: { cat: HouseCatalog; onGuide: (a: ApiId) => void }) {
  const chartRef = useRef<MacroChartHandle>(null)
  const mobile = useIsMobile()
  const [years, setYears] = useState<number | null>(null)
  const [ev, setEv] = useState(true)
  const [layers, setLayers] = useState<Layer[]>(
    () => DEFAULT_LAYERS.filter(k => cat.series[k]).map(k => newLayer(k, cat.series[k])),
  )
  const keys = layers.map(l => l.key)
  const { map, errors } = useSeriesMap(keys, loadHouseSeries)
  const chartLayers: ChartLayer[] = layers.map((l, i) => ({ ...l, id: `${l.key}-${i}`, series: map[l.key] })).filter(l => l.series)
  const bands: ShadeBand[] = ev ? cat.events.map(e => ({ kind: 'ev', from: e.from, to: e.to, label: e.name, note: e.note })) : []

  const toggle = (k: string) => setLayers(ls => {
    if (ls.some(l => l.key === k)) return ls.length > 1 ? ls.filter(l => l.key !== k) : ls
    return [...ls, newLayer(k, cat.series[k])]
  })
  const update = (i: number, p: Partial<Layer>) => setLayers(ls => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))

  return (
    <section className="mt-12">
      <SectionHead title="전국 사이클" desc="카드를 누르면 아래 차트에 겹쳐 볼 수 있어요. 같은 시간축에 세로로 나열돼요" />

      {cat.groups.map(g => {
        const items = cat.indicators.filter(i => i.group === g.id)
        if (!items.length) return null
        return (
          <div key={g.id} className="mt-4">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold" style={{ color: 'var(--ink)' }}>{g.name}</span>
              <span className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{g.desc}</span>
            </div>
            <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {items.map(ind => <NationalCard key={ind.id} ind={ind} cat={cat} on={keys.includes(ind.main[0])} onToggle={toggle} onGuide={onGuide} />)}
            </div>
          </div>
        )
      })}

      <div className="mt-5 flex items-center gap-1.5 flex-wrap">
        <Label>기간</Label>
        {PERIODS.map(p => (
          <Chip key={p.label} on={years === p.years} onClick={() => { setYears(p.years); chartRef.current?.setYears(p.years) }}>{p.label}</Chip>
        ))}
        <span className="mx-1" />
        <Chip on={ev} onClick={() => setEv(!ev)} title="외환위기·금융위기·주요 대출 규제 시점">
          <span className="inline-block w-2 h-2 mr-1 align-middle" style={{ background: 'var(--down-text)', opacity: 0.6 }} />위기·정책
        </Chip>
      </div>

      <div className="mt-2" style={{ border: '1px solid var(--hairline)', background: 'var(--surface)' }}>
        {chartLayers.length === layers.length && chartLayers.length ? (
          <MacroChart
            ref={chartRef} mode="stack" layers={chartLayers} initialYears={years} bands={bands}
            paneHeight={mobile ? 150 : 170}
            renderLegend={(l, i, color, hover) => (
              <LayerLegend layer={l} color={color} hover={hover}
                onTf={tf => update(i, { tf })}
                onShift={n => update(i, { shift: n })}
                onRemove={layers.length > 1 ? () => setLayers(ls => ls.filter((_, j) => j !== i)) : undefined}
                compact />
            )}
          />
        ) : (
          <div className="h-[420px] flex items-center justify-center text-sm" style={{ color: 'var(--ink-mute)' }}>
            {keys.some(k => errors[k]) ? '데이터를 불러오지 못했습니다' : '차트 불러오는 중…'}
          </div>
        )}
      </div>
    </section>
  )
}

function NationalCard({ ind, cat, on, onToggle, onGuide }: {
  ind: HouseIndicator; cat: HouseCatalog; on: boolean; onToggle: (k: string) => void; onGuide: (a: ApiId) => void
}) {
  const s = cat.series[ind.main[0]]
  const live = ind.status === 'live' && s
  const body = (
    <div className="h-full flex flex-col p-3 transition-colors"
      style={{
        border: `1px solid ${on ? 'var(--ink)' : 'var(--hairline-2)'}`,
        background: 'var(--surface)', opacity: live ? 1 : 0.5,
        boxShadow: on ? 'inset 0 -3px 0 var(--accent)' : undefined,
      }}
      title={live ? ind.what : undefined}>
      <div className="flex items-start justify-between gap-1">
        <div className="text-[13px] font-bold leading-snug" style={{ color: 'var(--ink)' }}>{ind.ko}</div>
        {on && <span className="text-[9px] font-bold px-1" style={{ background: 'var(--accent)', color: '#fff' }}>차트</span>}
      </div>
      {live ? (
        <>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="mono text-sm font-bold" style={{ color: 'var(--ink)' }}>{fmtNum(s.latest.value, s, s.latest.tf)}</span>
            <span className="text-[10px]" style={{ color: 'var(--ink-mute)' }}>{tfLabel(s.latest.tf, s.obsFreq)} · {fmtPeriod(s.latest.date, s.obsFreq)}</span>
          </div>
          <div className="mt-auto pt-2"><Sparkline data={s.spark} height={34} zeroLine={s.latest.tf !== 'level'} /></div>
        </>
      ) : (
        <>
          <p className="mt-1 text-[10px] leading-snug line-clamp-3" style={{ color: 'var(--ink-mute)' }}>{ind.what}</p>
          <div className="mt-auto pt-2 text-[10px] font-semibold" style={{ color: 'var(--ink-2)' }}>
            {ind.need ? `${cat.apis[ind.need].name} 키 필요` : '데이터 갱신 중'}
          </div>
        </>
      )}
    </div>
  )
  if (live) return <button type="button" className="text-left block hover:opacity-90" onClick={() => onToggle(ind.main[0])}>{body}</button>
  if (ind.need) return <NeedKey cat={cat} api={ind.need} onGuide={onGuide} block>{body}</NeedKey>
  return <div>{body}</div>
}

function SectionHead({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-2 pb-2 flex-wrap" style={{ borderBottom: '1px solid var(--ink)' }}>
      <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
      <span className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>{desc}</span>
    </div>
  )
}
