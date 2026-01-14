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

// ----------------------------------------------------------------------
// 📝 타입 정의
// ----------------------------------------------------------------------
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

  // ----------------------------------------------------------------------
  // 1. 상태 관리
  // ----------------------------------------------------------------------
  const [side, setSide] = useState<'netBuy' | 'netSell'>('netBuy');
  const [days, setDays] = useState(5);
  const [topN, setTopN] = useState<10 | 20 | 30>(30); 

  const [items, setItems] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const isBuy = side === 'netBuy';

  // ----------------------------------------------------------------------
  // 2. 로그인 체크
  // ----------------------------------------------------------------------
  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsLoggedIn(true);
      } else {
        setIsLoggedIn(false);
        setUserRole(null);
      }
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const hasAccess = isLoggedIn; 

  // ----------------------------------------------------------------------
  // 3. URL <-> State 동기화
  // ----------------------------------------------------------------------
  useEffect(() => {
    const spSide = searchParams.get('side');
    const spDays = searchParams.get('days');
    const spTop = searchParams.get('top');

    if (spSide === 'netBuy' || spSide === 'netSell') setSide(spSide);
    if (spDays && !Number.isNaN(Number(spDays))) setDays(Number(spDays));
    if (spTop && ['10','20','30'].includes(spTop)) {
      setTopN(Number(spTop) as 10 | 20 | 30);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('side', side);
    params.set('days', String(days));
    params.set('top', String(topN));
    router.replace(`/?${params.toString()}`, { scroll: false });
  }, [side, days, topN, router]);

  // ----------------------------------------------------------------------
  // 4. 데이터 로드
  // ----------------------------------------------------------------------
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [rankRes, tickerRes, nameRes] = await Promise.all([
            fetch(`/data/top10/${side}_${days}.json`, { cache: 'no-store' }),
            fetch('/data/ticker_map.json'),
            fetch('/data/name_alias.json')
        ]);

        if (!rankRes.ok) throw new Error("Rank data fetch failed");

        const rankJson = await rankRes.json();
        const tickerMap = await tickerRes.json();
        const nameMap = await nameRes.json();

        const normalize = (s: string) => s.toUpperCase().trim();
        const normTickerMap: Record<string, string> = {};
        const normNameMap: Record<string, string> = {};

        Object.entries(tickerMap).forEach(([k, v]) => normTickerMap[normalize(k)] = String(v));
        Object.entries(nameMap).forEach(([k, v]) => normNameMap[normalize(k)] = String(v));

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

  // ----------------------------------------------------------------------
  // 5. 렌더링
  // ----------------------------------------------------------------------
  return (
    <>
      {/* 1️⃣ 헤더 라인 */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-6 mt-2">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900 leading-none">
            📊 실시간 수급 랭킹
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mb-4"></span>
          </h2>
          
          {/* TOP 버튼 */}
          <div className="flex bg-gray-100 p-1 rounded-lg">
            {[10, 20, 30].map((n) => (
                <button
                    key={n}
                    onClick={() => setTopN(n as any)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                        topN === n 
                        ? 'bg-white text-gray-900 shadow-sm' 
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                >
                    TOP{n}
                </button>
            ))}
          </div>
      </div>

      {/* 2️⃣ 필터 라인 */}
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
                onClick={() => setSide('netBuy')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${isBuy ? 'bg-white text-red-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
                순매수
            </button>
            <button
                onClick={() => setSide('netSell')}
                className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all ${!isBuy ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
            >
                순매도
            </button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
            {[1, 5, 10, 20, 30, 40, 60].map((d) => (
                <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap transition-colors ${
                    days === d 
                    ? (isBuy ? 'bg-red-50 text-red-600 border-red-200' : 'bg-blue-50 text-blue-600 border-blue-200')
                    : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                }`}
                >
                {d}일
                </button>
            ))}
        </div>
      </div>

      {/* 로딩 표시 */}
      {loading && (
          <div className="h-[400px] flex flex-col items-center justify-center gap-2 text-gray-400">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-400 rounded-full animate-spin"></div>
              <span>데이터 분석 중...</span>
          </div>
      )}

      {/* 3️⃣ 랭킹 리스트 (내부 스크롤 박스 적용) */}
      {!loading && (
        // ✨ [핵심] 스크롤 박스 컨테이너
        // h-[600px]: 높이 고정 (화면이 길어지지 않음)
        // overflow-y-auto: 내용이 넘치면 이 박스 안에서만 스크롤됨
        <div className="h-[600px] overflow-y-auto pr-1 pb-10 scrollbar-hide md:scrollbar-default border-t border-gray-100 pt-4">
            
            {/* ✨ grid-cols-1: 모바일에서 1줄 복귀 */}
            {/* ✨ gap-2: 모바일에서 간격을 좁게 (8px) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
                {visibleItems.map((item, index) => {
                    const rank = index + 1;
                    const isLocked = !hasAccess && index < 3;

                    return (
                        <div key={item.fileTicker + index} className="relative group">
                            
                            {/* 카드 본문 */}
                            <div className={`
                                flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-2xl border transition-all bg-white
                                ${isLocked ? 'blur-md opacity-60 pointer-events-none select-none grayscale' : 'hover:shadow-lg hover:-translate-y-1'}
                                ${isBuy ? 'hover:border-red-100 border-gray-100' : 'hover:border-blue-100 border-gray-100'}
                            `}>
                                {/* 순위 (5위까지 색상) */}
                                <div className={`
                                    w-8 h-8 flex items-center justify-center rounded-lg font-black text-sm md:text-lg shadow-sm shrink-0
                                    ${rank <= 5 
                                        ? (isBuy ? 'bg-red-500 text-white' : 'bg-blue-500 text-white') 
                                        : 'bg-gray-100 text-gray-500'}
                                `}>
                                    {rank}
                                </div>

                                {/* 로고 */}
                                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white border border-gray-100 p-0.5 shrink-0 overflow-hidden">
                                    <img 
                                        src={`/logos/${encodeURIComponent(item.fileTicker)}.png`} 
                                        alt={item.name}
                                        className="w-full h-full object-cover rounded-full"
                                        onError={(e) => {
                                            const target = e.currentTarget;
                                            if (!target.src.includes(encodeURIComponent(item.ticker)) && !target.src.includes('_us.png')) {
                                                target.src = `/logos/${encodeURIComponent(item.ticker)}.png`;
                                            } else {
                                                target.src = '/logos/_us.png';
                                            }
                                        }}
                                    />
                                </div>

                                {/* 정보 */}
                                <div className="min-w-0 flex-1">
                                    <h3 className="font-bold text-gray-900 truncate text-sm md:text-base leading-tight">
                                        {item.name}
                                    </h3>
                                    <div className="flex items-center gap-1.5 md:gap-2 text-[10px] md:text-xs mt-0.5">
                                        <span className="text-gray-400 font-mono">{item.ticker}</span>
                                        <span className={`font-bold ${isBuy ? 'text-red-500' : 'text-blue-500'}`}>
                                            {formatMoney(item.value)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 자물쇠 오버레이 */}
                            {isLocked && (
                                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/10 rounded-2xl backdrop-blur-[1px]">
                                    <button 
                                        onClick={() => {
                                            supabase.auth.signInWithOAuth({
                                                provider: 'kakao',
                                                options: {
                                                    redirectTo: `${location.origin}/auth/callback`,
                                                    queryParams: { scope: 'profile_nickname,profile_image' },
                                                },
                                            });
                                        }} 
                                        className="bg-white shadow-xl px-3 py-2 md:px-4 md:py-2.5 rounded-full flex items-center gap-1.5 md:gap-2 cursor-pointer hover:scale-105 transition-transform border border-gray-100"
                                    >
                                        <span className="text-base md:text-lg">🔒</span>
                                        <span className="text-xs md:text-sm font-bold text-gray-800">
                                            로그인하고 {rank}위 보기
                                        </span>
                                    </button>
                                </div>
                            )}

                            {!isLocked && (
                                <Link 
                                    href={`/flow?ticker=${item.ticker}&fileTicker=${encodeURIComponent(item.fileTicker)}&side=${side}&days=${days}`}
                                    className="absolute inset-0 z-0"
                                />
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