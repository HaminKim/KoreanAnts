'use client';

import { useEffect, useMemo, useState } from 'react';
import Top10Grid from './components/Top10Grid';

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '.');
}

function getDateRange(days: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (days - 1));

  if (days === 1) return formatDate(end);
  return `${formatDate(start)} ~ ${formatDate(end)}`;
}

type TopItem = {
  rank: number;
  ticker: string;
  fileTicker?: string;
  value?: number;
};

export default function Home() {
  const [side, setSide] = useState<'netBuy' | 'netSell'>('netBuy');
  const [days, setDays] = useState(5);

  // ✅ TOP 개수 선택 (10/20/30/40)
  const [topN, setTopN] = useState<10 | 20 | 30 | 40>(10);

  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isBuy = side === 'netBuy';

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/data/top10/${side}_${days}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load top json: ${res.status}`);

        const data = await res.json();
        setItems(data.items ?? []);
      } catch (e: any) {
        setItems([]);
        setErr(e?.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    run();
  }, [side, days]);

  // ✅ 화면에 표시할 개수만 자르기
  const visibleItems = useMemo(() => items.slice(0, topN), [items, topN]);

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">
        순매수 · 순매도 TOP{topN}
      </h2>

      {/* 순매수/순매도 토글 */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSide('netBuy')}
          className={`px-4 py-2 border rounded transition ${
            isBuy ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 text-gray-500'
          }`}
        >
          순매수
        </button>

        <button
          onClick={() => setSide('netSell')}
          className={`px-4 py-2 border rounded transition ${
            !isBuy ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 text-gray-500'
          }`}
        >
          순매도
        </button>
      </div>

      {/* 기간 선택 */}
      <div className="flex gap-3 mb-2 flex-wrap">
        {[1, 5, 10, 20, 30, 40, 60].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`text-sm transition ${
              days === d ? 'font-bold text-black' : 'text-gray-400'
            }`}
          >
            {d}일
          </button>
        ))}
      </div>

      <div className="text-sm text-gray-500 mb-4">
        기간: {getDateRange(days)}
      </div>

      {/* ✅ TOP 개수 선택 */}
      <div className="flex gap-3 mb-6">
        {[10, 20, 30, 40].map((n) => (
          <button
            key={n}
            onClick={() => setTopN(n as 10 | 20 | 30 | 40)}
            className={`text-sm transition ${
              topN === n ? 'font-bold text-black' : 'text-gray-400'
            }`}
          >
            TOP{n}
          </button>
        ))}
      </div>

      {/* 상태 */}
      {loading && <div className="text-sm text-gray-500 mb-4">불러오는 중…</div>}
      {err && <div className="text-sm text-red-500 mb-4">에러: {err}</div>}

      {/* TOP Grid */}
      <Top10Grid side={side} days={days} items={visibleItems} />
    </>
  );
}
