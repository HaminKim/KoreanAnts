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
  signal: 'FALLING_KNIFE' | 'FOMO' | 'PANIC_SELL' | 'NEUTRAL';
  zScore: number;
  hasPrice: boolean;
  lastUpdate: string;
  currency?: string;
};

type Row = {
  date: string;
  netBuy: number;
  price?: number;
};

/* ---------- Helper Functions ---------- */
function formatMoney(amount: number) {
  const abs = Math.abs(amount);
  
  if (abs === 0) return '0달러';

  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000;
    return `${eok.toFixed(1).replace(/\.0$/, '')}억달러`;
  }

  if (abs >= 10_000) {
    const man = Math.round(abs / 10_000);
    return `${man.toLocaleString()}만달러`;
  }

  return `${Math.round(abs).toLocaleString()}달러`;
}

export default function FlowClient() {
  const params = useSearchParams();

  const ticker = params.get('ticker') ?? '';
  const fileTicker = params.get('fileTicker') ?? ticker;
  const days = Number(params.get('days') ?? '60'); 
  
  const side = 'netBuy'; 
  const themeColor = COLORS[side];

  /* ---------- State ---------- */
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({});

  /* ---------- 1. Alias Load ---------- */
  useEffect(() => {
    fetch('/data/name_alias.json')
      .then(res => res.json())
      .then(data => setAliasMap(data))
      .catch(err => console.error("Alias Load Error:", err));
  }, []);

  /* ---------- 2. Data Load ---------- */
  useEffect(() => {
    if (!fileTicker) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // 파일명 안전하게 변환
        const safeName = fileTicker.replace(/[^a-zA-Z0-9 .-_]/g, "_");
        
        const res = await fetch(
          `/data/flow/${encodeURIComponent(safeName)}_all.json`,
          { cache: 'no-store' }
        );

        if (!res.ok) throw new Error(`데이터 없음 (${res.status})`);

        const json = await res.json();
        const allData = json.data ?? [];
        
        setRows(allData);
        setMeta(json.meta ?? null);

      } catch (e: any) {
        console.error(e);
        setRows([]);
        setErr(e?.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [fileTicker]);

  /* ---------- 3. 📊 Analysis Logic (수급 분석) ---------- */
  const analysisMessage = useMemo(() => {
    if (rows.length === 0) return { text: "데이터 분석 중...", color: "text-gray-500" };

    const recentData = rows.slice(-days);
    const totalNet = recentData.reduce((acc, cur) => acc + cur.netBuy, 0);
    const moneyStr = formatMoney(totalNet);

    // 주가 등락률 계산 (Price Return)
    const validPrices = recentData.filter(r => r.price && r.price > 0).map(r => r.price!);
    let priceChangeRate = 0;
    if (validPrices.length > 1) {
      const startPrice = validPrices[0];
      const endPrice = validPrices[validPrices.length - 1];
      priceChangeRate = (endPrice - startPrice) / startPrice; 
    }

    // 🔴 매수 우위
    if (totalNet >= 0) {
      if (priceChangeRate < -0.1) {
         return { 
          text: `최근 ${days}거래일 주가 하락 시 저가 매수 유입 📉 (+${moneyStr})`, 
          color: "text-red-600 font-bold" 
        };
      }
      return { 
        text: `최근 ${days}거래일 순매수 우위 흐름 📈 (+${moneyStr})`, 
        color: "text-red-500 font-semibold" 
      };
    } 
    // 🔵 매도 우위
    else {
      if (priceChangeRate < -0.1) {
        return { 
          text: `최근 ${days}거래일 주가 하락 및 매도세 심화 ↘️ (-${moneyStr})`, 
          color: "text-blue-600 font-bold" 
        };
      }
      return { 
        text: `최근 ${days}거래일 순매도 우위 흐름 📉 (-${moneyStr})`, 
        color: "text-blue-500 font-semibold" 
      };
    }
  }, [rows, days]);

  /* ---------- 🔥 [NEW] 주가 정보 추출 로직 (그래프 데이터 활용) ---------- */
  const priceInfo = useMemo(() => {
    if (!rows || rows.length < 2) return null;

    // 가장 최근 데이터 (오늘/어제)
    const lastRow = rows[rows.length - 1];
    // 그 전날 데이터
    const prevRow = rows[rows.length - 2];

    // 주가 데이터가 존재할 때만 계산
    if (lastRow.price && prevRow.price) {
      const current = lastRow.price;
      const prev = prevRow.price;
      const change = current - prev;
      const pct = (change / prev) * 100;
      
      return {
        price: current,
        change: change,
        changePercent: pct,
        isUp: change > 0,
        isDown: change < 0
      };
    }
    return null;
  }, [rows]);


  /* ---------- 4. Badge Logic ---------- */
  const renderBadge = () => {
    if (!meta || rows.length === 0) return null;

    let style = "";
    let title = "";
    let desc = "";
    
    const { signal, zScore } = meta;
    const totalActiveDays = rows.filter(r => r.netBuy !== 0).length;

    const recentRows = rows.slice(-days); 
    const totalNet = recentRows.reduce((acc, cur) => acc + cur.netBuy, 0);
    const absTotal = recentRows.reduce((acc, cur) => acc + Math.abs(cur.netBuy), 0);
    const intensity = absTotal === 0 ? 0 : totalNet / absTotal;

    const validPrices = recentRows.filter(r => r.price && r.price > 0).map(r => r.price!);
    let priceReturn = 0;
    if (validPrices.length > 1) {
      const start = validPrices[0];
      const end = validPrices[validPrices.length - 1];
      priceReturn = (end - start) / start;
    }

    const sortedNetBuys = recentRows.map(r => r.netBuy).sort((a, b) => Math.abs(b) - Math.abs(a));
    const top3Sum = sortedNetBuys.slice(0, 3).reduce((acc, cur) => acc + Math.abs(cur), 0);
    const totalAbsSum = recentRows.reduce((acc, cur) => acc + Math.abs(cur.netBuy), 0);
    const concentration = totalAbsSum === 0 ? 0 : top3Sum / totalAbsSum;

    // --- Priority 1: 신규 진입 ---
    if (totalActiveDays < 5 && totalActiveDays > 0) {
      if (totalNet > 0) {
        style = "bg-purple-500/10 border-purple-500/20 text-purple-600";
        title = "✨ 순매수 상위 신규 진입 (New Entry)";
        desc = "기존 순위권에 없던 종목이나, 최근 거래량이 급증하며 순매수 상위권에 포착되었습니다.";
        return BadgeUI(style, title, desc, "Hot Issue");
      }
    }

    // --- Priority 2: 특수 시그널 ---
    if (signal === 'FALLING_KNIFE') {
      style = "bg-red-500/10 border-red-500/20 text-red-600";
      title = `🚨 최근 ${days}거래일 급락 시 과매수 유입`;
      desc = "주가가 큰 폭으로 하락했음에도 비정상적으로 강한 매수세가 유입되었습니다. 높은 변동성에 주의가 필요합니다.";
      return BadgeUI(style, title, desc, `강도: ${zScore}σ`);
    } 
    else if (signal === 'FOMO') {
      style = "bg-orange-500/10 border-orange-500/20 text-orange-600";
      title = `🔥 최근 ${days}거래일 급등 시 추격 매수`;
      desc = "주가가 단기간 급등했음에도 매수 강도가 매우 높습니다. 과열권 진입 가능성이 있습니다.";
      return BadgeUI(style, title, desc, `강도: ${zScore}σ`);
    } 
    else if (signal === 'PANIC_SELL') {
      style = "bg-blue-500/10 border-blue-500/20 text-blue-600";
      title = `📉 최근 ${days}거래일 하락장 매도 심화`;
      desc = "주가 하락과 함께 강한 매도세가 동반되고 있습니다. 시장의 매도 심리가 지배적인 구간입니다.";
      return BadgeUI(style, title, desc, `강도: ${zScore}σ`);
    }

    // --- Priority 3: 일반 분석 ---
    if (totalNet > 0) {
      if (concentration > 0.5 && days > 10) {
        style = "bg-teal-500/10 border-teal-500/20 text-teal-600";
        title = `⚡ 최근 ${days}거래일 특정일 대량 매수 (Event)`;
        desc = "꾸준한 매집보다는, 특정 날짜에 대규모 자금이 집중적으로 유입된 패턴입니다.";
        return BadgeUI(style, title, desc, `집중도: 높음`);
      }

      if (priceReturn < -0.05) {
        style = "bg-rose-500/10 border-rose-500/20 text-rose-600";
        title = `📉 최근 ${days}거래일 주가 조정 시 저가 매수`;
        const dropPercent = (priceReturn * 100).toFixed(1);
        desc = `주가가 ${dropPercent}% 하락하는 조정 구간에서 저가 매수세가 유입되고 있습니다.`;
        return BadgeUI(style, title, desc, `수익률: ${dropPercent}%`);
      }

      if (zScore >= 0.5 || intensity > 0.5) {
        style = "bg-red-500/5 border-red-500/10 text-red-600";
        title = `🐜 최근 ${days}거래일 꾸준한 순매수 우위`;
        desc = "주가 흐름과 관계없이 일정한 기조로 매수세가 유입되고 있습니다.";
        return BadgeUI(style, title, desc, `매수비중: ${Math.round(intensity * 100)}%`);
      }
      
      style = "bg-pink-500/5 border-pink-500/10 text-pink-500";
      title = `🛒 최근 ${days}거래일 소폭 매수 우위`;
      desc = "매수세가 약간 우위이나, 강한 확신보다는 탐색적인 흐름이 관찰됩니다.";
      return BadgeUI(style, title, desc, "탐색 단계");
    }

    else {
      if (priceReturn < -0.05) {
        style = "bg-indigo-500/10 border-indigo-500/20 text-indigo-600";
        title = `💸 최근 ${days}거래일 주가 하락 및 자금 이탈`;
        const dropPercent = (priceReturn * 100).toFixed(1);
        desc = `주가가 ${dropPercent}% 하락하는 가운데 매도세가 출회되고 있어 주의가 필요합니다.`;
        return BadgeUI(style, title, desc, `수익률: ${dropPercent}%`);
      }

      if (zScore <= -0.5 || intensity < -0.5) {
        style = "bg-blue-500/5 border-blue-500/10 text-blue-600";
        title = `💰 최근 ${days}거래일 순매도 우위`;
        desc = "이익 실현 또는 리스크 관리성 매도 물량이 출회되고 있습니다.";
        return BadgeUI(style, title, desc, `매도비중: ${Math.round(Math.abs(intensity) * 100)}%`);
      }

      style = "bg-slate-500/10 border-slate-500/20 text-slate-600";
      title = `↘️ 최근 ${days}거래일 소폭 매도 우위`;
      desc = "매수 심리가 다소 위축되어 관망세가 짙은 구간입니다.";
      return BadgeUI(style, title, desc, "관망세");
    }
  };

  const BadgeUI = (style: string, title: string, desc: string, tag: string) => (
    <div className={`mb-6 p-4 rounded-lg border ${style} transition-all duration-200 hover:shadow-md`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-lg flex items-center gap-2">{title}</span>
        <span className="text-xs font-mono bg-white/60 px-2 py-1 rounded shadow-sm">{tag}</span>
      </div>
      <p className="text-sm opacity-90 break-keep leading-relaxed">{desc}</p>
    </div>
  );

  /* ---------- Render ---------- */
  const displayName = aliasMap[fileTicker] || meta?.name || ticker;

  return (
    <div className="max-w-4xl mx-auto p-4">
      
      {/* ✨ Header Section: 이름 아래로 주가 배치 (Vertical Layout) */}
      <div className="mb-6 flex items-start gap-4">
        {/* 1. 로고 이미지 */}
        <div className="relative w-16 h-16 rounded-full overflow-hidden border border-gray-100 bg-white shadow-sm shrink-0 mt-1">
          <Image
            src={`/logos/${encodeURIComponent(fileTicker)}.png`}
            alt={ticker}
            fill
            className="object-contain p-2"
            onError={(e) => { e.currentTarget.src = '/logos/_us.png'; }}
            unoptimized
          />
        </div>

        {/* 2. 텍스트 정보 영역 */}
        <div className="flex-1 flex flex-col justify-center">
          
          {/* (1) 분석 메시지 (맨 위 라벨) */}
          <div className={`text-sm font-medium mb-1 ${analysisMessage.color} flex items-center gap-1`}>
            {analysisMessage.color.includes('red') ? '📈' : '📉'} 
            {analysisMessage.text}
          </div>

          {/* (2) 종목명 & 티커 (첫 번째 줄) */}
          <div className="flex items-baseline gap-2 mb-1">
            <h1 className="text-lg font-bold text-gray-900 leading-none tracking-tight">
              {displayName}
            </h1>
            {meta?.ticker && (
              <span className="text-sm text-gray-400 font-normal bg-gray-100 px-1.5 rounded-md">
                {meta.ticker}
              </span>
            )}
          </div>

          {/* (3) 💵 주가 정보 (두 번째 줄 - 아래로 내림) */}
          <div className="min-h-[2.5rem] flex items-center"> 
            {priceInfo ? (
              <div className={`flex items-baseline gap-2 ${priceInfo.isUp ? 'text-red-600' : priceInfo.isDown ? 'text-blue-600' : 'text-gray-600'}`}>
                {/* 현재가 (폰트 키움 text-4xl) */}
                <span className="text-4xl font-bold tracking-tight">
                  {priceInfo.price.toLocaleString()}
                </span>
                
                {/* 통화 단위 */}
                <span className="text-sm font-medium text-gray-500 mr-1">
                  {meta?.currency || 'USD'}
                </span>

                {/* 등락폭 & 등락률 */}
                <span className={`text-lg font-medium flex items-center px-1.5 py-0.5 rounded ${priceInfo.isUp ? 'bg-red-50' : 'bg-blue-50'}`}>
                   {priceInfo.isUp ? '▲' : priceInfo.isDown ? '▼' : ''}
                   {Math.abs(priceInfo.change).toFixed(2)}
                   <span className="ml-1 text-base opacity-80">
                     ({priceInfo.isUp ? '+' : ''}{priceInfo.changePercent.toFixed(2)}%)
                   </span>
                </span>
              </div>
            ) : (
              // 데이터 로딩 전이나 없을 때
              <span className="text-gray-300 text-2xl font-bold animate-pulse">$ --.--</span>
            )}
          </div>

          {/* (4) 업데이트 시간 및 면책 조항 */}
          <div className="text-xs text-gray-400 mt-2 flex items-center gap-1">
            <span>* 주가: 1일 전 종가 (Market Closed)</span>
            {meta?.lastUpdate && (
              <span className="before:content-['•'] before:mx-1">
                Last Update: {meta.lastUpdate}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 배지 & 분석 카드 */}
      {renderBadge()}

      {/* Chart */}
      <div className={`w-full rounded-xl border ${themeColor.border} bg-white p-4 shadow-sm`}>
        {loading && <div className="h-80 flex items-center justify-center text-gray-400">데이터 로딩 중...</div>}
        {err && <div className="h-80 flex items-center justify-center text-red-400">{err}</div>}

        {!loading && !err && rows.length > 0 && (
          <>
            <FlowChart data={rows} />
            
            <div className="flex justify-end gap-4 mt-3 text-xs text-gray-400 font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 bg-red-400 rounded-sm opacity-70"></div>
                <span>서학개미 순매수 (Left)</span>
              </div>
              {meta?.hasPrice && (
                <div className="flex items-center gap-1.5">
                  <div className="w-6 h-0.5 bg-green-400"></div>
                  <span>주가 (Right)</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 flex justify-between items-center text-xs text-gray-400 px-1">
        <span>* 주가 및 수급 데이터 기반 분석</span>
      </div>
    </div>
  );
}