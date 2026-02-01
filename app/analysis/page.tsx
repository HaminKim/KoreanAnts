'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import StockLogo from '../components/StockLogo';

// 🛠️ 데이터 타입 정의
type StockItem = {
  ticker: string;
  fileTicker: string; // 로컬 파일명 (KEYNAME)
  name_en: string;
  name_kr: string;
};

function AnalysisContent() {
  const router = useRouter();
  const searchParams = useSearchParams(); 
  
  // 상태 관리
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StockItem[]>([]);
  const [allItems, setAllItems] = useState<StockItem[]>([]);
  const [isOpen, setIsOpen] = useState(false); 
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ✨ 추천 종목 리스트 (클릭 시 바로 이동)
  const recommendedStocks = [
    { t: 'NVDA', n: '엔비디아', e: 'NVIDIA CORP', ft: 'NVIDIA CORP' },
    { t: 'TSLA', n: '테슬라', e: 'TESLA INC', ft: 'TESLA INC' },
    { t: 'IONQ', n: '아이온큐', e: 'IONQ INC', ft: 'IONQ INC' },
    { t: 'GOOGL', n: '구글 (알파벳A)', e: 'ALPHABET INC', ft: 'ALPHABET INC CL A' }, 
    { t: 'AVGO', n: '브로드컴', e: 'BROADCOM INC', ft: 'BROADCOM INC EXOF 005644980 SG9999014823' }, 
    { t: 'BMNR', n: '비트마인', e: 'BITMINE IMMERSION TECHNOLOGIES', ft: 'BITMINE IMMERSION TECHNOLOGI' } 
  ];

  // 1. 초기 데이터 로드 (이름/티커 매핑 준비)
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
            const n = String(rawName); // 파일명(KEYNAME)
            const kr = aliasData[n] || n; 
            
            tempList.push({ ticker: t, fileTicker: n, name_en: n, name_kr: kr });
        });
        setAllItems(tempList);

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

  // 2. 검색어 입력 핸들러
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

  // 🚀 3. 차트로 즉시 이동 (핵심 함수)
  const goToChart = (ticker: string, fileTicker?: string) => {
    if (!ticker) return;
    
    // fileTicker가 없으면(엔터 쳤을 때), allItems에서 찾아봄
    let targetFileTicker = fileTicker;
    if (!targetFileTicker) {
        const found = allItems.find(item => item.ticker === ticker.toUpperCase());
        // 찾았으면 그 파일명 쓰고, 못 찾았으면 그냥 티커를 씀 (최후의 수단)
        targetFileTicker = found ? found.fileTicker : ticker.toUpperCase();
    }

    // ✨ 바로 /flow 페이지로 이동! (기본값: 순매수, 5일)
    router.push(`/flow?ticker=${ticker.toUpperCase()}&fileTicker=${encodeURIComponent(targetFileTicker)}&side=netBuy&days=5`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        setIsOpen(false);
        // 엔터키 누르면 현재 입력된 값으로 검색 시도
        // (정확한 매칭을 위해 suggestion 첫번째가 있으면 그걸로 감)
        if (suggestions.length > 0) {
            goToChart(suggestions[0].ticker, suggestions[0].fileTicker);
        } else {
            goToChart(query);
        }
    }
  };

  return (
    <main className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      
      <div className="p-4">
        <Link href="/" className="inline-flex items-center text-gray-500 hover:text-black transition">
          <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          메인으로
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        
        <div className="w-full max-w-md animate-fade-in-up relative" ref={wrapperRef}>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">
              어떤 주식을 <br/> <span className="text-blue-600">분석</span>해 드릴까요?
            </h1>
            <p className="text-center text-gray-400 mb-8 text-sm">
              종목을 선택하면 상세 차트로 이동합니다.
            </p>

            {/* 검색창 */}
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
                onClick={() => goToChart(query)} // 버튼 클릭 시에도 이동
                className="absolute right-2 bottom-4 text-blue-600 hover:scale-110 transition-transform"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>

              {/* 자동완성 목록 */}
              {isOpen && suggestions.length > 0 && (
                <ul className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden text-left max-h-[300px] overflow-y-auto">
                    {suggestions.map((item) => (
                        <li 
                            key={item.ticker} 
                            onClick={() => goToChart(item.ticker, item.fileTicker)} // 리스트 클릭 시 이동
                            className="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-none flex justify-between items-center"
                        >
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-white border border-gray-200 p-0.5 shadow-sm overflow-hidden flex-shrink-0">
                                   <StockLogo 
                                     ticker={item.ticker} 
                                     name_en={item.fileTicker} 
                                     name_kr={item.name_kr} 
                                     className="w-full h-full object-contain rounded-full" 
                                   />
                                </div>
                                <div><span className="font-bold text-gray-800 block text-sm">{item.name_kr}</span><span className="text-xs text-gray-400">{item.name_en}</span></div>
                            </div>
                            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded ml-2">{item.ticker}</span>
                        </li>
                    ))}
                </ul>
              )}
            </div>

            {/* 추천 종목 (일마들) */}
            <div className="grid grid-cols-3 gap-3">
               {recommendedStocks.map((item) => (
                 <button 
                   key={item.t} 
                   onClick={() => goToChart(item.t, item.ft)} // 버튼 클릭 시 이동
                   className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition"
                 >
                   <div className="w-10 h-10 rounded-full bg-white border border-gray-200 p-1 mb-2 shadow-sm overflow-hidden">
                     <StockLogo 
                        ticker={item.t} 
                        name_en={item.ft} 
                        name_kr={item.n}
                        className="w-full h-full object-contain rounded-full"
                     />
                   </div>
                   <span className="text-xs font-bold text-gray-600 break-keep text-center leading-tight mt-1">{item.n}</span>
                 </button>
               ))}
            </div>
        </div>

      </div>
    </main>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center"><div className="w-10 h-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div></div>}>
      <AnalysisContent />
    </Suspense>
  );
}