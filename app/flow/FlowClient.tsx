'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import FlowChart from '../components/FlowChart';
import { COLORS } from '../constants/colors';

/* ---------- Type Definitions ---------- */
type MetaData = {
  name: string;
  ticker: string;
  lastUpdate: string;
};

type Row = {
  date: string;
  netBuy: number;
  price?: number;
};

// 💰 금액 포맷팅 함수
function formatMoneyKR(val: number) {
    const absVal = Math.abs(val);
    if (absVal >= 100000000) return `${(val / 100000000).toFixed(1)}억$`;
    if (absVal >= 10000) return `${(val / 10000).toFixed(0)}만$`;
    return `${val.toLocaleString()}$`;
}

export default function FlowClient() {
  const params = useSearchParams();
  const ticker = params.get('ticker') ?? '';
  const fileTicker = params.get('fileTicker') ?? ticker;
  
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({});
  const [tickerMap, setTickerMap] = useState<Record<string, string>>({});

  /* ---------- 1. Map Load ---------- */
  useEffect(() => {
    Promise.all([
        fetch('/data/name_alias.json').then(res => res.json()),
        fetch('/data/ticker_map.json').then(res => res.json())
    ]).then(([nameData, tickerData]) => {
        setAliasMap(nameData);
        setTickerMap(tickerData);
    }).catch(err => console.error("Map Load Error:", err));
  }, []);

  /* ---------- 2. Data Load ---------- */
  useEffect(() => {
    if (!ticker) return; 
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const safeTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        const res = await fetch(`/data/flow/${safeTicker}_all.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`데이터 없음 (${res.status})`);
        const text = await res.text();
        const safeText = text.replace(/:\s*NaN/g, ': null'); 
        const json = JSON.parse(safeText);
        setRows(json.data ?? []);
        setMeta(json.meta ?? null);
      } catch (e: any) {
        console.error(e);
        setRows([]);
        setErr(e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [ticker]);

  /* ---------- 3. Logic ---------- */
  const priceInfo = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const lastRow = rows[rows.length - 1];
    const prevRow = rows[rows.length - 2];
    if (lastRow.price && prevRow.price) {
      const change = lastRow.price - prevRow.price;
      return {
        price: lastRow.price,
        change: change,
        changePercent: (change / prevRow.price) * 100,
        isUp: change > 0,
        isDown: change < 0
      };
    }
    return null;
  }, [rows]);

  const insightMessage = useMemo(() => {
    if (rows.length < 20) return null; 
    const lastRow = rows[rows.length - 1];
    const row5ago = rows[rows.length - 6];   
    const row20ago = rows[rows.length - 21]; 

    if (!lastRow?.price || !row5ago?.price || !row20ago?.price) return null;

    const change5d = ((lastRow.price - row5ago.price) / row5ago.price) * 100;
    const change20d = ((lastRow.price - row20ago.price) / row20ago.price) * 100;
    const isLongTermDominant = Math.abs(change20d) > Math.abs(change5d);
    
    return {
        periodText: isLongTermDominant ? "지난 한 달(20일)" : "최근 일주일",
        targetChange: isLongTermDominant ? change20d : change5d,
        netSum5d: rows.slice(-5).reduce((acc, cur) => acc + cur.netBuy, 0),
        isNetBuy: rows.slice(-5).reduce((acc, cur) => acc + cur.netBuy, 0) > 0
    };
  }, [rows]);

  /* ---------- Helper ---------- */
  const normalize = (s: string) => s?.toUpperCase().trim() || '';
  const displayName = aliasMap[normalize(fileTicker)] || aliasMap[normalize(ticker)] || meta?.name || ticker;

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = { title: `REANT - ${displayName}`, text: `${displayName} 수급 분석`, url: url };
    if (navigator.share) try { await navigator.share(shareData); } catch {} else try { await navigator.clipboard.writeText(url); alert('링크 복사 완료!'); } catch {}
  };

  return (
    <div className="w-full pb-20 md:max-w-4xl md:mx-auto md:p-4">
      
      {/* 🟢 1. Header Area */}
      <div className="px-2 pt-6 pb-2 flex items-center gap-3 bg-white md:bg-transparent">
        <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-100 bg-white shadow-sm shrink-0">
          <Image
            src={`/logos/${encodeURIComponent(fileTicker)}.png`}
            alt={ticker}
            fill
            className="object-contain p-2"
            onError={(e) => {
                const target = e.currentTarget;
                if (!target.src.includes(encodeURIComponent(ticker))) target.src = `/logos/${encodeURIComponent(ticker)}.png`;
                else target.src = '/logos/_us.png';
            }}
            unoptimized
          />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none">{displayName}</h1>
            <span className="text-sm text-gray-400 font-medium">{ticker}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {priceInfo ? (
              <>
                {/* ✨ Color Fix: text-red-500 / text-blue-500 (차트 톤에 맞춤) */}
                <span className={`text-2xl font-bold leading-none ${priceInfo.isUp ? 'text-red-500' : 'text-blue-500'}`}>
                    ${priceInfo.price.toLocaleString()}
                </span>
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${priceInfo.isUp ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                  {priceInfo.isUp ? '▲' : '▼'} {Math.abs(priceInfo.changePercent).toFixed(2)}%
                </span>
              </>
            ) : <span className="text-gray-300 text-xl font-bold">$ --.--</span>}
          </div>
        </div>
      </div>

      {/* 🟢 2. Unified Content */}
      <div className="w-full mt-2 md:bg-white md:border md:border-gray-200 md:rounded-2xl md:shadow-sm overflow-hidden">
        
        {/* 구분선 */}
        <div className="w-full h-px bg-gray-100 border-b border-gray-50"></div>

        {/* A. Insight Section */}
        {insightMessage && (
            <div className="px-2 pt-5 pb-2">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🧐</span>
                    <span className="text- font-bold text-gray-500">
                        {displayName}는 지금?
                    </span>
                </div>
                <div className="text-[17px] text-gray-900 leading-relaxed break-keep font-medium">
                    {/* ✨ Color Fix: border-red-200 / text-red-500 (부드러운 강조) */}
                    {insightMessage.periodText} <span className={`font-bold ${insightMessage.targetChange > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {Math.abs(insightMessage.targetChange).toFixed(1)}% {insightMessage.targetChange > 0 ? '상승' : '하락'}
                    </span>했어요.<br/>
                    최근 개인들은 <span className={`font-bold border-b-2 ${insightMessage.isNetBuy ? 'border-red-200 text-red-500' : 'border-blue-200 text-blue-500'}`}>
                        {formatMoneyKR(insightMessage.netSum5d)} {insightMessage.isNetBuy ? '순매수' : '순매도'}
                    </span> 중이네요.
                </div>
            </div>
        )}

        {/* B. Chart Section */}
        <div className="relative w-full px-1 pb-4">
            {loading && <div className="h-80 flex items-center justify-center text-gray-400 text-sm">데이터 로딩 중...</div>}
            {err && <div className="h-80 flex items-center justify-center text-red-400 text-sm">{err}</div>}

            {!loading && !err && rows.length > 0 && (
            <>
                {/* 공유 버튼 */}
                <div className="absolute top-0 right-2 z-10 md:top-2 md:right-4">
                    <button onClick={handleShare} className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-500 px-2.5 py-1 rounded-full shadow-sm hover:bg-gray-50 transition-all text-[11px] font-bold">
                        <span>📤</span><span>공유</span>
                    </button>
                </div>

                {/* 차트 본체 */}
                <div>
                    <FlowChart data={rows} />
                </div>
                
                {/* ✨ Color Fix: 범례 색상 완벽 동기화 */}
                <div className="flex justify-center gap-4 mt-1 pb-1">
                    {/* 서학개미 매수 (Red-400) */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-red-400 rounded-sm opacity-80"></div>
                        <span className="text-xs text-gray-500 font-medium">서학개미 순매수</span>
                    </div>
                    {/* 서학개미 매도 (Blue-400) */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-blue-400 rounded-sm opacity-80"></div>
                        <span className="text-xs text-gray-500 font-medium">서학개미 순매도</span>
                    </div>
                    {/* 주가 (Deep Emerald #059669) - 차트 선과 동일! */}
                    <div className="flex items-center gap-1.5">
                        <div className="w-8 h-0.5 bg-[#059669] rounded-full"></div>
                        <span className="text-xs text-gray-500 font-medium">주가</span>
                    </div>
                </div>
            </>
            )}
        </div>
      </div>

      {/* 🟢 3. Footer */}
      <div className="mt-8 px-2 border-t border-gray-100 pt-6 text-center">
        <div className="text-xs font-bold text-gray-400 mb-2">데이터 기반 투자 인사이트, REANT</div>
        <div className="text-[10px] text-gray-300 flex flex-col gap-1">
          <span>* 주가 기준: 1일 전 종가 (Market Closed)</span>
          {meta?.lastUpdate && <span>* Last Update: {meta.lastUpdate}</span>}
          <span>* 본 정보는 투자 참고용이며, 법적 책임은 지지 않습니다.</span>
        </div>
      </div>
    </div>
  );
}