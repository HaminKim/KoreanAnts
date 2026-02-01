'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import StockLogo from './StockLogo';

type StockMap = {
  ticker: string;
  fileTicker: string;
  name_kr: string;
  name_en: string;
};

export default function GlobalSearch() {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockMap[]>([]);
  const [allItems, setAllItems] = useState<StockMap[]>([]);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. 데이터 로드
  useEffect(() => {
    const loadData = async () => {
      try {
        const [aliasRes, mapRes] = await Promise.all([
          fetch('/data/name_alias.json'),
          fetch('/data/ticker_map.json')
        ]);
        const aliasData = await aliasRes.json();
        const mapData = await mapRes.json();

        const tempList: StockMap[] = [];
        Object.entries(mapData).forEach(([rawName, tickerVal]) => {
          const t = String(tickerVal).toUpperCase();
          const n = String(rawName);
          const kr = aliasData[n] || n;
          tempList.push({ ticker: t, fileTicker: n, name_en: n, name_kr: kr });
        });
        setAllItems(tempList);
      } catch (e) { console.error("데이터 로드 실패", e); }
    };
    loadData();

    // 외부 클릭 시 닫기
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
        setQuery('');
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 2. 확장 시 포커스
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  // 3. 입력 핸들러
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (val.trim() === '') {
      setSearchResults([]);
      return;
    }

    const upperVal = val.toUpperCase();
    const filtered = allItems.filter(item => 
      item.ticker.includes(upperVal) || 
      item.name_kr.includes(val) || 
      item.name_en.toUpperCase().includes(upperVal)
    ).slice(0, 5);

    setSearchResults(filtered);
  };

  // 4. 이동 로직
  const goToFlow = (item: StockMap) => {
    router.push(`/flow?ticker=${item.ticker}&fileTicker=${encodeURIComponent(item.fileTicker)}&side=netBuy&days=5`);
    setIsExpanded(false);
    setQuery('');
    setSearchResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
        if (searchResults.length > 0) {
            goToFlow(searchResults[0]);
        } else {
            const found = allItems.find(i => i.ticker === query.toUpperCase());
            const targetTicker = query.toUpperCase();
            const targetFileTicker = found ? found.fileTicker : targetTicker;
            
            router.push(`/flow?ticker=${targetTicker}&fileTicker=${encodeURIComponent(targetFileTicker)}&side=netBuy&days=5`);
            setIsExpanded(false);
            setQuery('');
        }
    }
  };

  return (
    <div ref={wrapperRef} className="relative flex items-center mr-1">
      <div 
        className={`flex items-center rounded-full transition-all duration-300 ease-in-out overflow-hidden ${
          // 🔻 [핵심] 평소엔 40px(아이콘 크기) -> 클릭하면 180px(PC 240px)로 확장
          isExpanded 
            ? 'w-[180px] sm:w-[240px] bg-white border border-gray-200 shadow-sm' 
            : 'w-[40px] bg-gray-100 hover:bg-gray-200 cursor-pointer'
        }`}
        onClick={() => {
            if (!isExpanded) setIsExpanded(true);
        }}
        style={{ height: '40px' }} // 높이 고정 (Share 버튼과 맞춤)
      >
        {/* 돋보기 아이콘 (항상 보임) */}
        <div className="flex items-center justify-center w-[40px] h-full text-gray-500 flex-shrink-0">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        </div>

        {/* 입력창 (평소엔 숨김) */}
        <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="종목 검색"
            className={`bg-transparent border-none outline-none text-sm font-bold text-gray-800 w-full pr-3 h-full ${
                isExpanded ? 'opacity-100' : 'opacity-0 w-0'
            }`}
            disabled={!isExpanded}
        />
        
        {/* 닫기 버튼 (확장 시에만 보임) */}
        {isExpanded && (
            <button 
                onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(false);
                    setQuery('');
                }}
                className="pr-3 text-gray-400 hover:text-gray-600"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        )}
      </div>

      {/* 자동완성 드롭다운 */}
      {isExpanded && searchResults.length > 0 && (
        <ul className="absolute top-full right-0 mt-2 w-[220px] sm:w-[240px] bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-[9999] animate-fade-in-up">
            {searchResults.map((item) => (
                <li 
                    key={item.ticker}
                    onClick={(e) => {
                        e.stopPropagation();
                        goToFlow(item);
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-gray-50 last:border-none"
                >
                    <div className="w-8 h-8 rounded-full border border-gray-100 p-0.5 flex-shrink-0 bg-white">
                        <StockLogo ticker={item.ticker} name_en={item.fileTicker} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-bold text-gray-900 truncate">{item.name_kr}</span>
                        <span className="text-[10px] text-gray-400 font-mono">{item.ticker}</span>
                    </div>
                </li>
            ))}
        </ul>
      )}
    </div>
  );
}