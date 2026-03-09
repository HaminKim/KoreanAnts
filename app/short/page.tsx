import { readFile } from 'fs/promises'
import path from 'path'
import ShortTrackerClient from './ShortTrackerClient'
import type { SlimNetBuyData, SlimWlMap, SlimWlEntry } from './ShortTrackerClient'

export const metadata = {
  title: '숏 후보 스크리너 | REANT',
  description: '서학개미 순매수 TOP30 기반 리버스 개미 전략 숏 스크리너',
}

// ISR: 1시간마다 재생성 (Yahoo Finance 기본 데이터 캐시)
export const revalidate = 3600

async function readJson(rel: string) {
  const full = path.join(process.cwd(), 'public', rel)
  return JSON.parse(await readFile(full, 'utf-8'))
}

// ── 워치리스트 미등록 종목: Yahoo Finance에서 기본 기술 점수 계산 ──────────

async function fetchBasicTech(ticker: string): Promise<SlimWlEntry | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null

    const data = await res.json()
    const result = data?.chart?.result?.[0]
    if (!result) return null

    const rawCloses: (number | null)[] = result.indicators?.quote?.[0]?.close ?? []
    const closes = rawCloses.filter((v): v is number => v !== null)
    if (closes.length < 30) return null

    const curr = closes[closes.length - 1]

    // MA100 (최대 100일, 데이터 부족 시 전체 평균)
    const ma100Window = closes.slice(-100)
    const ma100 = ma100Window.reduce((a, b) => a + b, 0) / ma100Window.length

    // MA 기울기: 최근 5일 평균 vs 10~15일 전 평균
    const maRecent = closes.slice(-5).reduce((a, b) => a + b, 0) / 5
    const maOld    = closes.slice(-15, -10).reduce((a, b) => a + b, 0) / 5
    const maSlopeDown = maRecent < maOld

    // 20일 수익률
    const price20ago = closes.length >= 21 ? closes[closes.length - 21] : closes[0]
    const ret20d     = ((curr - price20ago) / price20ago) * 100

    // MA100 거리 (음수 = 하방)
    const maDist = ((curr - ma100) / ma100) * 100

    // bear_strength 계산 (0~100)
    //  - MA 위치:  MA100 아래일수록 높음 (0~40)
    //  - 모멘텀:   20일 하락일수록 높음 (0~35)
    //  - MA 기울기: 기울기 하향이면 +25
    const maPosBear  = maDist < 0 ? Math.min(40, Math.abs(maDist) * 4) : 0
    const momBear    = ret20d < 0 ? Math.min(35, Math.abs(ret20d) * 2.5) : 0
    const slopeBear  = maSlopeDown ? 25 : 0
    const bearStrength = Math.min(100, maPosBear + momBear + slopeBear)

    // 스테이지 추론
    let stage = 'stage2'
    if (maDist < -8 || (maDist < -3 && maSlopeDown)) stage = 'stage4'
    else if (maDist < -3 || (maDist < 0 && ret20d < -5)) stage = 'stage3_late'
    else if (maDist < 0) stage = 'stage3'
    else if (maDist < 3 && !maSlopeDown) stage = 'stage2_early'

    // 시그널
    let signal = 'neutral'
    if (bearStrength >= 60)      signal = 'short'
    else if (bearStrength >= 35) signal = 'short_watch'
    else if (bearStrength <= 15 && maDist > 5) signal = 'long'

    return {
      signal,
      stage,
      bear_strength: bearStrength,
      rs_excess_pct: null,  // Yahoo Finance 단독 조회로는 SPY 대비 RS 없음
      rs_history:    [],
      isBasic:       true,
    }
  } catch {
    return null
  }
}

// ── 메인 ──────────────────────────────────────────────────────────────────

export default async function ShortTrackerPage() {
  const [d5, d10, d20, d60, wl, tm, na] = await Promise.all([
    readJson('data/top10/netBuy_5.json'),
    readJson('data/top10/netBuy_10.json'),
    readJson('data/top10/netBuy_20.json'),
    readJson('data/top10/netBuy_60.json'),
    readJson('data/watchlist.json'),
    readJson('data/ticker_map.json'),
    readJson('data/name_alias.json'),
  ])

  // 슬림 netBuy: top30만
  function trimNetBuy(d: any): SlimNetBuyData {
    return {
      asOf: d.asOf,
      items: d.items.slice(0, 30).map((item: any) => ({
        rank:       item.rank,
        fullName:   item.ticker,
        ticker:     (tm[item.ticker] as string) ?? null,
        koreanName: (na[item.ticker] as string) ?? '',
        value:      item.value,
      })),
    }
  }

  // top30 전체에 나오는 ticker 수집
  const allTickers = new Set<string>()
  for (const d of [d5, d10, d20, d60]) {
    for (const item of d.items.slice(0, 30)) {
      const ticker = tm[item.ticker]
      if (ticker) allTickers.add(ticker as string)
    }
  }

  // 워치리스트에서 매칭되는 항목만 추출
  const wlMap: SlimWlMap = {}
  for (const sec of wl.sectors) {
    for (const stock of sec.stocks) {
      if (allTickers.has(stock.ticker)) {
        wlMap[stock.ticker] = {
          signal:        stock.signal,
          stage:         stock.stage,
          bear_strength: stock.breakdown.bear_strength,
          rs_excess_pct: stock.data.rs_excess_pct,
          rs_history:    stock.rs_history,
        }
      }
    }
  }

  // 워치리스트 미등록 종목 → Yahoo Finance 기본 분석
  const missingTickers = [...allTickers].filter(t => !wlMap[t])
  if (missingTickers.length > 0) {
    const results = await Promise.all(
      missingTickers.map(async t => ({ ticker: t, data: await fetchBasicTech(t) }))
    )
    for (const { ticker, data } of results) {
      if (data) wlMap[ticker] = data
    }
  }

  return (
    <ShortTrackerClient
      netBuy5={trimNetBuy(d5)}
      netBuy10={trimNetBuy(d10)}
      netBuy20={trimNetBuy(d20)}
      netBuy60={trimNetBuy(d60)}
      wlMap={wlMap}
    />
  )
}
