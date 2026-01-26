'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------
// 1. 아이콘 컴포넌트
// ---------------------------------------------------------
const ChevronLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

// ---------------------------------------------------------
// 2. 타입 정의
// ---------------------------------------------------------
type StockData = {
  name: string;
  name_kr?: string;
  ticker: string;
  file_ticker?: string;
  close?: number;
  price_change: number;
  net_buy_sum: number;
  comment?: string;
  score?: number;
};

type Props = {
  fire?: StockData | StockData[];
  top?: StockData | StockData[];
  bottom?: StockData | StockData[];
  knife?: StockData | StockData[];
  isPremium?: boolean; 
};

// ---------------------------------------------------------
// 3. 날짜 네비게이터
// ---------------------------------------------------------
function DateNavigator({ currentDate, onDateChange }: { currentDate: Date, onDateChange: (date: Date) => void }) {
  const getAdjacentBusinessDay = (baseDate: Date, direction: 'prev' | 'next') => {
    const newDate = new Date(baseDate);
    const step = direction === 'next' ? 1 : -1;
    newDate.setDate(newDate.getDate() + step);
    while (newDate.getDay() === 0 || newDate.getDay() === 6) {
        newDate.setDate(newDate.getDate() + step);
    }
    return newDate;
  };

  const formatDateSimple = (date: Date) => {
    const dayName = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
    return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')} (${dayName})`;
  };

  const prevDate = getAdjacentBusinessDay(currentDate, 'prev');
  const nextDate = getAdjacentBusinessDay(currentDate, 'next');
  const isToday = currentDate.toDateString() === new Date().toDateString();
  const isNextFuture = nextDate > new Date();

  return (
    <div className="flex flex-col items-center justify-center mt-8 mb-4">
      <div className="flex items-center justify-center gap-2 sm:gap-4 select-none">
        <div className="hidden sm:flex w-24 justify-center">
            <button onClick={() => onDateChange(prevDate)} className="text-xs font-medium text-gray-300 hover:text-gray-500 transition-colors transform scale-90">
                {formatDateSimple(prevDate)}
            </button>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-full shadow-sm border border-gray-100 dark:border-gray-700">
            <button onClick={() => onDateChange(prevDate)} className="p-1 rounded-full hover:bg-gray-200 transition text-gray-400 hover:text-gray-900">
                <ChevronLeftIcon />
            </button>
            <span className="text-sm sm:text-lg font-extrabold text-gray-900 dark:text-white font-mono tracking-tighter min-w-[130px] text-center">
            {formatDateSimple(currentDate)}
            </span>
            <button onClick={() => !isToday && onDateChange(nextDate)} disabled={isToday} className={`p-1 rounded-full transition ${isToday ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200'}`}>
                <ChevronRightIcon />
            </button>
        </div>
        <div className="hidden sm:flex w-24 justify-center">
            {!isNextFuture ? (
                <button onClick={() => onDateChange(nextDate)} className="text-xs font-medium text-gray-300 hover:text-gray-500 transition-colors transform scale-90">
                    {formatDateSimple(nextDate)}
                </button>
            ) : <span className="text-[10px] text-gray-200 font-light">내일</span>}
        </div>
      </div>
      {!isToday && (
        <div className="mt-3 flex items-center gap-2 animate-pulse">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">🕰️ 타임머신 ON</span>
            <button onClick={() => onDateChange(new Date())} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition shadow-sm">↺ 오늘로 복귀</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 3. 메인 컴포넌트: 놈놈놈 차트
// ---------------------------------------------------------
export default function NomNomChart({ fire: initialFire, top: initialTop, bottom: initialBottom, knife: initialKnife, isPremium = false }: Props) {
  
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // 모바일 슬라이드용 인덱스
  const [slideIndex, setSlideIndex] = useState(0);

  const nextSlide = () => setSlideIndex((prev) => Math.min(prev + 1, 3));
  const prevSlide = () => setSlideIndex((prev) => Math.max(prev - 1, 0));

  // PC화면(md 이상) 되면 슬라이드 초기화
  useEffect(() => {
    const handleResize = () => {
        if (window.innerWidth >= 768) { 
            setSlideIndex(0);
        }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const normalize = (d: StockData | StockData[] | undefined) => {
      if (!d) return [];
      return Array.isArray(d) ? d : [d];
  };

  const [data, setData] = useState({
    fire: normalize(initialFire),
    top: normalize(initialTop),
    bottom: normalize(initialBottom),
    knife: normalize(initialKnife),
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPastData = async () => {
      const today = new Date();
      const dateStr = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`;
      const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

      if (dateStr === todayStr) {
         setData({ fire: normalize(initialFire), top: normalize(initialTop), bottom: normalize(initialBottom), knife: normalize(initialKnife) });
         return;
      }

      setIsLoading(true);
      try {
        const res = await fetch(`/data/history/history_${dateStr}.json`);
        if (!res.ok) throw new Error("데이터 없음");
        const json = await res.json();
        setData({ fire: normalize(json.fire), top: normalize(json.top), bottom: normalize(json.bottom), knife: normalize(json.knife) });
      } catch (error) {
        setData({ fire: [], top: [], bottom: [], knife: [] });
      } finally {
        setIsLoading(false);
      }
    };
    fetchPastData();
  }, [currentDate, initialFire, initialTop, initialBottom, initialKnife]);

  // ✨ 개별 카드 렌더링
  const renderCards = (dataList: StockData[], type: 'fire'|'top'|'bottom'|'knife') => {
    
    if (isLoading) {
        return (
            <>
                <div className="h-14 bg-gray-50 rounded-xl animate-pulse mx-1 my-1"></div>
                <div className="h-14 bg-gray-50 rounded-xl animate-pulse mx-1 my-1"></div>
            </>
        );
    }

    const emptyMessages = { fire: "데이터 없음", top: "데이터 없음", bottom: "데이터 없음", knife: "데이터 없음" };

    if (!dataList || dataList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-8 text-gray-300">
            <span className="text-2xl mb-1 grayscale opacity-30">🙅‍♂️</span>
            <span className="text-xs font-medium">{emptyMessages[type]}</span>
        </div>
      );
    }

    return dataList.map((cardData, idx) => {
        const pct = (cardData.price_change * 100).toFixed(1);
        const linkTicker = cardData.file_ticker || cardData.ticker; 
        const displayName = cardData.name_kr && cardData.name_kr.trim() !== "" ? cardData.name_kr : cardData.name;
        const primarySrc = `/logos/${encodeURIComponent(cardData.name)}.png`;
        const secondarySrc = `/logos/${encodeURIComponent(cardData.ticker)}.png`;

        const RankBadge = () => {
            if (idx === 0) return <span className="bg-yellow-400 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-sm mr-2">1위</span>;
            return <span className="bg-gray-200 text-gray-500 text-[10px] font-extrabold px-1.5 py-0.5 rounded mr-2">2위</span>;
        };

        return (
          <div key={`${cardData.ticker}-${idx}`}>
             <Link href={`/flow?ticker=${cardData.ticker}&fileTicker=${encodeURIComponent(linkTicker)}&side=netBuy&days=5`} className="block group">
                <div className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors">
                    
                    {/* 왼쪽: 순위 + 로고 + 이름 */}
                    <div className="flex items-center gap-2 overflow-hidden flex-1">
                        <RankBadge />
                        <div className="w-9 h-9 flex-shrink-0 rounded-full bg-white border border-gray-100 p-0.5 shadow-sm group-hover:scale-105 transition-transform">
                            <img src={primarySrc} alt={cardData.name} className="w-full h-full object-cover rounded-full" 
                                onError={(e) => { 
                                    const target = e.currentTarget;
                                    if (!target.src.includes(encodeURIComponent(cardData.ticker)) && !target.src.includes('_us.png')) {
                                        target.src = secondarySrc;
                                    } else { target.src = '/logos/_us.png'; }
                                }} 
                            />
                        </div>
                        <div className="flex flex-col min-w-0">
                            <h3 className="text-sm font-bold text-gray-900 truncate leading-tight group-hover:text-blue-600 transition-colors">{displayName}</h3>
                            <span className="text-[10px] font-bold text-gray-400 font-mono">{cardData.ticker}</span>
                        </div>
                    </div>

                    {/* 오른쪽: 등락률 & 가격 */}
                    <div className="text-right pl-2">
                        {/* 등락률: text-base (적당히) */}
                        <div className={`text-base font-extrabold ${Number(pct) > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                            {Number(pct) > 0 ? '+' : ''}{pct}%
                        </div>
                        {/* 가격: text-xs (기존보다 키움) */}
                        {cardData.close && (
                            <div className="text-xs text-gray-500 font-medium mt-0.5">
                                ${cardData.close.toFixed(2)}
                            </div>
                        )}
                    </div>
                </div>
            </Link>
            
            {/* 1위와 2위 사이 구분선 */}
            {idx < dataList.length - 1 && (
                <div className="h-px bg-gray-50 mx-3"></div>
            )}
          </div>
        );
    });
  };

  // ✨ 테마 그룹 (1줄 슬림 헤더)
  const renderThemeGroup = (title: string, desc: string, dataList: StockData[], type: 'fire'|'top'|'bottom'|'knife') => {
      const themes = {
        fire: { bg: "bg-red-50/80", border: "border-red-100", title: "text-red-700", desc: "text-red-500" },
        top: { bg: "bg-orange-50/80", border: "border-orange-100", title: "text-orange-700", desc: "text-orange-500" },
        bottom: { bg: "bg-blue-50/80", border: "border-blue-100", title: "text-blue-700", desc: "text-blue-500" },
        knife: { bg: "bg-gray-100/80", border: "border-gray-200", title: "text-gray-700", desc: "text-gray-500" }
      };
      
      const t = themes[type];

      return (
        <div className={`w-full flex-shrink-0 md:w-auto snap-center bg-white rounded-2xl border border-gray-100 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex flex-col h-full overflow-hidden hover:border-gray-200 transition-colors`}>
            
            {/* Header Block: padding 줄여서 공간 확보 (px-4 -> px-3) */}
            <div className={`px-3 py-3 ${t.bg} border-b ${t.border} flex items-center gap-2`}>
                <span className={`text-base font-black tracking-tight ${t.title}`}>{title}</span>
                <span className="text-[10px] text-gray-400 opacity-50">|</span>
                <span className={`text-xs font-bold opacity-90 ${t.desc}`}>{desc}</span>
            </div>

            {/* Body List */}
            <div className="p-2 flex flex-col gap-1 flex-1 bg-white min-h-[140px]">
                {renderCards(dataList, type)}
            </div>
        </div>
      );
  };

  return (
    // ✨ [핵심 수정] 모바일 여백 px-2로 축소 (와이드 효과) / PC는 px-4 유지
    <section className="max-w-5xl mx-auto px-0.8 md:px-4 mb-12">
      <div className="mb-4 flex items-end justify-between px-1.5 md:px-0">
        <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">🤔 매수/매도가 고민될 때... 💭</h2>
            <p className="text-sm text-gray-500 mt-1">최근 <span className="font-bold text-gray-800">5일간</span> 주가 패턴을 AI로 분석합니다.</p>
        </div>
        <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-full border ${currentDate.toDateString() === new Date().toDateString() ? 'bg-green-50 border-green-100' : 'bg-gray-100 border-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${currentDate.toDateString() === new Date().toDateString() ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
            <span className={`text-[10px] font-bold ${currentDate.toDateString() === new Date().toDateString() ? 'text-green-700' : 'text-gray-500'}`}>
                {currentDate.toDateString() === new Date().toDateString() ? 'Live' : 'Record'}
            </span>
        </div>
      </div>

      {/* 모바일: 슬라이드 / 데스크탑: 2x2 그리드 */}
      <div className="relative overflow-hidden md:overflow-visible">
          
          {/* 모바일 전용 버튼 */}
          {slideIndex > 0 && (
            <button 
                onClick={prevSlide} 
                className="md:hidden absolute left-0 top-1/2 -translate-y-1/2 mt-4.5 z-20 w-8 h-8 bg-white/30 backdrop-blur-[2px] shadow-sm rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-95 transition-all"
            >
                <ChevronLeftIcon />
            </button>
          )}
          
          {slideIndex < 3 && (
            <button 
                onClick={nextSlide} 
                className="md:hidden absolute right-0 top-1/2 -translate-y-1/2 mt-4.5 z-20 w-8 h-8 bg-white/30 backdrop-blur-[2px] shadow-sm rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 active:scale-95 transition-all"
            >
                <ChevronRightIcon />
            </button>
          )}

          {/* 트랙 */}
          <div 
            className="flex transition-transform duration-300 ease-out md:grid md:grid-cols-2 md:gap-6 md:transform-none"
            style={{ transform: `translateX(-${slideIndex * 100}%)` }} 
          >
            {renderThemeGroup("🚀 주가 상승", "개미 털고 떡상 중", data.fire, 'fire')}
            {renderThemeGroup("🚨 고점 경보", "개미 몰림 구간 · 고점 판독기 삐빅", data.top, 'top')}
            {renderThemeGroup("💰 공포 줍줍", "공포에 주워, 환희에 팔자!", data.bottom, 'bottom')}
            {renderThemeGroup("⛔ 칼날 주의", "개미가 다 받아낸 자리 · 추가 하락 가능성", data.knife, 'knife')}
          </div>

      </div>

      {/* 모바일 인디케이터 */}
      <div className="flex md:hidden justify-center gap-1.5 mt-4">
        {[0, 1, 2, 3].map((idx) => (
            <div key={idx} className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === slideIndex ? 'bg-gray-800' : 'bg-gray-300'}`}></div>
        ))}
      </div>

      <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
      
    </section>
  );
}