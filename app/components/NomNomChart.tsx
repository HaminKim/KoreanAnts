'use client';

import Link from 'next/link';
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
  onOpenGuide?: () => void; // (혹시 나중에 쓸 수도 있으니 타입은 남겨둠)
};

export default function NomNomChart({ fire, top, bottom, knife, isPremium = false }: Props) {
  
  const cardBase = "relative z-10 rounded-2xl flex flex-row items-center justify-between p-4 h-[110px] border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-pointer overflow-hidden bg-white group";
  const emptyStyle = "bg-gray-50 border-gray-200 opacity-70 cursor-not-allowed hover:none justify-center";

  const renderCard = (data: StockData | undefined, type: 'fire'|'top'|'bottom'|'knife') => {
    const config = {
      fire:   { 
        badge: "🔥 Hot", 
        bg: "bg-red-50/40 border-red-100 hover:border-red-300",   
        text: "text-red-600",
        commentBg: "bg-red-100/50 text-red-700 border-red-200/60",
        comment: "개미 털고 세력 상승 🚀",
      },
      top:    { 
        badge: "🚨 Warn",  
        bg: "bg-orange-50/40 border-orange-100 hover:border-orange-300", 
        text: "text-orange-600", 
        commentBg: "bg-orange-100/50 text-orange-700 border-orange-200/60",
        comment: "고점 추격 매수 주의 ⚠️",
      },
      bottom: { 
        badge: "💰 Buy",   
        bg: "bg-blue-50/40 border-blue-100 hover:border-blue-300",  
        text: "text-blue-600",
        commentBg: "bg-blue-100/50 text-blue-700 border-blue-200/60",
        comment: "공포에 줍줍할 기회 💎",
      },
      knife:  { 
        badge: "🔪 Stop",  
        bg: "bg-gray-100/60 border-gray-200 hover:border-gray-400",  
        text: "text-gray-600",  
        commentBg: "bg-gray-200/50 text-gray-700 border-gray-300/60",
        comment: "떨어지는 칼날 주의 🩸",
      }
    }[type];

    const isLocked = false; 

    if (!data) {
      return (
        <div className={`${cardBase} ${emptyStyle}`}>
          <div className="flex flex-col items-center text-center">
            <span className="text-2xl mb-1 grayscale opacity-50">🔭</span>
            <h3 className="text-xs font-bold text-gray-400">종목 탐색 중</h3>
          </div>
        </div>
      );
    }

    const pct = (data.price_change * 100).toFixed(1);
    const linkTicker = data.file_ticker || data.ticker; 

    return (
      <div className="relative w-full">
         {isLocked && <PremiumLock />}
         
         <Link 
            href={isLocked ? '#' : `/flow?ticker=${data.ticker}&fileTicker=${encodeURIComponent(linkTicker)}&side=netBuy&days=5`} 
            className={`block w-full ${isLocked ? 'blur-sm pointer-events-none' : ''}`}
         >
          <div className={`${cardBase} ${config.bg}`}>
            
            <div className="flex items-center gap-3 overflow-hidden flex-1">
               <div className="w-12 h-12 flex-shrink-0 rounded-full bg-white border border-gray-100 p-0.5 shadow-sm group-hover:scale-105 transition-transform">
                  <img 
                    src={`/logos/${encodeURIComponent(linkTicker)}.png`} 
                    alt={data.name}
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => { e.currentTarget.src = '/logos/_us.png'; }}
                  />
               </div>

               <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center gap-1.5 mb-0.5">
                     <span className="text-[10px] font-bold text-gray-500 bg-white border border-gray-200 px-1.5 rounded font-mono">
                        {data.ticker}
                     </span>
                     <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-gray-100/50 ${config.text} bg-white/80`}>
                        {config.badge}
                     </span>
                  </div>
                  <h3 className="text-sm font-bold text-gray-900 truncate">
                    {data.name}
                  </h3>
               </div>
            </div>

            <div className="flex flex-col items-end justify-center flex-shrink-0 pl-1 text-right gap-0.5">
               <span className="text-[10px] font-medium text-gray-400">5일 기준</span>
               <div className={`text-lg font-extrabold flex items-center gap-0.5 leading-none mb-1 ${Number(pct) > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                 {Number(pct) > 0 ? '▲' : '▼'}{Math.abs(Number(pct))}%
               </div>
               <div className={`px-2 py-1 rounded-md border text-[10px] font-bold shadow-sm ${config.commentBg}`}>
                 {config.comment}
               </div>
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
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            🧭 AI 놈놈놈 분석
            </h2>
            <p className="text-sm text-gray-500 mt-1">
                최근 <span className="font-bold text-gray-800">5일간</span> 수급과 주가 패턴을 분석합니다.
            </p>
        </div>

        {/* ✨ 수정됨: 버튼 삭제하고 Live 뱃지만 남김 */}
        <div className="hidden md:flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-full border border-green-100">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            <span className="text-[10px] font-bold text-green-700">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {renderCard(fire, 'fire')}
        {renderCard(top, 'top')}
        {renderCard(bottom, 'bottom')}
        {renderCard(knife, 'knife')}
      </div>
    </section>
  );
}