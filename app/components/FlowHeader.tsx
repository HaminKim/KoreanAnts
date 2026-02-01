'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import StockLogo from './StockLogo';

// Props는 사용하진 않지만, FlowPage에서 넘겨주는 것과 호환성을 위해 남겨둡니다.
type Props = {
  currentTicker?: string;
  currentFileTicker?: string;
  currentName?: string;
};

type StockMap = {
  ticker: string;
  fileTicker: string;
  name_kr: string;
  name_en: string;
};

export default function FlowHeader({}: Props) {
  const router = useRouter();
  
  // 상태 관리
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StockMap[]>([]);
  const [allItems, setAllItems] = useState<StockMap[]>([]);
  
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. 데이터 로드 (검색 자동완성용 - 유지)
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
  }, []);

  // 2. 포커스
  useEffect(() => {
    if (isSearchMode && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchMode]);

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

  // 4. 이동
  const handleSelect = (item: StockMap) => {
    router.push(`/flow?ticker=${item.ticker}&fileTicker=${encodeURIComponent(item.fileTicker)}&side=netBuy&days=5`);
    setIsSearchMode(false);
    setQuery('');
    setSearchResults([]);
  };

  return (
    // ✨ justify-between -> justify-end 로 변경하여 오른쪽 끝으로 정렬
    <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 h-[60px] px-4 flex items-center justify-end">
      
      {/* 왼쪽 영역 싹 비움 (화살표 삭제) */}

      {/* 오른쪽: 검색 영역 (유지) */}
      <div className={`relative transition-all duration-300 ease-in-out ${isSearchMode ? 'w-full' : 'w-auto'}`}>
        
        {!isSearchMode ? (
            // [닫힘] 돋보기 아이콘 + 텍스트
            <button 
                onClick={() => setIsSearchMode(true)}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-500 px-3 py-2 rounded-full transition-colors"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <span className="text-xs font-bold pr-1">종목 검색</span>
            </button>
        ) : (
            // [열림] 검색창
            <div className="relative w-full animate-fade-in">
                <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={handleInputChange}
                    placeholder="종목명 또는 티커..."
                    className="w-full bg-gray-100 text-sm font-bold text-gray-900 pl-10 pr-10 py-2.5 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder-gray-400"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && searchResults.length > 0) {
                            handleSelect(searchResults[0]);
                        }
                    }}
                />
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                
                {/* 닫기 버튼 */}
                <button 
                    onClick={() => { setIsSearchMode(false); setQuery(''); setSearchResults([]); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                {/* 자동완성 목록 */}
                {searchResults.length > 0 && (
                    <ul className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50">
                        {searchResults.map((item) => (
                            <li 
                                key={item.ticker}
                                onClick={() => handleSelect(item)}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-none"
                            >
                                <div className="w-8 h-8 rounded-full border border-gray-100 p-0.5 flex-shrink-0">
                                    <StockLogo ticker={item.ticker} name_en={item.fileTicker} className="w-full h-full object-contain" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold text-gray-900">{item.name_kr}</span>
                                    <span className="text-[10px] text-gray-400">{item.ticker}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        )}
      </div>
    </header>
  );
}