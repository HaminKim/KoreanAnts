'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Top10Grid from './components/Top10Grid';

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, '.');
}
function formatDotDate(dateStr: string) {
  return dateStr.replaceAll('-', '.');
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
  value?: number;
};

// UIItem 타입을 TopItem과 동일하게 가져갑니다. (변형 X)
type UIItem = {
  rank: number;
  ticker: string;        
  fileTicker: string;    
  value?: number;
};

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [side, setSide] = useState<'netBuy' | 'netSell'>('netBuy');
  const [days, setDays] = useState(5);
  const [topN, setTopN] = useState<10 | 20 | 30 | 40>(10);

  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);

  const isBuy = side === 'netBuy';

  // URL → state
  useEffect(() => {
    const spSide = searchParams.get('side');
    const spDays = searchParams.get('days');
    const spTop = searchParams.get('top');

    if (spSide === 'netBuy' || spSide === 'netSell') setSide(spSide);
    if (spDays && !Number.isNaN(Number(spDays))) setDays(Number(spDays));
    if (spTop && ['10','20','30','40'].includes(spTop)) {
      setTopN(Number(spTop) as 10 | 20 | 30 | 40);
    }
  }, []);

  // state → URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('side', side);
    params.set('days', String(days));
    params.set('top', String(topN));
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [side, days, topN, router]);

  // TOP 데이터 로드
  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setErr(null);
        // 캐시 끄기 (최신 데이터 보장)
        const res = await fetch(`/data/top10/${side}_${days}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);

        const data = await res.json();
        setItems(data.items ?? []);
        setRange(data.range ?? null);
      } catch (e: any) {
        setItems([]);
        setErr(e?.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [side, days]);

  const visibleItems = useMemo(() => items.slice(0, topN), [items, topN]);

  /**
   * 🔥 핵심 수정: HomeClient는 데이터 가공을 하지 않습니다.
   * 원본 데이터("NVIDIA CORP")를 그대로 Top10Grid에 넘겨줍니다.
   * 그래야 Top10Grid가 ticker_map.json에서 "NVDA"를 찾을 수 있습니다.
   */
  const uiItems: UIItem[] = useMemo(() => {
    return visibleItems.map((it, index) => { 
      const rawName = (it.ticker ?? '').trim();
      return {
        rank: side === 'netSell' ? index + 1 : it.rank,
        ticker: rawName,     // 화면 표시용 (일단 원본 넘김)
        fileTicker: rawName, // 파일 찾기용 (일단 원본 넘김)
        value: it.value,
      };
    });
  }, [visibleItems, side]);

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">순매수 · 순매도 TOP{topN}</h2>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setSide('netBuy')}
          className={`px-4 py-2 border rounded ${
            isBuy ? 'bg-red-500 text-white border-red-500' : 'border-gray-300 text-gray-500'
          }`}
        >
          순매수
        </button>
        <button
          onClick={() => setSide('netSell')}
          className={`px-4 py-2 border rounded ${
            !isBuy ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300 text-gray-500'
          }`}
        >
          순매도
        </button>
      </div>

      <div className="flex gap-3 mb-2 flex-wrap">
        {[1, 5, 10, 20, 30, 40, 60].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`text-sm ${days === d ? 'font-bold text-black' : 'text-gray-400'}`}
          >
            {d}일
          </button>
        ))}
      </div>

      <div className="text-sm text-gray-500 mb-4">
        기간:{' '}
        {range
          ? `${formatDotDate(range.start)} ~ ${formatDotDate(range.end)}`
          : getDateRange(days)}
      </div>

      <div className="flex gap-3 mb-6">
        {[10, 20, 30].map((n) => (
          <button
            key={n}
            onClick={() => setTopN(n as 10 | 20 | 30 | 40)}
            className={`text-sm ${topN === n ? 'font-bold text-black' : 'text-gray-400'}`}
          >
            TOP{n}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-gray-500 mb-4">불러오는 중…</div>}
      {err && <div className="text-sm text-red-500 mb-4">에러: {err}</div>}

      <Top10Grid side={side} days={days} topN={topN} items={uiItems} />
    </>
  );
}