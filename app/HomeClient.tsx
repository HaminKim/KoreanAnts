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
  ticker: string;        // 🔴 원래 데이터 이름 (rawName)
  value?: number;
};

type UIItem = {
  rank: number;
  ticker: string;        // 화면에 보여줄 이름
  fileTicker: string;    // 🔴 로고 파일명으로 쓸 값 (rawName 그대로)
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

  const [nameAlias, setNameAlias] = useState<Record<string, string>>({});

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // state → URL
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('side', side);
    params.set('days', String(days));
    params.set('top', String(topN));
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [side, days, topN, router]);

  // 이름 alias (표시용)
  useEffect(() => {
    fetch('/data/name_alias.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setNameAlias(data ?? {}))
      .catch(() => setNameAlias({}));
  }, []);

  // TOP 데이터
  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setErr(null);

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
   * 🔥 핵심 로직
   * - rawName = it.ticker
   * - fileTicker = rawName 그대로
   * - 로고 파일명 = rawName.png
   */
const uiItems: UIItem[] = useMemo(() => {
    return visibleItems.map((it, index) => { // 👈 index 추가 (0, 1, 2...)
      const rawName = (it.ticker ?? '').trim();

      return {
        // 🔥 수정됨: 순매도(netSell)면 1, 2, 3등으로 강제 변환
        rank: side === 'netSell' ? index + 1 : it.rank,
        
        ticker: nameAlias[rawName]?.trim() || rawName, 
        fileTicker: rawName,
        value: it.value,
      };
    });
  }, [visibleItems, nameAlias, side]); // 👈 side 의존성 추가 필수!

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
        {[10, 20, 30, 40].map((n) => (
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

      {/* 🔥 여기 중요 */}
      <Top10Grid side={side} days={days} topN={topN} items={uiItems} />
    </>
  );
}
