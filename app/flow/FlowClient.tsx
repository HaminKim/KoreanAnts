'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import FlowChart from '../components/FlowChart'; // ✅ 요청하신 상대 경로
import { COLORS } from '../constants/colors';    // ✅ 요청하신 상대 경로

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

/* ---------- 2. Data Load (수정됨) ---------- */
  useEffect(() => {
    if (!fileTicker) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);
        // 파일명 안전하게 변환
        const safeName = fileTicker.replace(/[^a-zA-Z0-9 .-_]/g, "_");
        
        // 1. 일단 텍스트로 가져옵니다.
        const res = await fetch(
          `/data/flow/${encodeURIComponent(safeName)}_all.json`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error(`데이터 없음 (${res.status})`);
        
        const text = await res.text();

        // 🎯 [핵심 패치] JSON 표준에 없는 'NaN'이 있으면 'null'로 강제 치환
        // 예: "zScore": NaN  ->  "zScore": null
        const safeText = text.replace(/:\s*NaN/g, ': null'); 

        // 2. 그 다음 JSON으로 변환
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
  }, [fileTicker]);
  /* ---------- 3. 주가 정보 추출 ---------- */
  const priceInfo = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const lastRow = rows[rows.length - 1];
    const prevRow = rows[rows.length - 2];

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

    // Badge Logic (기존 유지)
    if (totalActiveDays < 5 && totalActiveDays > 0) {
      if (totalNet > 0) {
        style = "bg-purple-500/10 border-purple-500/20 text-purple-600";
        title = "✨ 신규 진입 (New Entry)";
        desc = "최근 거래량이 급증하며 순매수 상위권에 포착되었습니다.";
        return BadgeUI(style, title, desc, "Hot Issue");
      }
    }
    if (signal === 'FALLING_KNIFE') {
      style = "bg-red-500/10 border-red-500/20 text-red-600";
      title = `🚨 급락 시 과매수 유입`;
      desc = "주가 급락에도 강한 매수세가 유입되었습니다. 높은 변동성에 주의하세요.";
      return BadgeUI(style, title, desc, `강도: ${zScore}σ`);
    } 
    else if (signal === 'FOMO') {
      style = "bg-orange-500/10 border-orange-500/20 text-orange-600";
      title = `🔥 급등 시 추격 매수`;
      desc = "주가 급등에도 매수 강도가 매우 높습니다. 과열권 진입 가능성이 있습니다.";
      return BadgeUI(style, title, desc, `강도: ${zScore}σ`);
    } 
    else if (signal === 'PANIC_SELL') {
      style = "bg-blue-500/10 border-blue-500/20 text-blue-600";
      title = `📉 하락장 매도 심화`;
      desc = "주가 하락과 함께 강한 매도세가 동반되고 있습니다.";
      return BadgeUI(style, title, desc, `강도: ${zScore}σ`);
    }
    if (totalNet > 0) {
      if (concentration > 0.5 && days > 10) {
        style = "bg-teal-500/10 border-teal-500/20 text-teal-600";
        title = `⚡ 특정일 대량 매수`;
        desc = "꾸준한 매집보다는, 특정 날짜에 대규모 자금이 집중적으로 유입되었습니다.";
        return BadgeUI(style, title, desc, `집중도: 높음`);
      }
      if (priceReturn < -0.05) {
        style = "bg-rose-500/10 border-rose-500/20 text-rose-600";
        title = `📉 주가 조정 시 저가 매수`;
        const dropPercent = (priceReturn * 100).toFixed(1);
        desc = `주가가 ${dropPercent}% 하락하는 조정 구간에서 저가 매수세가 유입 중입니다.`;
        return BadgeUI(style, title, desc, `수익률: ${dropPercent}%`);
      }
      if (zScore >= 0.5 || intensity > 0.5) {
        style = "bg-red-500/5 border-red-500/10 text-red-600";
        title = `🐜 꾸준한 순매수 우위`;
        desc = "주가 흐름과 관계없이 일정한 기조로 매수세가 유입되고 있습니다.";
        return BadgeUI(style, title, desc, `매수비중: ${Math.round(intensity * 100)}%`);
      }
      style = "bg-pink-500/5 border-pink-500/10 text-pink-500";
      title = `🛒 소폭 매수 우위`;
      desc = "매수세가 약간 우위이나, 탐색적인 흐름이 관찰됩니다.";
      return BadgeUI(style, title, desc, "탐색 단계");
    }
    else {
      if (priceReturn < -0.05) {
        style = "bg-indigo-500/10 border-indigo-500/20 text-indigo-600";
        title = `💸 주가 하락 및 자금 이탈`;
        desc = `주가 하락과 함께 매도세가 출회되고 있어 주의가 필요합니다.`;
        return BadgeUI(style, title, desc, `주의`);
      }
      if (zScore <= -0.5 || intensity < -0.5) {
        style = "bg-blue-500/5 border-blue-500/10 text-blue-600";
        title = `💰 순매도 우위`;
        desc = "이익 실현 또는 리스크 관리성 매도 물량이 출회되고 있습니다.";
        return BadgeUI(style, title, desc, `매도비중: ${Math.round(Math.abs(intensity) * 100)}%`);
      }
      style = "bg-slate-500/10 border-slate-500/20 text-slate-600";
      title = `↘️ 소폭 매도 우위`;
      desc = "매수 심리가 다소 위축되어 관망세가 짙은 구간입니다.";
      return BadgeUI(style, title, desc, "관망세");
    }
  };

  const BadgeUI = (style: string, title: string, desc: string, tag: string) => (
    <div className={`mb-6 p-4 rounded-xl border ${style} shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-lg flex items-center gap-2">{title}</span>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-white/60 px-2 py-1 rounded">{tag}</span>
      </div>
      <p className="text-sm opacity-90 break-keep leading-relaxed">{desc}</p>
    </div>
  );

  /* ---------- Render ---------- */
  const displayName = aliasMap[fileTicker] || meta?.name || ticker;

  return (
    <div className="max-w-4xl mx-auto p-4 pb-20">
      
      {/* 🟢 Header: 아주 심플하게 (로고 / 이름 / 가격) */}
      <div className="mb-6 flex items-center gap-4">
        {/* 1. 로고 */}
        <div className="relative w-14 h-14 rounded-full overflow-hidden border border-gray-100 bg-white shadow-sm shrink-0">
          <Image
            src={`/logos/${encodeURIComponent(fileTicker)}.png`}
            alt={ticker}
            fill
            className="object-contain p-2"
            onError={(e) => { e.currentTarget.src = '/logos/_us.png'; }}
            unoptimized
          />
        </div>

        {/* 2. 이름 및 가격 정보 */}
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">
              {displayName}
            </h1>
            <span className="text-sm text-gray-400 font-medium">
              {meta?.ticker}
            </span>
          </div>

          {/* 가격 */}
          <div className="flex items-center gap-2 mt-0.5">
            {priceInfo ? (
              <>
                <span className={`text-2xl font-bold ${priceInfo.isUp ? 'text-red-500' : priceInfo.isDown ? 'text-blue-500' : 'text-gray-900'}`}>
                  ${priceInfo.price.toLocaleString()}
                </span>
                <span className={`text-sm font-medium px-1.5 py-0.5 rounded ${priceInfo.isUp ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
                  {priceInfo.isUp ? '+' : ''}{priceInfo.changePercent.toFixed(2)}%
                </span>
              </>
            ) : (
              <span className="text-gray-300 text-xl font-bold">$ --.--</span>
            )}
          </div>
        </div>
      </div>

      {/* 🟢 배지 (분석 카드) */}
      {renderBadge()}

      {/* 🟢 차트 영역 */}
      <div className={`w-full rounded-xl border ${themeColor.border} bg-white p-2 shadow-sm mb-4`}>
        {loading && <div className="h-80 flex items-center justify-center text-gray-400 text-sm">데이터 로딩 중...</div>}
        {err && <div className="h-80 flex items-center justify-center text-red-400 text-sm">{err}</div>}

        {!loading && !err && rows.length > 0 && (
          <>
            <FlowChart data={rows} />
            <div className="flex justify-end gap-3 mt-2 px-2 pb-1 text-[10px] text-gray-400 font-medium">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-red-400 rounded-full opacity-60"></div>
                <span>서학개미 순매수 (Left)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-0.5 bg-green-500 rounded-full"></div>
                <span>주가 (Right)</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 🟢 Footer: 모든 부가 정보는 여기로 이동 */}
      <div className="mt-8 border-t border-gray-100 pt-4 text-center">
        <div className="text-xs font-bold text-gray-400 mb-2">
          주가 및 수급 데이터 기반 분석
        </div>
        
        {/* 날짜 정보들 (여기로 다 모음) */}
        <div className="text-[10px] text-gray-300 flex flex-col gap-1">
          <span>* 주가 기준: 1일 전 종가 (Market Closed)</span>
          {meta?.lastUpdate && (
            <span>* Last Update: {meta.lastUpdate}</span>
          )}
          <span>* 본 정보는 투자 참고용이며, 결과에 대한 법적 책임은 지지 않습니다.</span>
        </div>
      </div>

    </div>
  );
}