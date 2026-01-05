'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { COLORS } from '../constants/colors';

type TopItem = {
  rank: number;
  ticker: string;     
  fileTicker?: string;
  value?: number;
};

type Props = {
  side: 'netBuy' | 'netSell';
  days: number;
  topN?: number;
  items: TopItem[];
};

function formatUSD_KR(amount?: number) {
  if (amount == null || Number.isNaN(amount) || amount === 0) return '-';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  if (abs < 10_000) return `${sign}${Math.round(abs).toLocaleString()}달러`;
  const eokUnit = 100_000_000;
  const manUnit = 10_000;
  let eok = Math.floor(abs / eokUnit);
  const remainder = abs % eokUnit;
  let man = Math.round(remainder / manUnit);
  if (man === 10_000) { eok += 1; man = 0; }
  if (eok > 0) {
    if (man === 0) return `${sign}${eok}억 달러`;
    return `${sign}${eok}억 ${man.toLocaleString()}만 달러`;
  }
  return `${sign}${man.toLocaleString()}만 달러`;
}

export default function Top10Grid({ side, days, topN, items }: Props) {
  const isBuy = side === 'netBuy';

  // 1️⃣ 맵핑 데이터 상태 관리
  // tickerMap: "NVIDIA CORP" -> "NVDA" (이미지용)
  const [tickerMap, setTickerMap] = useState<Record<string, string>>({}); 
  // koreanMap: "NVIDIA CORP" -> "엔비디아" (텍스트용)
  const [koreanMap, setKoreanMap] = useState<Record<string, string>>({}); 

  useEffect(() => {
    // 2️⃣ ticker_map.json 로드
    // 대소문자 문제 방지를 위해 키를 전부 대문자(toUpperCase)로 저장합니다.
    fetch('/data/ticker_map.json')
      .then(res => res.json())
      .then(data => {
        const normalized: Record<string, string> = {};
        Object.entries(data).forEach(([key, value]) => {
          normalized[key.toUpperCase().trim()] = String(value);
        });
        setTickerMap(normalized);
      })
      .catch(err => console.error("Ticker Map Error:", err));

    // 3️⃣ name_alias.json 로드
    fetch('/data/name_alias.json')
      .then(res => res.json())
      .then(data => {
        const normalized: Record<string, string> = {};
        Object.entries(data).forEach(([key, value]) => {
          if (String(value).trim() !== "") {
             normalized[key.toUpperCase().trim()] = String(value);
          }
        });
        setKoreanMap(normalized);
      })
      .catch(err => console.error("Alias Map Error:", err));
  }, []);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8">
      {items.map((item, i) => {
        // 원본 데이터: "NVIDIA CORP"
        const rawName = (item.ticker || item.fileTicker || '').trim();
        const lookupKey = rawName.toUpperCase(); 

        // 🎯 1. 이미지용 티커 찾기
        // tickerMap["NVIDIA CORP"] -> "NVDA"
        // 없으면 원본("NVIDIA CORP") 그대로 사용
        const shortTicker = tickerMap[lookupKey] || rawName;
        
        // 🎯 2. 화면 표시용 이름 찾기
        // koreanMap["NVIDIA CORP"] -> "엔비디아"
        // 없으면 shortTicker("NVDA") 사용
        const displayName = koreanMap[lookupKey] || shortTicker;

        // 링크 생성 (상세 페이지에는 짧은 티커와 원본 둘 다 전달)
        const qs = new URLSearchParams();
        qs.set('ticker', shortTicker);      
        qs.set('fileTicker', rawName);      
        qs.set('side', side);
        qs.set('days', String(days));
        if (topN) qs.set('top', String(topN));

        // ✅ 이미지 경로: 무조건 shortTicker 사용 (NVDA.png)
        const logoSrc = `/logos/${encodeURIComponent(shortTicker)}.png`;

        return (
          <Link
            key={`${rawName}-${i}`}
            href={`/flow?${qs.toString()}`}
            className="text-center cursor-pointer group block"
          >
            {/* 로고 영역 */}
            <div className="relative w-20 h-20 mx-auto mb-1.5">
              <div
                className={`absolute inset-0 rounded-full border-2 transition ${
                  isBuy
                    ? `${COLORS.netBuy.border} group-hover:${COLORS.netBuy.borderStrong}`
                    : `${COLORS.netSell.border} group-hover:${COLORS.netSell.borderStrong}`
                }`}
              />
              
              {/* key={logoSrc}를 줘서 주소가 확정되면 이미지를 새로 그림 */}
              <img
                key={logoSrc} 
                src={logoSrc}
                alt={displayName}
                className="absolute inset-[6px] w-[calc(100%-12px)] h-[calc(100%-12px)] rounded-full object-cover bg-white"
                onError={(e) => {
                  const img = e.currentTarget;
                  // 혹시 NVDA.png가 없으면 -> NVIDIA CORP.png 시도
                  if (rawName && !img.src.includes(encodeURIComponent(rawName))) {
                    img.src = `/logos/${encodeURIComponent(rawName)}.png`;
                  } else {
                    // 다 없으면 미국 국기
                    img.src = '/logos/_us.png';
                  }
                }}
              />

              <div
                className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-sm ${
                  isBuy ? COLORS.netBuy.bg : COLORS.netSell.bg
                }`}
              >
                {item.rank ?? i + 1}
              </div>
            </div>

            {/* 텍스트 정보 */}
            <div className="h-[72px] px-1 flex flex-col justify-start items-center">
              <span className="text-sm font-medium break-keep line-clamp-3 leading-tight tracking-tight">
                {displayName}
              </span>
              <span className="text-xs text-gray-500 font-mono mt-0.5">
                {formatUSD_KR(item.value)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}