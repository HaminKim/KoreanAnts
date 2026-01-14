'use client';

import Link from 'next/link';
import { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import HomeClient from './HomeClient';
import NomNomChart from './components/NomNomChart';
import Footer from './components/Footer';
import IntroModal from './components/IntroModal'; 

// 🛠️ 타입 정의
type HookItem = {
  ticker: string;
  fileTicker: string;
  name: string;
  value: number;
  type: 'buy' | 'sell';
};

// 놈놈놈 데이터 타입
type NomData = {
  fire?: any;
  top?: any;
  bottom?: any;
  knife?: any;
};

export default function Page() {
  const rankingRef = useRef<HTMLDivElement>(null);

  const scrollToRanking = () => {
    rankingRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const [marketScore, setMarketScore] = useState<number | null>(null);
  const [newsTicker, setNewsTicker] = useState<string[]>([]);
  const [hookItems, setHookItems] = useState<[HookItem | null, HookItem | null]>([null, null]);
  
  const [nomData, setNomData] = useState<NomData | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const [buyRes, sellRes, tickerMapRes, nameMapRes, nomRes] = await Promise.all([
          fetch('/data/top10/netBuy_5.json', { cache: 'no-store' }),
          fetch('/data/top10/netSell_5.json', { cache: 'no-store' }),
          fetch('/data/ticker_map.json'),
          fetch('/data/name_alias.json'),
          fetch('/data/flow/nom_nom_data.json', { cache: 'no-store' }).catch(() => null)
        ]);

        const buyJson = await buyRes.json();
        const sellJson = await sellRes.json();
        const tickerMap = await tickerMapRes.json();
        const nameMap = await nameMapRes.json();
        
        if (nomRes && nomRes.ok) {
            const nomJson = await nomRes.json();
            setNomData(nomJson);
        }

        const normalizeKey = (k: string) => k.toUpperCase().trim();
        const normalizedTickerMap: Record<string, string> = {};
        const normalizedNameMap: Record<string, string> = {};

        Object.entries(tickerMap).forEach(([k, v]) => normalizedTickerMap[normalizeKey(k)] = String(v));
        Object.entries(nameMap).forEach(([k, v]) => normalizedNameMap[normalizeKey(k)] = String(v));

        const enrichItem = (item: any, type: 'buy' | 'sell'): HookItem => {
          const rawName = (item.ticker || '').trim();
          const lookupKey = normalizeKey(rawName);
          const shortTicker = normalizedTickerMap[lookupKey] || rawName;
          const koreanName = normalizedNameMap[lookupKey] || shortTicker;

          return {
            ticker: shortTicker,
            fileTicker: rawName,
            name: koreanName,
            value: item.value,
            type
          };
        };

        const buyItemsRaw = (buyJson.items ?? []).slice(0, 20);
        const sellItemsRaw = (sellJson.items ?? []).slice(0, 20);

        const top10Buys = buyItemsRaw.slice(0, 10);
        const top10Sells = sellItemsRaw.slice(0, 10);
        const buyPower = top10Buys.reduce((acc: number, cur: any) => acc + (cur.value > 0 ? cur.value : 0), 0);
        const sellPower = top10Sells.reduce((acc: number, cur: any) => acc + Math.abs(cur.value < 0 ? cur.value : 0), 0);
        const totalVolume = buyPower + sellPower;
        setMarketScore(totalVolume === 0 ? 50 : Math.round((buyPower / totalVolume) * 100));

        let leftCard: HookItem | null = null;
        let rightCard: HookItem | null = null;
        if (buyItemsRaw.length > 0) leftCard = enrichItem(buyItemsRaw[0], 'buy');
        if (sellItemsRaw.length > 0) rightCard = enrichItem(sellItemsRaw[0], 'sell');
        setHookItems([leftCard, rightCard]);

        const newsList: string[] = [];
        if (leftCard) newsList.push(`👑 ${leftCard.name} 5일간 순매수 압도적 1위!`);
        if (rightCard) newsList.push(`📉 ${rightCard.name} 순매도 1위, 차익실현 물량 주의`);
        
        const pool = [
            ...buyItemsRaw.slice(1).map((i: any) => enrichItem(i, 'buy')),
            ...sellItemsRaw.slice(1).map((i: any) => enrichItem(i, 'sell'))
        ];
        const randomPicks = pool.sort(() => 0.5 - Math.random()).slice(0, 2);
        randomPicks.forEach(item => {
            if (item.type === 'buy') newsList.push(`🔥 ${item.name} 수급 급증! 상위권 랭크`);
            else newsList.push(`💸 ${item.name} 매도세 포착, 변동성 주의`);
        });
        setNewsTicker(newsList);

      } catch (err) {
        console.error(err);
        setMarketScore(50);
      }
    }
    fetchData();
  }, []);

  const heroContent = useMemo(() => {
    const score = marketScore ?? 50;
    if (score <= 20) return {
        badge: "🥶 EXTREME FEAR", badgeColor: "text-indigo-200 bg-indigo-900/50 border-indigo-500/50", dotColor: "bg-indigo-400",
        title: <>시장은 지금 <br className="md:hidden" />😱 <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">절망</span>에 빠져있습니다.</>,
        desc: "패닉 셀링이 속출하고 있습니다. 용기 있는 자만이 기회를 잡습니다.", gradient: "from-indigo-600 via-blue-500 to-red-500", scoreColor: "text-indigo-300"
    };
    else if (score <= 40) return {
        badge: "😨 FEAR", badgeColor: "text-blue-200 bg-blue-900/50 border-blue-500/50", dotColor: "bg-blue-400",
        title: <>개미들은 <br className="md:hidden" />🥶 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-300">공포</span>에 떨고 있습니다.</>,
        desc: "매수 심리가 위축되었습니다. 저점 매수를 고려할 구간입니다.", gradient: "from-blue-600 via-gray-400 to-red-500", scoreColor: "text-blue-300"
    };
    else if (score <= 60) return {
        badge: "😐 NEUTRAL", badgeColor: "text-gray-200 bg-gray-700/50 border-gray-500/50", dotColor: "bg-gray-400",
        title: <>지금은 <br className="md:hidden" />👀 <span className="text-transparent bg-clip-text bg-gradient-to-r from-gray-300 to-slate-300">눈치보기</span> 장세입니다.</>,
        desc: "방향성이 없습니다. 섣불리 움직이기보다 수급 주도주를 선별하세요.", gradient: "from-blue-500 via-gray-500 to-red-500", scoreColor: "text-gray-300"
    };
    else if (score <= 80) return {
        badge: "🤔 GREED", badgeColor: "text-orange-200 bg-orange-900/50 border-orange-500/50", dotColor: "bg-orange-400",
        title: <>시장에 <br className="md:hidden" />🔥 <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-300 to-amber-300">매수세</span>가 몰립니다.</>,
        desc: "주가가 오르고 있습니다. 하지만 추격 매수는 신중해야 합니다.", gradient: "from-blue-500 via-orange-400 to-red-600", scoreColor: "text-orange-300"
    };
    else return {
        badge: "🚨 EXTREME GREED", badgeColor: "text-red-200 bg-red-900/50 border-red-500/50", dotColor: "bg-red-500",
        title: <>지금은 <br className="md:hidden" />🤯 <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-rose-400">광기</span>의 투기장입니다.</>,
        desc: "위험 신호 감지! 폭탄 돌리기가 시작되었을 수 있습니다. 주의하세요.", gradient: "from-blue-500 via-red-500 to-rose-700", scoreColor: "text-red-400"
    };
  }, [marketScore]);

  const needlePosition = `${Math.min(Math.max(marketScore ?? 50, 0), 100)}%`;

  return (
    <main className="min-h-screen bg-white pb-0 relative"> 
      
      {/* ✨ [Intro] 인트로 모달 */}
      <IntroModal />

      {/* 1️⃣ [HERO] 시장 신호등 */}
      <section className="bg-slate-900 text-white pt-8 pb-16 px-4 rounded-b-[2.5rem] shadow-2xl relative overflow-hidden mb-12">
        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600 rounded-full mix-blend-overlay filter blur-[100px] opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-600 rounded-full mix-blend-overlay filter blur-[80px] opacity-20"></div>

        <div className="max-w-4xl mx-auto relative z-10 text-center">
          <div className={`inline-flex items-center gap-1.5 py-1 px-3 rounded-full border text-[10px] font-bold tracking-wider mb-6 backdrop-blur-md transition-colors duration-500 ${heroContent.badgeColor}`}>
            <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${heroContent.dotColor}`}></span>
            {marketScore === null ? "CALCULATING..." : heroContent.badge}
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold mb-4 leading-tight transition-all duration-500">
            {marketScore === null ? <span className="opacity-50">데이터 분석 중...</span> : heroContent.title}
          </h1>

          <p className="text-gray-400 text-sm md:text-base font-medium mb-8">
            개미 탐욕 지수 <span className={`font-bold text-lg ${heroContent.scoreColor}`}>{marketScore ?? '--'}</span>. {heroContent.desc}
          </p>

          <div className="relative max-w-md mx-auto h-4 bg-gray-800/50 rounded-full overflow-hidden mb-2 ring-1 ring-white/10">
             <div className={`absolute inset-0 bg-gradient-to-r ${heroContent.gradient} opacity-70`}></div>
             <div className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_10px_white] transition-all duration-1000 ease-out" style={{ left: needlePosition }}></div>
          </div>
        </div>
      </section>

      {/* 2️⃣ [TICKER] 속보 띠 */}
      <div className="max-w-4xl mx-auto px-4 -mt-20 relative z-30 mb-8">
        <div className="bg-yellow-400 text-black text-xs font-bold py-3 px-4 rounded-lg shadow-lg flex items-center gap-3 overflow-hidden whitespace-nowrap border-b-4 border-yellow-600">
          <span className="bg-black text-yellow-400 px-1.5 py-0.5 rounded text-[10px] animate-pulse">LIVE</span>
          <div className="flex gap-6 animate-marquee">
            {newsTicker.length > 0 ? [...newsTicker, ...newsTicker].map((news, i) => (
                <div key={i} className="flex items-center gap-6"><span>{news}</span><span className="opacity-20 text-[10px]">|</span></div>
            )) : <span>📊 데이터를 불러오는 중입니다...</span>}
          </div>
        </div>
      </div>

      {/* 3️⃣ [HOOK] 추천 카드 */}
      <section className="max-w-5xl mx-auto px-4 mb-8">
        <div className="grid grid-cols-2 gap-3">
          
          {/* [Left] 줍줍 1위 */}
          {hookItems[0] ? (
            <Link 
              href={`/flow?ticker=${hookItems[0].ticker}&fileTicker=${hookItems[0].fileTicker}&side=netBuy&days=5`} 
              className="group h-full"
            >
              <div className="bg-white rounded-xl p-4 shadow-lg border-t-4 border-blue-500 hover:-translate-y-1 transition duration-300 h-full flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-3 right-3 w-12 h-12 rounded-full border border-gray-100 bg-white p-0.5 shadow-sm group-hover:scale-110 transition">
                  <img 
                    src={`/logos/${encodeURIComponent(hookItems[0].name)}.png`} 
                    alt={hookItems[0].name}
                    className="w-full h-full rounded-full object-cover"
                    onError={(e) => { 
                      const img = e.currentTarget;
                      if (hookItems[0] && !img.src.includes(encodeURIComponent(hookItems[0].ticker))) {
                        img.src = `/logos/${encodeURIComponent(hookItems[0].ticker)}.png`;
                      } else {
                        img.src = '/logos/_us.png';
                      }
                    }}
                  />
                </div>
                
                <div>
                  <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-2 py-1 rounded-full">💎 순매수 1위</span>
                  <div className="mt-3 mb-1 pr-12">
                    <h3 className="text-lg font-bold text-gray-900 leading-tight group-hover:text-blue-600 transition break-keep">
                      {hookItems[0].name}
                    </h3>
                    <span className="text-xs text-gray-400 font-mono">{hookItems[0].ticker}</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-dashed border-gray-100">
                  <p className="text-xs text-gray-500 leading-tight">
                    개미들이 가장 많이 <br/><span className="text-blue-600 font-bold">쓸어 담은 종목</span>
                  </p>
                </div>
              </div>
            </Link>
          ) : (
            <div className="bg-gray-100 rounded-xl h-32 animate-pulse"></div>
          )}

          {/* [Right] 매도 1위 */}
          {hookItems[1] ? (
            <Link 
              href={`/flow?ticker=${hookItems[1].ticker}&fileTicker=${hookItems[1].fileTicker}&side=netSell&days=5`} 
              className="group h-full"
            >
              <div className="bg-white rounded-xl p-4 shadow-lg border-t-4 border-red-500 hover:-translate-y-1 transition duration-300 h-full flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-3 right-3 w-12 h-12 rounded-full border border-gray-100 bg-white p-0.5 shadow-sm group-hover:scale-110 transition">
                  <img 
                    src={`/logos/${encodeURIComponent(hookItems[1].name)}.png`} 
                    alt={hookItems[1].name}
                    className="w-full h-full rounded-full object-cover"
                    onError={(e) => { 
                      const img = e.currentTarget;
                      if (hookItems[1] && !img.src.includes(encodeURIComponent(hookItems[1].ticker))) {
                        img.src = `/logos/${encodeURIComponent(hookItems[1].ticker)}.png`;
                      } else {
                        img.src = '/logos/_us.png';
                      }
                    }}
                  />
                </div>
                
                <div>
                  <span className="bg-red-50 text-red-600 text-[10px] font-bold px-2 py-1 rounded-full">🚧 순매도 1위</span>
                  <div className="mt-3 mb-1 pr-12">
                    <h3 className="text-lg font-bold text-gray-900 leading-tight group-hover:text-red-600 transition break-keep">
                      {hookItems[1].name}
                    </h3>
                    <span className="text-xs text-gray-400 font-mono">{hookItems[1].ticker}</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-dashed border-gray-100">
                  <p className="text-xs text-gray-500 leading-tight">
                    개미들이 가장 많이 <br/><span className="text-red-500 font-bold">던지고 떠난 종목</span>
                  </p>
                </div>
              </div>
            </Link>
          ) : (
             <div className="bg-gray-100 rounded-xl h-32 animate-pulse"></div>
          )}

        </div>
      </section>

      {/* 4️⃣ [놈놈놈] 차트 */}
      <section className="max-w-5xl mx-auto px-4 mb-2">
         <NomNomChart 
           fire={nomData?.fire} 
           top={nomData?.top} 
           bottom={nomData?.bottom} 
           knife={nomData?.knife} 
         />
      </section>

      {/* 5️⃣ [DATA] Top 10 리스트 (타이틀 제거됨) */}
      <section ref={rankingRef} className="max-w-7xl mx-auto px-4 scroll-mt-20">
        <Suspense fallback={<div className="text-center py-20 text-gray-400">데이터를 불러오는 중입니다...</div>}>
          <HomeClient />
        </Suspense>
      </section>

      {/* 6️⃣ 푸터 */}
      <Footer />

      {/* ✨ 하단 플로팅 버튼 */}
      <div className="fixed bottom-6 left-0 w-full px-4 z-50 pointer-events-none">
        <div className="max-w-md mx-auto flex items-center justify-center gap-3">
            <button 
                onClick={scrollToRanking}
                className="pointer-events-auto bg-gray-900 text-white shadow-2xl pl-5 pr-6 py-3 rounded-full flex items-center gap-2 border border-white/10 active:scale-95 transition-transform h-14"
            >
                <span className="text-sm font-bold">📊 랭킹 보러가기</span>
            </button>
            <Link 
                href="/analysis"
                className="pointer-events-auto bg-blue-600 text-white shadow-2xl pl-4 pr-6 py-3 rounded-full flex items-center gap-2.5 border border-white/10 active:scale-95 transition-transform h-14"
            >
                <span className="text-xl">🔍</span>
                <div className="flex flex-col items-start leading-none">
                    <span className="text-[10px] text-blue-100 font-medium mb-0.5">티커로 검색하는</span>
                    <span className="text-sm font-bold">내 종목 분석</span>
                </div>
            </Link>
        </div>
      </div>

    </main>
  );
}