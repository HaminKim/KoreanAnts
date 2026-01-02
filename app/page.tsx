'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Top10Grid from './components/Top10Grid';

function formatUSD_KR(amount: number) {
  if (amount == null || Number.isNaN(amount)) return '-';

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  // 1만 달러 미만은 그냥 달러 표기
  if (abs < 10_000) {
    return `${sign}${Math.round(abs).toLocaleString('ko-KR')} 달러`;
  }

  // ✅ '만' 단위로 반올림 (10,000달러 단위)
  const manTotal = Math.round(abs / 10_000); // ex) 56,280,000 -> 5,628(만)
  const eok = Math.floor(manTotal / 10_000); // 1억 = 10,000만
  const man = manTotal % 10_000;

  if (eok > 0) {
    // 1억 이상
    if (man === 0) return `${sign}${eok}억 달러`;
    return `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만 달러`;
  }

  // 1억 미만
  return `${sign}${manTotal.toLocaleString('ko-KR')}만 달러`;
}

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
  ticker: string;     // 현재 JSON에서는 이게 '원천이름'일 가능성이 큼 (예: ALPHABET INC CL A)
  fileTicker?: string; // Flow용 티커 (예: GOOGL, IONQ) - 있다면 이걸 우선 사용
  value?: number;
};

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [side, setSide] = useState<'netBuy' | 'netSell'>('netBuy');
  const [days, setDays] = useState(5);

  // ✅ TOP 개수 선택 (10/20/30/40)
  const [topN, setTopN] = useState<10 | 20 | 30 | 40>(10);

  const [items, setItems] = useState<TopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);


  // ✅ 원천이름 -> 표시이름 alias
  const [nameAlias, setNameAlias] = useState<Record<string, string>>({});

  const isBuy = side === 'netBuy';

  useEffect(() => {
    const spSide = searchParams.get('side');
    const spDays = searchParams.get('days');
    const spTop = searchParams.get('top');

    if (spSide === 'netBuy' || spSide === 'netSell') setSide(spSide);
    if (spDays && !Number.isNaN(Number(spDays))) setDays(Number(spDays));
    if (spTop && ['10','20','30','40'].includes(spTop)) setTopN(Number(spTop) as 10|20|30|40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('side', side);
    params.set('days', String(days));
    params.set('top', String(topN));

    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [side, days, topN, router]);

  // 1) name_alias.json 로드 (앱 시작 시 1회)
  useEffect(() => {
    fetch('/data/name_alias.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setNameAlias(data ?? {}))
      .catch(() => setNameAlias({}));
  }, []);

  // 2) TOP 데이터 로드 (side/days 변경 시)
  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        setErr(null);

        const res = await fetch(`/data/top10/${side}_${days}.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load top json: ${res.status}`);

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

  // ✅ 화면에 표시할 개수만 자르기
  const visibleItems = useMemo(() => items.slice(0, topN), [items, topN]);

  // ✅ 표시 이름 치환: (원천이름이 ticker 필드에 들어온다고 가정)
  // - 혹시 fileTicker가 원천이름일 수도 있으니, ticker를 우선 raw로 씀
  const mappedItems = useMemo(() => {
    return visibleItems.map((it) => {
      const rawName = it.ticker; // 여기 키가 원천이름(예: ALPHABET INC CL A)이라고 가정
      const displayTicker = it.fileTicker ?? it.ticker; // 로고/Flow용으로 쓸 "진짜 티커"가 있으면 우선
      const displayName =
        nameAlias[rawName]?.trim() ||
        rawName?.trim() ||
        it.fileTicker ||
        it.ticker ||
        '-';
      return {
        ...it,
        // Top10Grid가 어떤 필드를 쓰는지 모르니,
        // 안전하게 'ticker'에는 화면에 보여줄 이름을 넣고,
        // 'fileTicker'에는 실제 티커를 유지하도록 정리
        ticker: displayName,
        fileTicker: displayTicker,
      };
    });
  }, [visibleItems, nameAlias]);

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">순매수 · 순매도 TOP{topN}</h2>

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
            className={`text-sm transition ${days === d ? 'font-bold text-black' : 'text-gray-400'}`}
          >
            {d}일
          </button>
        ))}
      </div>

      <div className="text-sm text-gray-500 mb-4">
        기간: {range ? `${formatDotDate(range.start)} ~ ${formatDotDate(range.end)}` : getDateRange(days)}          
      </div>

      {/* ✅ TOP 개수 선택 */}
      <div className="flex gap-3 mb-6">
        {[10, 20, 30, 40].map((n) => (
          <button
            key={n}
            onClick={() => setTopN(n as 10 | 20 | 30 | 40)}
            className={`text-sm transition ${topN === n ? 'font-bold text-black' : 'text-gray-400'}`}
          >
            TOP{n}
          </button>
        ))}
      </div>

      {/* 상태 */}
      {loading && <div className="text-sm text-gray-500 mb-4">불러오는 중…</div>}
      {err && <div className="text-sm text-red-500 mb-4">에러: {err}</div>}

      {/* TOP Grid */}
      <Top10Grid side={side} days={days} topN={topN} items={visibleItems} />
    </>
  );
}
