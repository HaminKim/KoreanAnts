'use client';

// 섹터 랭킹 — 대표 ETF 등락률을 5단계 diverging 색(--g1~5 / --r1~5)으로. 카드 클릭 → 가격 차트

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import SectorChart from './SectorChart';
import Portal from './Portal';
import { Chip } from './macro/ui';

type SectorItem = {
  id: number;
  name: string;
  ticker: string;
  change1d: number;
  change1w: number;
  change1m: number;
};
type Period = '1D' | '1W' | '1M';

const PERIOD_LABEL: Record<Period, string> = { '1D': '1일', '1W': '1주', '1M': '1달' };
// 단계 경계 (%): 넘은 개수 = 색 단계(0 = 보합). 1달은 변동 폭이 커서 넓게
const STEPS: Record<Period, number[]> = { '1D': [0.3, 1, 2, 3, 4.5], '1W': [0.5, 2, 4, 6, 9], '1M': [1, 3, 6, 10, 15] };

const changeOf = (s: SectorItem, p: Period) => (p === '1D' ? s.change1d : p === '1W' ? s.change1w : s.change1m);

function tone(v: number, p: Period) {
  const k = STEPS[p].filter(t => Math.abs(v) >= t).length;
  if (k === 0) return { bg: 'var(--neu)', fg: 'var(--neut)' };
  return v > 0 ? { bg: `var(--g${k})`, fg: `var(--gt${k})` } : { bg: `var(--r${k})`, fg: `var(--rt${k})` };
}

const fmtPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;

export default function SectorGrid() {
  const [period, setPeriod] = useState<Period>('1D');
  const [selected, setSelected] = useState<SectorItem | null>(null);
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [err, setErr] = useState(false);

  useEffect(() => {
    // 예전 파일에 NaN 이 섞여 있던 적이 있어 JSON 파싱 전에 걸러냄
    fetch('/data/sector_performance.json')
      .then(res => res.text())
      .then(t => {
        const rows: SectorItem[] = JSON.parse(t.replace(/\bNaN\b/g, 'null'));
        const ok = rows.filter(r => [r.change1d, r.change1w, r.change1m].every(v => typeof v === 'number' && isFinite(v)));
        if (!ok.length) throw new Error('empty');
        setSectors(ok);
      })
      .catch(e => { console.error('섹터 데이터 로드 실패:', e); setErr(true); });
  }, []);

  const sorted = useMemo(() => [...sectors].sort((a, b) => changeOf(b, period) - changeOf(a, period)), [period, sectors]);

  if (sectors.length === 0) {
    return err
      ? <p className="py-10 text-center text-xs" style={{ color: 'var(--ink-mute)' }}>섹터 데이터를 불러오지 못했어요. 다음 갱신 때 다시 채워져요.</p>
      : <div className="h-[132px] animate-pulse" style={{ background: 'var(--plane)' }} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1">
          {(['1D', '1W', '1M'] as const).map(t => <Chip key={t} on={period === t} onClick={() => setPeriod(t)}>{PERIOD_LABEL[t]}</Chip>)}
        </div>
        <Link href="/watchlist" className="text-xs font-semibold" style={{ color: 'var(--ink-2)' }}>종목 히트맵 →</Link>
      </div>

      <div className="grid grid-cols-4 md:grid-cols-8 gap-1">
        {sorted.map((s, i) => {
          const v = changeOf(s, period);
          const t = tone(v, period);
          return (
            <button key={s.id} type="button" onClick={() => setSelected(s)}
              className="relative text-left px-2 pt-1.5 pb-2 h-[64px] md:h-[72px] flex flex-col justify-between hover:opacity-90"
              style={{ background: t.bg, color: t.fg }}>
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-[12px] font-bold leading-tight truncate">{s.name}</span>
                <span className="mono text-[9px] opacity-70">{i + 1}</span>
              </div>
              <div>
                <div className="mono text-[13px] md:text-sm font-bold leading-none">{fmtPct(v)}</div>
                <div className="mono text-[9px] opacity-70 mt-0.5">{s.ticker}</div>
              </div>
            </button>
          );
        })}
      </div>

      <Portal>
        {selected && (
          <div onClick={() => setSelected(null)} className="fixed inset-0 z-[99999] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
            <div onClick={e => e.stopPropagation()} className="w-full max-w-md" style={{ background: 'var(--surface)', border: '1px solid var(--hairline-2)' }}>
              <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2" style={{ borderBottom: '1px solid var(--ink)' }}>
                <div>
                  <div className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{selected.name} <span className="mono font-normal" style={{ color: 'var(--ink-mute)' }}>{selected.ticker}</span></div>
                  <div className="mt-1 flex items-baseline gap-3 text-[11px]" style={{ color: 'var(--ink-mute)' }}>
                    {(['1D', '1W', '1M'] as const).map(p => {
                      const v = changeOf(selected, p);
                      return (
                        <span key={p}>{PERIOD_LABEL[p]} <span className="mono font-bold" style={{ color: v >= 0 ? 'var(--up-text)' : 'var(--down-text)' }}>{fmtPct(v)}</span></span>
                      );
                    })}
                  </div>
                </div>
                <button type="button" onClick={() => setSelected(null)} className="text-xs px-2 py-1" style={{ border: '1px solid var(--btn-border)', color: 'var(--ink-2)' }}>닫기</button>
              </div>
              <div className="h-[260px] w-full px-2 py-3">
                <SectorChart ticker={selected.ticker} change={changeOf(selected, period)} />
              </div>
            </div>
          </div>
        )}
      </Portal>
    </div>
  );
}
