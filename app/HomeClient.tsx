'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
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
                redirectTo: `${location.origin}/auth/callback`,
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
    router.replace(`/?${params.toString()}`, { scroll: false });
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

  // 6. 렌더링
  return (
    <>
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-6 mt-2">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900 leading-none">
            📊 실시간 수급 랭킹
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mb-4"></span>
          </h2>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {[10, 20, 30].map((n) => (
                <button
                    key={n}
                    onClick={() => setTopN(n as any)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        topN === n ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    TOP{n}
                </button>
            ))}
          </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setSide('netBuy')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${isBuy ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>순매수</button>
            <button onClick={() => setSide('netSell')} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${!isBuy ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>순매도</button>
        </div>
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {[1, 5, 10, 20, 30, 40, 60].map((d) => (
                <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${days === d ? (isBuy ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200') : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'}`}>{d}일</button>
            ))}
        </div>
      </div>

      {loading && <div className="h-[400px] flex flex-col items-center justify-center gap-2 text-gray-400"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-400 rounded-full animate-spin"></div><span>데이터 분석 중...</span></div>}

      {!loading && (
        <div className="h-[600px] overflow-y-auto pr-1 pb-10 scrollbar-hide md:scrollbar-default border-t border-gray-100 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                {visibleItems.map((item, index) => {
                    const rank = index + 1;
                    const isLocked = (rank <= 3) && !isLoggedIn;

                    return (
                        <div key={item.fileTicker + index} className="relative group">
                            {/* ✨ [수정 1] 내용물: 흐림 효과 제거 (덮개가 흐리게 할 것임) */}
                            <div className={`
                                flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl border transition-all bg-white
                                ${isLocked ? 'pointer-events-none select-none' : 'hover:shadow-lg hover:-translate-y-1 cursor-pointer'}
                                ${isBuy ? 'hover:border-red-100 border-gray-100' : 'hover:border-blue-100 border-gray-100'}
                            `}>
                                <div className={`w-8 h-8 flex items-center justify-center rounded-lg font-black text-sm md:text-lg shadow-sm shrink-0 ${rank <= 5 ? (isBuy ? 'bg-red-500 text-white' : 'bg-blue-500 text-white') : 'bg-gray-100 text-gray-500'}`}>{rank}</div>
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white border border-gray-100 p-0.5 shrink-0 overflow-hidden">
                                    <img src={`/logos/${encodeURIComponent(item.fileTicker)}.png`} alt={item.name} className="w-full h-full object-cover rounded-full" onError={(e) => { const target = e.currentTarget; if (!target.src.includes('_us.png')) target.src = '/logos/_us.png'; }} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-bold text-gray-900 truncate text-sm md:text-base leading-tight">{item.name}</h3>
                                    <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs mt-0.5">
                                        <span className="text-gray-400 font-mono">{item.ticker}</span>
                                        <span className={`font-bold ${isBuy ? 'text-red-500' : 'text-blue-500'}`}>{formatMoney(item.value)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* 🔒 잠금 화면: ✨ [수정 2] 유리창 효과 (backdrop-blur-sm) 적용 */}
                            {isLocked && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/20 backdrop-blur-sm rounded-2xl">
                                    <button 
                                        onClick={() => handleLockAction(rank)} 
                                        className="bg-gray-900 shadow-xl px-4 py-2.5 rounded-full flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform border border-gray-700 pointer-events-auto"
                                    >
                                        <span className="text-lg">🔒</span>
                                        <div className="flex flex-col items-start leading-none">
                                            <span className="text-[10px] text-gray-300 font-medium mb-0.5">Member Only</span>
                                            <span className="text-sm font-bold text-white">로그인하고 무료 보기</span>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {!isLocked && (
                                <Link href={`/flow?ticker=${item.ticker}&fileTicker=${encodeURIComponent(item.fileTicker)}&side=${side}&days=${days}`} className="absolute inset-0 z-0" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
      )}
    </>
  );
}