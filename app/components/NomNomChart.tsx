'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

// ---------------------------------------------------------
// 1. 타입 정의
// ---------------------------------------------------------
type StockData = {
  name: string;
  ticker: string;
  file_ticker?: string;
  close: number;
  price_change: number;
  net_buy_sum: number;
};

type Props = {
  fire?: StockData;
  top?: StockData;
  bottom?: StockData;
  knife?: StockData;
  isPremium?: boolean; 
};

// ---------------------------------------------------------
// 2. 내부 컴포넌트: 휠 스타일 날짜 네비게이터
// ---------------------------------------------------------
function DateNavigator({ currentDate, onDateChange }: { currentDate: Date, onDateChange: (date: Date) => void }) {
  
  const getOffsetDate = (date: Date, offset: number) => {
    const newDate = new Date(date);
    newDate.setDate(date.getDate() + offset);
    return newDate;
  };

  const formatDateSimple = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}. ${month}. ${day}`;
  };

  const prevDate = getOffsetDate(currentDate, -1);
  const nextDate = getOffsetDate(currentDate, 1);

  const today = new Date();
  const isToday =
    currentDate.getDate() === today.getDate() &&
    currentDate.getMonth() === today.getMonth() &&
    currentDate.getFullYear() === today.getFullYear();

  const isNextFuture = nextDate > today;

  return (
    <div className="flex flex-col items-center justify-center mt-8 mb-4"> {/* 👈 위쪽 여백(mt-8) 좀 줬습니다 */}
      
      <div className="flex items-center justify-center gap-4 select-none">
        {/* [왼쪽] 어제 날짜 */}
        <button 
            onClick={() => onDateChange(prevDate)}
            className="hidden sm:block text-xs font-medium text-gray-300 hover:text-gray-500 transition-colors transform scale-90"
        >
            {formatDateSimple(prevDate)}
        </button>

        {/* [중앙] 현재 날짜 */}
        <div className="flex items-center gap-3 bg-gray-50 dark:bg-gray-800 px-4 py-2 rounded-full shadow-sm border border-gray-100 dark:border-gray-700">
            <button
            onClick={() => onDateChange(prevDate)}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition text-gray-400 hover:text-gray-900"
            >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
            </svg>
            </button>

            <span className="text-lg font-extrabold text-gray-900 dark:text-white font-mono tracking-tighter min-w-[110px] text-center">
            {formatDateSimple(currentDate)}
            </span>

            <button
            onClick={() => !isToday && onDateChange(nextDate)}
            disabled={isToday}
            className={`p-1 rounded-full transition ${
                isToday 
                ? 'text-gray-200 cursor-not-allowed' 
                : 'text-gray-400 hover:text-gray-900 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
            >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
            </button>
        </div>

        {/* [오른쪽] 내일 날짜 */}
        <div className="hidden sm:block min-w-[70px] text-center">
            {!isNextFuture ? (
                <button 
                    onClick={() => onDateChange(nextDate)}
                    className="text-xs font-medium text-gray-300 hover:text-gray-500 transition-colors transform scale-90"
                >
                    {formatDateSimple(nextDate)}
                </button>
            ) : (
                <span className="text-[10px] text-gray-200 font-light">
                    내일
                </span>
            )}
        </div>
      </div>

      {!isToday && (
        <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200 animate-pulse">
          🕰️ 타임머신 가동중..
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------
// 3. 메인 컴포넌트: 놈놈놈 차트
// ---------------------------------------------------------
export default function NomNomChart({ fire: initialFire, top: initialTop, bottom: initialBottom, knife: initialKnife, isPremium = false }: Props) {
  
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [data, setData] = useState({
    fire: initialFire,
    top: initialTop,
    bottom: initialBottom,
    knife: initialKnife,
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPastData = async () => {
      const today = new Date();
      const dateStr = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`;
      const todayStr = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;

      if (dateStr === todayStr) {
         setData({
            fire: initialFire,
            top: initialTop,
            bottom: initialBottom,
            knife: initialKnife,
         });
         return;
      }

      setIsLoading(true);

      try {
        const res = await fetch(`/data/history/history_${dateStr}.json`);
        if (!res.ok) throw new Error("데이터 없음");
        const json = await res.json();
        
        setData({
            fire: json.fire,
            top: json.top,
            bottom: json.bottom,
            knife: json.knife
        });

      } catch (error) {
        setData({ fire: undefined, top: undefined, bottom: undefined, knife: undefined });
      } finally {
        setIsLoading(false);
      }
    };

    fetchPastData();
  }, [currentDate, initialFire, initialTop, initialBottom, initialKnife]);

  const cardBase = "relative z-10 rounded-2xl flex flex-row items-center justify-between p-4 h-[110px] border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer overflow-hidden bg-white group";
  const emptyStyle = "bg-gray-50 border-gray-200 opacity-70 cursor-not-allowed hover:none justify-center";

  const renderCard = (cardData: StockData | undefined, type: 'fire'|'top'|'bottom'|'knife') => {
    if (isLoading) {
        return <div className={`${cardBase} bg-gray-50 animate-pulse border-gray-200 flex items-center justify-center opacity-70`}>
            <span className="text-sm text-gray-400 font-bold">로딩 중... ⏳</span>
        </div>;
    }

    const config = {
      fire:   { badge: "🔥 Hot", bg: "bg-red-50/40 border-red-100 hover:border-red-300", text: "text-red-600", commentBg: "bg-red-100/50 text-red-700 border-red-200/60", comment: "개미 털고 세력 상승 🚀" },
      top:    { badge: "🚨 Warn", bg: "bg-orange-50/40 border-orange-100 hover:border-orange-300", text: "text-orange-600", commentBg: "bg-orange-100/50 text-orange-700 border-orange-200/60", comment: "고점 추격 매수 주의 ⚠️" },
      bottom: { badge: "💰 Buy", bg: "bg-blue-50/40 border-blue-100 hover:border-blue-300", text: "text-blue-600", commentBg: "bg-blue-100/50 text-blue-700 border-blue-200/60", comment: "공포에 줍줍할 기회 💎" },
      knife:  { badge: "🔪 Stop", bg: "bg-gray-100/60 border-gray-200 hover:border-gray-400", text: "text-gray-600", commentBg: "bg-gray-200/50 text-gray-700 border-gray-300/60", comment: "떨어지는 칼날 주의 🩸" }
    }[type];

    if (!cardData) {
      return (
        <div className={`${cardBase} ${emptyStyle}`}>
          <div className="flex flex-col items-center text-center">
            <span className="text-2xl mb-1 grayscale opacity-50">🔭</span>
            <h3 className="text-xs font-bold text-gray-400">데이터 없음</h3>
          </div>
        </div>
      );
    }

    const pct = (cardData.price_change * 100).toFixed(1);
    const linkTicker = cardData.file_ticker || cardData.ticker; 

    return (
      <div className="relative w-full">
         <Link href={`/flow?ticker=${cardData.ticker}&fileTicker=${encodeURIComponent(linkTicker)}&side=netBuy&days=5`} className="block w-full">
          <div className={`${cardBase} ${config.bg}`}>
            <div className="flex items-center gap-3 overflow-hidden flex-1">
               <div className="w-12 h-12 flex-shrink-0 rounded-full bg-white border border-gray-100 p-0.5 shadow-sm group-hover:scale-105 transition-transform">
                  <img src={`/logos/${encodeURIComponent(linkTicker)}.png`} alt={cardData.name} className="w-full h-full object-cover rounded-full" onError={(e) => { e.currentTarget.src = '/logos/_us.png'; }} />
               </div>
               <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                     <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 px-1.5 rounded font-mono">{cardData.ticker}</span>
                     <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-gray-100/50 ${config.text} bg-white/80`}>{config.badge}</span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 truncate">{cardData.name}</h3>
               </div>
            </div>
            <div className="flex flex-col items-end justify-center flex-shrink-0 pl-1 text-right gap-0.5">
               <span className="text-[10px] font-medium text-gray-400">5일 기준</span>
               <div className={`text-lg font-extrabold flex items-center gap-0.5 leading-none mb-1 ${Number(pct) > 0 ? 'text-red-500' : 'text-blue-500'}`}>{Number(pct) > 0 ? '▲' : '▼'}{Math.abs(Number(pct))}%</div>
               <div className={`px-2 py-1 rounded-md border text-[10px] font-bold shadow-sm ${config.commentBg}`}>{config.comment}</div>
            </div>
          </div>
        </Link>
      </div>
    );
  };

  return (
    <section className="max-w-5xl mx-auto px-4 mb-12">
      <div className="mb-4 flex items-end justify-between">
        <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">🤔 매수/매도가 고민될 때... 💭</h2>
            <p className="text-sm text-gray-500 mt-1">최근 <span className="font-bold text-gray-800">5일간</span> 주가 패턴을 AI로 분석합니다.</p>
        </div>
        <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-full border ${currentDate.toDateString() === new Date().toDateString() ? 'bg-green-50 border-green-100' : 'bg-gray-100 border-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${currentDate.toDateString() === new Date().toDateString() ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></span>
            <span className={`text-[10px] font-bold ${currentDate.toDateString() === new Date().toDateString() ? 'text-green-700' : 'text-gray-500'}`}>{currentDate.toDateString() === new Date().toDateString() ? 'Live' : 'Record'}</span>
        </div>
      </div>

      {/* 1. 카드 리스트 먼저 나옴 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderCard(data.fire, 'fire')}
        {renderCard(data.top, 'top')}
        {renderCard(data.bottom, 'bottom')}
        {renderCard(data.knife, 'knife')}
      </div>

      {/* 2. 날짜 네비게이터가 아래로 이동! (mt-8로 간격 띄움) */}
      <DateNavigator currentDate={currentDate} onDateChange={setCurrentDate} />
      
    </section>
  );
}