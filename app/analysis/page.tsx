'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { funnyPhrases } from '../data/funny_loading';
import StockLogo from '../components/StockLogo';

// Data Types
type StockItem = {
  ticker: string;
  name_en: string;
  name_kr: string;
};

type AnalysisResult = {
  ticker: string;
  name_en: string;
  name_kr: string;
  price: number;
  change: number;
  score: number;
  comment: string;
};

export default function AnalysisPage() {
  const router = useRouter();
  const searchParams = useSearchParams(); 
  
  // State Management
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StockItem[]>([]);
  const [allItems, setAllItems] = useState<StockItem[]>([]);
  const [isOpen, setIsOpen] = useState(false); 

  const [step, setStep] = useState<'input' | 'loading' | 'result' | 'error'>('input');
  const [loadingText, setLoadingText] = useState(funnyPhrases[0]);
  const [resultData, setResultData] = useState<AnalysisResult | null>(null);
  const [isCopied, setIsCopied] = useState(false); 

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Recommended Stocks List
  const recommendedStocks = [
    { t: 'NVDA', n: '엔비디아', e: 'NVIDIA CORP' },
    { t: 'TSLA', n: '테슬라', e: 'TESLA INC' },
    { t: 'IONQ', n: '아이온큐', e: 'IONQ INC' },
    { t: 'GOOGL', n: '구글 (알파벳A)', e: 'ALPHABET INC' },
    { t: 'AVGO', n: '브로드컴', e: 'BROADCOM INC' },
    { t: 'BMNR', n: '비트마인', e: 'BITMINE IMMERSION TECHNOLOGIES' }
  ];

  // 1. Initial Data Loading & URL Parameter Check
  useEffect(() => {
    const loadData = async () => {
      try {
        const [aliasRes, mapRes] = await Promise.all([
          fetch('/data/name_alias.json'),
          fetch('/data/ticker_map.json')
        ]);
        const aliasData = await aliasRes.json();
        const mapData = await mapRes.json();

        const tempList: StockItem[] = [];
        Object.entries(mapData).forEach(([rawName, tickerVal]) => {
            const t = String(tickerVal).toUpperCase();
            const n = String(rawName);
            const kr = aliasData[n] || n; 
            tempList.push({ ticker: t, name_en: n, name_kr: kr });
        });
        setAllItems(tempList);

        // Auto-run if URL has ticker param
        const sharedTicker = searchParams.get('ticker');
        if (sharedTicker && tempList.length > 0) {
           startAnalysis(sharedTicker, tempList);
        }

      } catch (e) { console.error("Data loading failed", e); }
    };
    loadData();

    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []); 

  // 2. Input Handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (val.length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const lowerVal = val.toLowerCase();
    const filtered = allItems.filter(item => 
      item.ticker.toLowerCase().includes(lowerVal) || 
      item.name_en.toLowerCase().includes(lowerVal) || 
      item.name_kr.includes(val)
    ).slice(0, 5); 

    setSuggestions(filtered);
    setIsOpen(true);
  };

  const selectStock = (ticker: string) => {
    setQuery(ticker);
    setIsOpen(false);
    startAnalysis(ticker, allItems);
  };

  // 3. Analysis Logic
  const startAnalysis = async (inputTicker: string, itemsList: StockItem[] = allItems) => {
    if (!inputTicker.trim()) return;
    const targetTicker = inputTicker.toUpperCase().trim();
    
    setStep('loading');

    try {
        const res = await fetch(`/data/flow/${targetTicker}_all.json`);
        const delay = itemsList.length > 0 ? 2000 : 500; 
        await new Promise(r => setTimeout(r, delay));

        if (!res.ok) throw new Error("File not found");

        const json = await res.json();
        const daily = json.data;
        const last = daily[daily.length - 1];
        const prev = daily[daily.length - 2];
        
        // Weighted Score Calculation
        const recent10 = daily.slice(-10);
        let weightedScore = 0;
        let totalWeight = 55; // 1+2+...+10 = 55

        recent10.forEach((d: any, index: number) => {
            if (d.netBuy > 0) {
                weightedScore += (index + 1); 
            }
        });

        const antScore = Math.round((weightedScore / totalWeight) * 100);

        // AI Commentary Generation
        const buyDaysCount = recent10.filter((d: any) => d.netBuy > 0).length;
        const last3Days = recent10.slice(-3);
        const last3BuyCount = last3Days.filter((d: any) => d.netBuy > 0).length;
        
        const foundItem = itemsList.find(item => item.ticker === targetTicker);
        const stockName = foundItem ? foundItem.name_kr : (json.meta.name || targetTicker);

        let trendText = "";
        if (buyDaysCount >= 7) trendText = "지속적인 매수 우위";
        else if (buyDaysCount <= 3) trendText = "지속적인 매도 우위";
        else trendText = "매수와 매도가 팽팽한 혼조세";

        let recentActionText = "";
        if (last3BuyCount === 3) recentActionText = "최근 3일 연속 강한 매집이";
        else if (last3BuyCount === 0) recentActionText = "최근 3일 연속 자금 이탈이";
        else recentActionText = "최근 변동성 있는 흐름이";

        const aiComment = `${stockName}은(는) 지난 10거래일 동안 ${trendText}를 보였습니다. 특히 ${recentActionText} 관측되고 있습니다. ${antScore > 60 ? "과열 주의 구간입니다." : (antScore < 30 ? "침체 구간에 진입했습니다." : "관망세가 유지 중입니다.")}`;

        setResultData({
            ticker: targetTicker,
            name_en: foundItem ? foundItem.name_en : (json.meta.name || targetTicker),
            name_kr: stockName,
            price: last.price,
            change: (last.price - prev.price) / prev.price * 100,
            score: antScore,
            comment: aiComment
        });

        setStep('result');
        window.history.replaceState(null, '', `/analysis?ticker=${targetTicker}`);

    } catch (error) {
        setStep('error');
    }
  };

  // Share Button Logic
  const handleShare = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000); 
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        setIsOpen(false);
        startAnalysis(query);
    }
  };

  // Loading Message Rotation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'loading') {
      interval = setInterval(() => {
        const randomIdx = Math.floor(Math.random() * funnyPhrases.length);
        setLoadingText(funnyPhrases[randomIdx]);
      }, 700);
    }
    return () => clearInterval(interval);
  }, [step]);

  return (
    <main className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      
      <div className="p-4">
        <Link href="/" className="inline-flex items-center text-gray-500 hover:text-black transition">
          <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          메인으로
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        
        {step === 'input' && (
          <div className="w-full max-w-md animate-fade-in-up relative" ref={wrapperRef}>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">
              어떤 주식을 <br/> <span className="text-blue-600">분석</span>해 드릴까요?
            </h1>
            <p className="text-center text-gray-400 mb-8 text-sm">
              AI가 수급과 심리를 분석해 드립니다.
            </p>

            {/* Search Input */}
            <div className="relative mb-8">
              <input 
                type="text" 
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="티커(TSLA) 또는 종목명"
                className="w-full text-2xl font-bold border-b-2 border-gray-200 py-4 px-2 focus:outline-none focus:border-black placeholder-gray-300 text-center uppercase transition-colors"
                autoFocus
              />
              <button 
                onClick={() => startAnalysis(query)}
                className="absolute right-2 bottom-4 text-blue-600 hover:scale-110 transition-transform"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>

              {isOpen && suggestions.length > 0 && (
                <ul className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden text-left max-h-[300px] overflow-y-auto">
                    {suggestions.map((item) => (
                        <li 
                            key={item.ticker}
                            onClick={() => selectStock(item.ticker)}
                            className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-none flex justify-between items-center"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 p-0.5 shadow-sm overflow-hidden flex-shrink-0">
                                   <StockLogo 
                                     ticker={item.ticker} 
                                     name_en={item.name_en}
                                     name_kr={item.name_kr}
                                     className="w-full h-full object-contain rounded-full"
                                   />
                                </div>
                                <div>
                                    <span className="font-bold text-gray-800 block text-sm">{item.name_kr}</span>
                                    <span className="text-xs text-gray-400">{item.name_en}</span>
                                </div>
                            </div>
                            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded ml-2">
                                {item.ticker}
                            </span>
                        </li>
                    ))}
                </ul>
              )}
            </div>

            {/* Recommended Buttons */}
            <div className="grid grid-cols-3 gap-3">
               {recommendedStocks.map((item) => (
                 <button 
                   key={item.t}
                   onClick={() => selectStock(item.t)}
                   className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition"
                 >
                   <div className="w-10 h-10 rounded-full bg-white border border-gray-200 p-1 mb-2 shadow-sm overflow-hidden">
                     <StockLogo 
                       ticker={item.t} 
                       name_en={item.e} 
                       name_kr={item.n}
                       className="w-full h-full object-contain rounded-full"
                     />
                   </div>
                   <span className="text-xs font-bold text-gray-600 break-keep text-center leading-tight mt-1">
                     {item.n}
                   </span>
                 </button>
               ))}
            </div>
          </div>
        )}

        {/* Loading Screen */}
        {step === 'loading' && (
          <div className="text-center animate-pulse flex flex-col items-center">
            <div className="w-20 h-20 mb-6 bg-blue-50 rounded-full flex items-center justify-center">
                <span className="text-4xl animate-spin">🤔</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2 transition-all duration-300 min-h-[60px] break-keep px-4">
              "{loadingText}"
            </h2>
          </div>
        )}

        {/* Result Screen */}
        {step === 'result' && resultData && (
          <div className="w-full max-w-lg animate-scale-in">
             <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
               
               {/* Header (Dark) */}
               <div className="bg-slate-900 text-white p-6 text-center relative overflow-hidden">
                   {/* Share Button */}
                   <button 
                     onClick={handleShare}
                     className="absolute top-4 right-4 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full backdrop-blur-sm transition text-xs font-bold border border-white/10"
                   >
                     {isCopied ? (
                        <>✅ 복사됨!</>
                     ) : (
                        <>🔗 공유</>
                     )}
                   </button>

                   <div className="relative z-10 mt-2">
                       <div className="w-16 h-16 mx-auto bg-white rounded-full p-1 mb-3 shadow-lg overflow-hidden">
                           <StockLogo 
                             ticker={resultData.ticker} 
                             name_en={resultData.name_en} 
                             name_kr={resultData.name_kr} 
                             className="w-full h-full object-contain rounded-full"
                           />
                       </div>
                       <h2 className="text-2xl font-bold">{resultData.name_kr}</h2>
                       <p className="text-gray-400 text-sm font-mono mt-0.5">{resultData.ticker}</p>
                       
                       <div className="flex items-center justify-center gap-2 mt-2">
                           <span className="text-lg font-mono">${resultData.price.toFixed(2)}</span>
                           <span className={`text-sm font-bold px-2 py-0.5 rounded ${resultData.change > 0 ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>
                             {resultData.change > 0 ? '▲' : '▼'} {Math.abs(resultData.change).toFixed(2)}%
                           </span>
                       </div>
                   </div>
               </div>

               <div className="p-6">
                   {/* Gauge Bar Section */}
                   <div className="mb-8">
                       <div className="flex justify-between text-xs font-bold text-gray-400 mb-2">
                           <span className="text-blue-400">공포 (Panic)</span>
                           <span className="text-red-400">탐욕 (Greed)</span>
                       </div>
                       
                       {/* Track */}
                       <div className="w-full h-4 bg-gray-100 rounded-full relative overflow-hidden shadow-inner">
                           {/* Gradient Background */}
                           <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-gray-400 to-red-500 opacity-80"></div>
                           
                           {/* ✨✨ UPDATED HANDLE: Hollow Ring Slider ✨✨ */}
                           <div
                               className="absolute top-0 bottom-0 w-4 rounded-full border-4 border-white z-10 transition-all duration-1000 ease-out"
                               style={{
                                   left: `${resultData.score}%`,
                                   transform: 'translateX(-50%)',
                                   // 테두리에만 살짝 그림자를 주어 입체감을 더합니다.
                                   boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                               }}
                           >
                               {/* 내부의 회색 장식용 div는 삭제되었습니다. */}
                           </div>
                       </div>
                       
                       {/* Score Text */}
                       <div className="text-center mt-3">
                            <span className="text-gray-500 text-xs font-bold">개미 과열 지수</span>
                            <div className={`text-3xl font-extrabold ${resultData.score > 50 ? 'text-red-600' : 'text-blue-600'}`}>
                                {resultData.score} <span className="text-lg text-gray-400 font-medium">/ 100</span>
                            </div>
                       </div>
                   </div>
                   
                   {/* AI Analysis Box */}
                   <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 mb-4">
                       <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2 text-sm">
                           <span>데이터 기반 AI분석</span>
                       </h3>
                       <p className="text-slate-700 text-sm leading-relaxed break-keep">
                          {resultData.comment}
                       </p>
                   </div>
               </div>

               <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2">
                   <button onClick={() => { setQuery(''); setStep('input'); }} className="flex-1 py-3 bg-white border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition">
                       다시 검색
                   </button>
                   <Link 
                     href={`/flow?ticker=${resultData.ticker}&fileTicker=${resultData.ticker}&side=netBuy&days=5`} 
                     className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-center hover:bg-blue-700 shadow-lg shadow-blue-200 transition"
                   >
                       차트 자세히 보기 👉
                   </Link>
               </div>
             </div>
          </div>
        )}

        {step === 'error' && (
          <div className="text-center max-w-sm animate-shake">
            <div className="text-6xl mb-4">🙅‍♂️</div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">데이터가 없습니다!</h2>
            <p className="text-gray-600 mb-6 break-keep">
              혹시 티커를 잘못 입력하셨나요?<br/>
              저희는 서학개미 수급 데이터가 있는<br/>
              <strong>미국 주식</strong>만 분석합니다.
            </p>
            <button 
              onClick={() => { setQuery(''); setStep('input'); }}
              className="px-6 py-3 bg-gray-900 text-white rounded-full font-bold hover:bg-gray-800 transition shadow-lg"
            >
              다시 검색하기
            </button>
          </div>
        )}

      </div>
    </main>
  );
}