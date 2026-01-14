'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
// 👇 [중요] Supabase 클라이언트 가져오기 (AuthButton과 동일한 방식)
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
  
  // 👇 Supabase 클라이언트 생성
  const supabase = createClient();

  // ----------------------------------------------------------------------
  // 1. 상태 관리
  // ----------------------------------------------------------------------
  const [side, setSide] = useState<'netBuy' | 'netSell'>('netBuy');
  const [days, setDays] = useState(5);
  const [topN, setTopN] = useState<10 | 20 | 30>(30); 

  const [items, setItems] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  // 🔒 로그인 상태 (초기값 false)
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  // 💰 (미래 대비) 유저 등급 상태 ('user', 'premium', 'admin' 등)
  const [userRole, setUserRole] = useState<string | null>(null);

  const isBuy = side === 'netBuy';

  // ----------------------------------------------------------------------
  // ✨ [핵심] 로그인 상태 실시간 감지 & DB 권한 확인
  // ----------------------------------------------------------------------
  useEffect(() => {
    const checkUser = async () => {
      // 1. 현재 세션 가져오기
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        setIsLoggedIn(true);

        // 🚀 [미래 대비] 나중에 결제 기능을 붙일 때 이 부분을 활성화하면 됩니다!
        // 지금은 로그인만 하면 다 보여주니까 주석 처리하거나 role 확인만 해둡니다.
        /*
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', session.user.id)
          .single();
        
        setUserRole(userData?.role || 'user');
        */
      } else {
        setIsLoggedIn(false);
        setUserRole(null);
      }
    };

    checkUser();

    // 2. 로그인/로그아웃 이벤트 리스너 (AuthButton 눌렀을 때 즉시 반응)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, [supabase]);


  // ----------------------------------------------------------------------
  // 2. URL <-> State 동기화
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
  // 3. 데이터 로드 및 매핑
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

  // ✨ [2단계 준비] 권한 체크 로직
  // 지금은: 로그인만 하면 통과 (isLoggedIn)
  // 나중엔: isLoggedIn && userRole === 'premium' 으로 바꾸면 끝!
  const hasAccess = isLoggedIn; 

  // ----------------------------------------------------------------------
  // 4. 렌더링
  // ----------------------------------------------------------------------
  return (
    <>
      {/* 헤더 라인 */}
      <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 mb-6 mt-2">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-gray-900 leading-none">
            📊 실시간 수급 랭킹
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse mb-4"></span>
          </h2>
          
          {/* TOP 버튼 그룹 */}
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

      {/* 필터 라인 */}
      <div className="flex flex-wrap items-center gap-4 mb-8">
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

      {loading && (
          <div className="py-20 text-center text-gray-400 flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-400 rounded-full animate-spin"></div>
              <span>데이터 분석 중...</span>
          </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {visibleItems.map((item, index) => {
                const rank = index + 1;
                
                // 🔒 자물쇠 로직 (1, 2, 3위 && 권한 없음)
                // hasAccess 변수 하나만 바꾸면 나중에 유료화 전환 가능!
                const isLocked = !hasAccess && index < 3;

                return (
                    <div key={item.fileTicker + index} className="relative group">
                        
                        {/* 카드 본문 (잠금 시 블러) */}
                        <div className={`
                            flex items-center gap-4 p-4 rounded-2xl border transition-all bg-white
                            ${isLocked ? 'blur-md opacity-60 pointer-events-none select-none grayscale' : 'hover:shadow-lg hover:-translate-y-1'}
                            ${isBuy ? 'hover:border-red-100 border-gray-100' : 'hover:border-blue-100 border-gray-100'}
                        `}>
                            <div className={`
                                w-8 h-8 flex items-center justify-center rounded-lg font-black text-lg shadow-sm shrink-0
                                ${rank <= 5 
                                    ? (isBuy ? 'bg-red-500 text-white' : 'bg-blue-500 text-white') 
                                    : 'bg-gray-100 text-gray-500'}
                            `}>
                                {rank}
                            </div>

                            <div className="w-12 h-12 rounded-full bg-white border border-gray-100 p-0.5 shrink-0 overflow-hidden">
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

                            <div className="min-w-0 flex-1">
                                <h3 className="font-bold text-gray-900 truncate text-sm md:text-base">
                                    {item.name}
                                </h3>
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-400 font-mono">{item.ticker}</span>
                                    <span className={`font-bold ${isBuy ? 'text-red-500' : 'text-blue-500'}`}>
                                        {formatMoney(item.value)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 🔒 자물쇠 오버레이 (클릭 시 카카오 로그인 실행) */}
                        {isLocked && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/10 rounded-2xl backdrop-blur-[1px]">
                                <button 
                                     onClick={() => {
                                        // 🟡 카카오 로그인 트리거 (AuthButton과 동일한 로직)
                                        supabase.auth.signInWithOAuth({
                                            provider: 'kakao',
                                            options: {
                                                redirectTo: `${location.origin}/auth/callback`,
                                                queryParams: { scope: 'profile_nickname,profile_image' },
                                            },
                                        });
                                     }} 
                                     className="bg-white shadow-xl px-4 py-2.5 rounded-full flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform border border-gray-100"
                                >
                                    <span className="text-lg">🔒</span>
                                    <span className="text-sm font-bold text-gray-800">
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
      )}
    </>
  );
}