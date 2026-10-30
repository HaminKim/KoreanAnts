'use client';

// 주가와 개인 수급 — 최근 5거래일 주가 방향 × 개인 순매수 방향 4개 조합. 해석 문구 없이 사실만 표시.
//  분류 기준은 scripts/generate_nomnom.py (상승 +3% / 하락 −2%·−2.5%)

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Logo } from '../ants/ui';
import { fmtUsd } from '../ants/CumulativeChart';

type StockData = {
  name: string;
  name_kr?: string;
  ticker: string;
  file_ticker?: string;
  close?: number;
  price_change: number;
  net_buy_sum: number;
  last_date?: string;
};

type GroupKey = 'fire' | 'top' | 'bottom' | 'knife';
type Props = { fire?: StockData | StockData[]; top?: StockData | StockData[]; bottom?: StockData | StockData[]; knife?: StockData | StockData[] };

const GROUPS: { key: GroupKey; price: '상승' | '하락'; flow: '순매수' | '순매도' }[] = [
  { key: 'top', price: '상승', flow: '순매수' },
  { key: 'fire', price: '상승', flow: '순매도' },
  { key: 'knife', price: '하락', flow: '순매수' },
  { key: 'bottom', price: '하락', flow: '순매도' },
];

const normalize = (d: StockData | StockData[] | undefined) => (!d ? [] : Array.isArray(d) ? d : [d]);
const ymd = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

function shiftBusinessDay(base: Date, step: 1 | -1) {
  const d = new Date(base);
  do d.setDate(d.getDate() + step); while (d.getDay() === 0 || d.getDay() === 6);
  return d;
}

export default function NomNomChart({ fire, top, bottom, knife }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [data, setData] = useState<Record<GroupKey, StockData[]>>({ fire: [], top: [], bottom: [], knife: [] });
  const [isLoading, setIsLoading] = useState(false);
  const isToday = ymd(currentDate) === ymd(new Date());

  useEffect(() => {
    if (isToday) {
      setData({ fire: normalize(fire), top: normalize(top), bottom: normalize(bottom), knife: normalize(knife) });
      return;
    }
    setIsLoading(true);
    fetch(`/data/history/history_${ymd(currentDate)}.json`)
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(js => setData({ fire: normalize(js.fire), top: normalize(js.top), bottom: normalize(js.bottom), knife: normalize(js.knife) }))
      .catch(() => setData({ fire: [], top: [], bottom: [], knife: [] }))
      .finally(() => setIsLoading(false));
  }, [currentDate, isToday, fire, top, bottom, knife]);

  const asOf = Object.values(data).flat().map(s => s.last_date).filter(Boolean).sort().pop();

  return (
    <div>
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <DateNav date={currentDate} isToday={isToday} onChange={setCurrentDate} />
        {asOf && <span className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>주가 기준 <span className="mono">{asOf.replaceAll('-', '.')}</span></span>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {GROUPS.map(g => (
          <div key={g.key} style={{ border: '1px solid var(--hairline-2)', background: 'var(--surface)' }}>
            <div className="px-3 py-2 flex items-baseline justify-between gap-2" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <span className="text-[13px] font-bold" style={{ color: 'var(--ink)' }}>
                주가 <span style={{ color: g.price === '상승' ? 'var(--up-text)' : 'var(--down-text)' }}>{g.price} 중</span>
                <span className="mx-1.5" style={{ color: 'var(--hairline-2)' }}>·</span>
                개인 <span style={{ color: g.flow === '순매수' ? 'var(--up-text)' : 'var(--down-text)' }}>{g.flow} 중</span>
              </span>
              <span className="text-[10px] shrink-0" style={{ color: 'var(--ink-mute)' }}>5일 주가 · 순매수</span>
            </div>
            <div className="min-h-[96px]">
              {isLoading ? (
                <div className="m-2 h-[80px] animate-pulse" style={{ background: 'var(--plane)' }} />
              ) : data[g.key].length === 0 ? (
                <div className="py-9 text-center text-[11px]" style={{ color: 'var(--ink-mute)' }}>해당 종목 없음</div>
              ) : (
                data[g.key].map((s, i) => <Row key={`${s.ticker}-${i}`} s={s} first={i === 0} />)
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ s, first }: { s: StockData; first: boolean }) {
  const pct = s.price_change * 100;
  const name = s.name_kr?.trim() || s.name;
  return (
    <Link href={`/flow?ticker=${s.ticker}&fileTicker=${encodeURIComponent(s.file_ticker || s.ticker)}&side=netBuy&days=5`}
      className="flex items-center gap-2.5 px-3 py-2 hover:opacity-80" style={first ? undefined : { borderTop: '1px solid var(--hairline)' }}>
      <Logo fileTicker={s.name} ticker={s.ticker} size={26} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate leading-tight" style={{ color: 'var(--ink)' }}>{name}</div>
        <div className="mono text-[10px]" style={{ color: 'var(--ink-mute)' }}>{s.ticker}{s.close ? ` · $${s.close.toFixed(2)}` : ''}</div>
      </div>
      <div className="text-right shrink-0 leading-tight">
        <div className="mono text-[13px] font-bold" style={{ color: pct >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>
          {pct >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(1)}%
        </div>
        <div className="mono text-[10px]" style={{ color: s.net_buy_sum >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>
          {fmtUsd(s.net_buy_sum)}
        </div>
      </div>
    </Link>
  );
}

function DateNav({ date, isToday, onChange }: { date: Date; isToday: boolean; onChange: (d: Date) => void }) {
  const label = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} (${'일월화수목금토'[date.getDay()]})`;
  const btn = { border: '1px solid var(--btn-border)', color: 'var(--ink-2)' };
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={() => onChange(shiftBusinessDay(date, -1))} className="px-2 py-1 text-xs" style={btn} aria-label="이전 날">‹</button>
      <span className="mono text-xs font-semibold px-2" style={{ color: 'var(--ink)' }}>{label}</span>
      <button type="button" onClick={() => !isToday && onChange(shiftBusinessDay(date, 1))} disabled={isToday}
        className="px-2 py-1 text-xs disabled:opacity-30" style={btn} aria-label="다음 날">›</button>
      {!isToday && (
        <button type="button" onClick={() => onChange(new Date())} className="ml-1 px-2 py-1 text-[11px] font-semibold" style={btn}>오늘</button>
      )}
    </div>
  );
}
