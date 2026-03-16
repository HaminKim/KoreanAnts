'use client';

import { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import SectorChart from './SectorChart';
import Portal from './Portal';

// ✨ [수정] 타입 정의 (서버에서 오는 데이터 형태)
type SectorItem = {
  id: number;
  name: string;
  ticker: string;
  emoji: string;
  change1d: number;
  change1w: number;
  change1m: number;
};

const MAX_THRESHOLD = 4.0; 

// ✨ [Card Component] (UI 건드리지 않음)
const SectorCard = ({ sector, index, period, onClick }: { sector: SectorItem, index: number, period: string, onClick: () => void }) => {
  const change = period === '1D' ? sector.change1d : period === '1W' ? sector.change1w : sector.change1m;

  const getGradientStyle = (val: number) => {
    const threshold = period === '1M' ? 10.0 : MAX_THRESHOLD;
    const intensity = Math.min(Math.abs(val) / threshold, 1.0);
    const percentage = Math.round(intensity * 100);

    if (val > 0.1) { 
      return {
        background: `linear-gradient(to top, rgba(254, 226, 226, ${0.3 + intensity * 0.7}) 0%, rgba(255, 255, 255, 0) ${percentage + 20}%)`,
        boxShadow: 'inset 0 0 0 1px rgba(254, 202, 202, 0.3)', 
      };
    } else if (val < -0.1) { 
      return {
        background: `linear-gradient(to bottom, rgba(219, 234, 254, ${0.3 + intensity * 0.7}) 0%, rgba(255, 255, 255, 0) ${percentage + 20}%)`,
        boxShadow: 'inset 0 0 0 1px rgba(191, 219, 254, 0.3)',
      };
    }
    return {
      background: '#f9fafb',
      boxShadow: 'inset 0 0 0 1px rgba(243, 244, 246, 1)',
    };
  };

  const style = getGradientStyle(change);
  const isUp = change > 0.1;
  const isDown = change < -0.1;
  const isFlat = !isUp && !isDown;

  return (
    <motion.div 
      layout 
      onClick={onClick}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      className="relative z-10 rounded-2xl overflow-hidden cursor-pointer bg-white group h-24 md:h-28"
      style={style}
      whileTap={{ scale: 0.95 }}
    >
      <div className="absolute top-1.5 left-2 z-20 pointer-events-none">
        <span className={`text-[10px] font-black font-mono opacity-30 ${index < 3 ? 'text-gray-900' : 'text-gray-400'}`}>
          {index + 1}
        </span>
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-center p-1 z-10 pointer-events-none">
        <div className="w-11 h-11 mb-1.5 flex items-center justify-center relative">
             <span className="text-3xl leading-none select-none filter-none transform translate-y-[1px]" role="img" aria-label={sector.name}>
               {sector.emoji}
             </span>
        </div>
        <div className="text-[11px] md:text-xs font-semibold text-gray-600 leading-none mb-1 text-center tracking-tight">
            {sector.name}
        </div>
        <motion.div 
            key={change} 
            initial={{ opacity: 0, y: 5 }} 
            animate={{ opacity: 1, y: 0 }}
            className={`text-[12px] md:text-sm font-black tracking-tight ${
                isFlat ? 'text-gray-400' : (isUp ? 'text-red-500' : 'text-blue-500')
            }`}
        >
          {isUp ? '+' : ''}{change.toFixed(2)}%
        </motion.div>
      </div>
    </motion.div>
  );
};

export default function SectorGrid() {
  const [period, setPeriod] = useState<'1D' | '1W' | '1M'>('1D');
  const [selectedSector, setSelectedSector] = useState<any>(null);
  
  // ✨ [수정] 실제 데이터를 담을 상태 (초기값 빈 배열)
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ✨ [수정] 컴포넌트 마운트 시 데이터 패치
  useEffect(() => {
    fetch('/data/sector_performance.json')
        .then(res => res.json())
        .then(data => {
            setSectors(data);
            setLoading(false);
        })
        .catch(err => {
            console.error("섹터 데이터 로드 실패:", err);
            // 실패 시 빈 배열 유지하거나 에러 처리
            setLoading(false);
        });
  }, []);

  // ✨ [수정] RAW_SECTORS 대신 state인 sectors 사용
  const sortedSectors = useMemo(() => {
    return [...sectors].sort((a, b) => {
      const valA = period === '1D' ? a.change1d : period === '1W' ? a.change1w : a.change1m;
      const valB = period === '1D' ? b.change1d : period === '1W' ? b.change1w : b.change1m;
      return valB - valA; 
    });
  }, [period, sectors]);

  // 로딩 중일 때 (선택사항 - 안 넣어도 됨)
  if (loading && sectors.length === 0) return null; // 깜빡임 방지용

  return (
    <div className="w-full mt-4 mb-4 relative z-0"> 
      
      <div className="mb-4 flex items-center justify-between px-1">
        <h2 className="text-lg md:text-xl font-bold text-gray-900 flex items-center gap-1.5">
          <span>📊</span>
          <span>섹터 랭킹</span>
        </h2>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
            {(['1D', '1W', '1M'] as const).map((t) => (
                <button
                    key={t}
                    onClick={() => setPeriod(t)}
                    className={`
                        relative text-[11px] font-bold px-2.5 py-1 rounded-md transition-colors z-10
                        ${period === t ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}
                    `}
                >
                    {period === t && (
                        <motion.div
                            layoutId="tab-indicator"
                            className="absolute inset-0 bg-white rounded-md shadow-sm border border-black/5 -z-10"
                            transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                        />
                    )}
                    {t === '1D' ? '오늘' : t === '1W' ? '1주' : '1달'}
                </button>
            ))}
        </div>
      </div>

      <motion.div layout className="grid grid-cols-4 md:grid-cols-8 gap-2 md:gap-3">
        <AnimatePresence>
            {sortedSectors.map((sector, index) => (
            <SectorCard 
                key={sector.id} 
                sector={sector} 
                index={index} 
                period={period} 
                onClick={() => setSelectedSector(sector)} 
            />
            ))}
        </AnimatePresence>
      </motion.div>

      {/* 히트맵 진입 배너 */}
      <Link href="/watchlist" className="mt-3 mb-1 flex items-center justify-between w-full bg-white hover:bg-gray-50 active:scale-[0.99] transition-all rounded-2xl px-5 py-3.5 border border-gray-200 group">
        <div className="flex items-center gap-3">
          <span className="text-xl">🗺️</span>
          <div>
            <div className="text-gray-900 text-sm font-bold leading-none mb-0.5">섹터 히트맵</div>
            <div className="text-gray-400 text-[11px]">시장을 주도하는 종목 · 시장의 추세를 확인하라!</div>
          </div>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4 text-gray-300 group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </Link>

      {/* ✨ [수술 부위] 사장님 원본 코드 그대로 복구 + 데이터 연결 */}
      <Portal>
        <AnimatePresence>
            {selectedSector && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedSector(null)}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center p-4"
            >
                <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                onClick={(e) => e.stopPropagation()} 
                className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden relative"
                >
                <button 
                    onClick={() => setSelectedSector(null)}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 bg-gray-100 p-2 rounded-full transition-colors z-50"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="pt-8 px-6 pb-2 text-center">
                    <div className="text-6xl mb-4 select-none">
                        {selectedSector.emoji}
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                        {selectedSector.name} ({selectedSector.ticker})
                    </h3>
                    
                    {(() => {
                        const change = period === '1D' ? selectedSector.change1d : period === '1W' ? selectedSector.change1w : selectedSector.change1m;
                        const isUp = change > 0;
                        return (
                            <p className={`text-2xl font-black ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
                                {isUp ? '+' : ''}{change.toFixed(2)}%
                            </p>
                        );
                    })()}
                    
                    <p className="text-xs text-gray-400 font-medium mt-1">
                        최근 {period === '1D' ? '1일' : period === '1W' ? '1주일' : '1개월'} 가격 추이
                    </p>
                </div>

                <div className="h-[250px] w-full mt-2 mb-6 relative px-2">
                    <SectorChart 
                        ticker={selectedSector.ticker}
                        change={period === '1D' ? selectedSector.change1d : period === '1W' ? selectedSector.change1w : selectedSector.change1m} 
                    />
                </div>

                <div className="px-6 pb-6">
                    <button 
                        onClick={() => setSelectedSector(null)}
                        className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-xl active:scale-95 transition-transform"
                    >
                        확인
                    </button>
                </div>

                </motion.div>
            </motion.div>
            )}
        </AnimatePresence>
      </Portal>
    </div>
  );
}