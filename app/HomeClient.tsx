'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Chip } from './components/macro/ui';
import { createClient } from '@/utils/supabase/client';

// ----------------------------------------------------------------------
// 🛠️ 유틸리티 함수
// ----------------------------------------------------------------------
function formatMoney(val: number) {
  const absVal = Math.abs(val);
  if (absVal >= 100000000) return `${(val / 100000000).toFixed(1)}억 $`;
  if (absVal >= 10000) return `${(val / 10000).toFixed(0)}만 $`;
  return `${val.toLocaleString()} $`;
}

type RankItem = {
  rank: number;
  ticker: string;       
  name: string;         
  fileTicker: string;   
  value: number;
};

export default function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  // 1. 상태 관리
  const [side, setSide] = useState<'netBuy' | 'netSell'>('netBuy');
  const [days, setDays] = useState(5);
  const [topN, setTopN] = useState<10 | 20 | 30>(30); 
  const [items, setItems] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // ✨ 로그인 여부 체크
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const isBuy = side === 'netBuy';

  // 2. 로그인 체크
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
       if (session) setIsLoggedIn(true);
       else setIsLoggedIn(false);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  // 3. 잠금 해제 액션
  const handleLockAction = (rank: number) => {
    if (!isLoggedIn) {
        supabase.auth.signInWithOAuth({
            provider: 'kakao',
            options: {
                redirectTo: `${location.origin}/auth/callback?next=/ants`,
                queryParams: { scope: 'profile_nickname,profile_image' },
            },
        });
        return;
    }
  };

  // 4. URL 동기화
  useEffect(() => {
    const spSide = searchParams.get('side');
    const spDays = searchParams.get('days');
    const spTop = searchParams.get('top');

    if (spSide === 'netBuy' || spSide === 'netSell') setSide(spSide);
    if (spDays && !Number.isNaN(Number(spDays))) setDays(Number(spDays));
    if (spTop && ['10','20','30'].includes(spTop)) setTopN(Number(spTop) as 10 | 20 | 30);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('side', side);
    params.set('days', String(days));
    params.set('top', String(topN));
    router.replace(`/ants?${params.toString()}`, { scroll: false });
  }, [side, days, topN, router]);

  // 5. 데이터 로드
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [rankRes, tickerRes, nameRes] = await Promise.all([
            fetch(`/data/top10/${side}_${days}.json`, { cache: 'no-store' }),
            fetch('/data/ticker_map.json'),
            fetch('/data/name_alias.json')
        ]);

        const tickerMap = await tickerRes.json();
        const nameMap = await nameRes.json();
        const normalize = (s: string) => s.toUpperCase().trim();
        const normTickerMap: Record<string, string> = {};
        const normNameMap: Record<string, string> = {};

        Object.entries(tickerMap).forEach(([k, v]) => normTickerMap[normalize(k)] = String(v));
        Object.entries(nameMap).forEach(([k, v]) => normNameMap[normalize(k)] = String(v));

        if (rankRes.ok) {
            const rankJson = await rankRes.json();
            const rawItems = rankJson.items ?? [];
            const processedItems = rawItems.map((it: any, index: number) => {
                const rawName = (it.ticker || '').trim();
                const key = normalize(rawName);
                const shortTicker = normTickerMap[key] || rawName;
                const koreanName = normNameMap[key] || shortTicker;

                return {
                    rank: side === 'netSell' ? index + 1 : it.rank,
                    ticker: shortTicker,
                    name: koreanName,
                    fileTicker: rawName,
                    value: it.value
                };
            });
            setItems(processedItems);
        }
      } catch (e) {
        console.error(e);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [side, days]);

  const visibleItems = useMemo(() => items.slice(0, topN), [items, topN]);

  // 6. 렌더링 — 매크로·부동산 리포트 톤 (각진 표, hairline, mono 숫자)
  const tone = isBuy ? 'var(--up-text)' : 'var(--down-text)';
  return (
    <section className="mt-9">
      <div className="flex items-end justify-between gap-2 pb-2 flex-wrap" style={{ borderBottom: '1px solid var(--ink)' }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>수급 랭킹</h2>
          <span className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>최근 {days}거래일 개인 {isBuy ? '순매수' : '순매도'} 합계</span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
        <div className="flex items-center gap-1">
          <Chip on={isBuy} onClick={() => setSide('netBuy')}>순매수</Chip>
          <Chip on={!isBuy} onClick={() => setSide('netSell')}>순매도</Chip>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
          {[1, 5, 10, 20, 30, 40, 60].map(d => <Chip key={d} on={days === d} onClick={() => setDays(d)}>{d}일</Chip>)}
        </div>
        <div className="flex items-center gap-1 ml-auto">
          {[10, 20, 30].map(n => <Chip key={n} on={topN === n} onClick={() => setTopN(n as 10 | 20 | 30)}>TOP {n}</Chip>)}
        </div>
      </div>

      {loading ? (
        <div className="mt-3 h-[400px] animate-pulse" style={{ background: 'var(--plane)' }} />
      ) : (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6" style={{ borderTop: '1px solid var(--hairline-2)' }}>
          {visibleItems.map((item, index) => (
            <Link key={item.fileTicker + index}
              href={`/flow?ticker=${item.ticker}&fileTicker=${encodeURIComponent(item.fileTicker)}&side=${side}&days=${days}`}
              className="flex items-center gap-3 py-2.5 hover:opacity-80" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <span className="mono w-6 text-right text-sm font-bold shrink-0" style={{ color: index < 5 ? 'var(--ink)' : 'var(--rank-dim)' }}>{index + 1}</span>
              <img src={`/logos/${encodeURIComponent(item.fileTicker)}.png`} alt="" className="w-8 h-8 shrink-0 rounded-full object-cover"
                style={{ border: '1px solid var(--hairline)', background: '#fff' }}
                onError={(e) => { const t = e.currentTarget; if (!t.src.includes('_us.png')) t.src = '/logos/_us.png'; }} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate leading-tight" style={{ color: 'var(--ink)' }}>{item.name}</div>
                <div className="mono text-[10px]" style={{ color: 'var(--ink-mute)' }}>{item.ticker}</div>
              </div>
              <span className="mono text-[13px] font-bold shrink-0" style={{ color: tone }}>{formatMoney(item.value)}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
