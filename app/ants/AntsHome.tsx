'use client';

// 개미지수 — 매크로·부동산과 같은 리포트 톤 (각진 카드, hairline, mono 숫자, 이모지 없음)
//  1. 개인투자자 누적 순매수  2. 섹터 랭킹  3. 5일 순매수·순매도 1위  4. 주가 × 수급 조합  5. 수급 랭킹

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import HomeClient from '../HomeClient';
import NomNomChart from '../components/NomNomChart';
import Footer from '../components/Footer';
import SectorGrid from '../components/SectorGrid';
import CumulativeChart from './CumulativeChart';
import { fmtUsd } from './CumulativeChart';
import { Section, Logo } from './ui';

type HookItem = { ticker: string; fileTicker: string; name: string; value: number; type: 'buy' | 'sell' };
type NomData = { fire?: any; top?: any; bottom?: any; knife?: any };

const SHORTCUTS = [
  { href: '#ranking', label: '수급 랭킹' },
  { href: '/analysis', label: '종목 검색' },
  { href: '/watchlist', label: '섹터 히트맵' },
  { href: '/flow', label: 'Korean Flow' },
];

export default function AntsHome() {
  const [hookItems, setHookItems] = useState<[HookItem | null, HookItem | null]>([null, null]);
  const [nomData, setNomData] = useState<NomData | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [buy5, sell5, tickerMap, nameMap, nom] = await Promise.all([
          fetch('/data/top10/netBuy_5.json', { cache: 'no-store' }).then(r => r.json()),
          fetch('/data/top10/netSell_5.json', { cache: 'no-store' }).then(r => r.json()),
          fetch('/data/ticker_map.json').then(r => r.json()),
          fetch('/data/name_alias.json').then(r => r.json()),
          fetch('/data/flow/nom_nom_data.json', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        ]);
        if (nom) setNomData(nom);

        const norm = (k: string) => k.toUpperCase().trim();
        const tMap: Record<string, string> = {};
        const nMap: Record<string, string> = {};
        Object.entries(tickerMap).forEach(([k, v]) => (tMap[norm(k)] = String(v)));
        Object.entries(nameMap).forEach(([k, v]) => (nMap[norm(k)] = String(v)));
        const enrich = (item: any, type: 'buy' | 'sell'): HookItem => {
          const raw = (item.ticker || '').trim();
          const ticker = tMap[norm(raw)] || raw;
          return { ticker, fileTicker: raw, name: nMap[norm(raw)] || ticker, value: item.value, type };
        };
        const b = buy5?.items?.[0];
        const s = sell5?.items?.[0];
        setHookItems([b ? enrich(b, 'buy') : null, s ? enrich(s, 'sell') : null]);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  return (
    <div className="pt-2 pb-4">
      <Link href="/explore" className="text-xs" style={{ color: 'var(--ink-mute)' }}>← 분석 선택</Link>
      <h1 className="mt-2 text-2xl font-bold" style={{ color: 'var(--ink)' }}>개미지수</h1>
      <p className="mt-1 text-xs leading-relaxed max-w-2xl" style={{ color: 'var(--ink-mute)' }}>
        한국 개인투자자(서학개미)가 미국주식을 얼마나 사고팔았는지 봅니다. 매일 한국예탁결제원 결제 데이터를 받아 쌓아요.
      </p>

      <div className="mt-5 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] font-semibold mr-1" style={{ color: 'var(--ink-mute)' }}>바로가기</span>
        {SHORTCUTS.map(s => (
          <Link key={s.href} href={s.href} className="px-2.5 py-1 text-xs font-semibold"
            style={{ border: '1px solid var(--btn-border)', color: 'var(--ink-2)' }}>
            {s.label}
          </Link>
        ))}
      </div>

      <Section title="개인투자자 누적 순매수" desc="사면 위로, 팔면 아래로 쌓여요">
        <CumulativeChart />
      </Section>

      <Section title="섹터 랭킹" desc="대표 ETF 등락률">
        <SectorGrid />
      </Section>

      <Section title="5일 순매수 · 순매도 1위" desc="최근 5거래일 합계">
        <div className="grid grid-cols-2 gap-2">
          <TopCard item={hookItems[0]} side="netBuy" />
          <TopCard item={hookItems[1]} side="netSell" />
        </div>
      </Section>

      <Section title="주가와 개인 수급" desc="최근 5거래일 주가 방향 × 개인 순매수 방향">
        <NomNomChart fire={nomData?.fire} top={nomData?.top} bottom={nomData?.bottom} knife={nomData?.knife} />
      </Section>

      <div id="ranking" className="scroll-mt-20">
        <Suspense fallback={<div className="text-center py-20 text-sm" style={{ color: 'var(--ink-mute)' }}>불러오는 중…</div>}>
          <HomeClient />
        </Suspense>
      </div>

      <Footer />
    </div>
  );
}

function TopCard({ item, side }: { item: HookItem | null; side: 'netBuy' | 'netSell' }) {
  const buy = side === 'netBuy';
  if (!item) return <div className="h-[120px] animate-pulse" style={{ background: 'var(--plane)' }} />;
  return (
    <Link href={`/flow?ticker=${item.ticker}&fileTicker=${encodeURIComponent(item.fileTicker)}&side=${side}&days=5`}
      className="block p-3 hover:opacity-90" style={{ border: '1px solid var(--hairline-2)', background: 'var(--surface)' }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-bold" style={{ color: buy ? 'var(--up-text)' : 'var(--down-text)' }}>
          {buy ? '순매수 1위' : '순매도 1위'}
        </span>
        <Logo fileTicker={item.fileTicker} ticker={item.ticker} size={32} />
      </div>
      <div className="mt-1 text-[15px] font-bold leading-snug break-keep" style={{ color: 'var(--ink)' }}>{item.name}</div>
      <div className="mt-0.5 flex items-baseline gap-2 flex-wrap">
        <span className="mono text-[11px]" style={{ color: 'var(--ink-mute)' }}>{item.ticker}</span>
        <span className="mono text-sm font-bold" style={{ color: buy ? 'var(--up-text)' : 'var(--down-text)' }}>{fmtUsd(item.value)}</span>
      </div>
    </Link>
  );
}
