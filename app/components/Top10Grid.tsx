'use client';

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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-4 gap-y-8">
      {items.map((item, i) => {
        const displayName = item.ticker;
        const logoKey = (item.fileTicker ?? '').trim();

        const qs = new URLSearchParams();
        qs.set('ticker', displayName);
        qs.set('fileTicker', logoKey);
        qs.set('side', side);
        qs.set('days', String(days));
        if (topN) qs.set('top', String(topN));

        const logoSrc = logoKey
          ? `/logos/${encodeURIComponent(logoKey)}.png`
          : `/logos/_us.png`;

        return (
          <Link
            key={`${logoKey || displayName}-${i}`}
            href={`/flow?${qs.toString()}`}
            className="text-center cursor-pointer group block"
          >
            {/* 1. 로고 + 랭킹 */}
            <div className="relative w-20 h-20 mx-auto mb-1.5"> 
              <div
                className={`absolute inset-0 rounded-full border-2 transition ${
                  isBuy
                    ? `${COLORS.netBuy.border} group-hover:${COLORS.netBuy.borderStrong}`
                    : `${COLORS.netSell.border} group-hover:${COLORS.netSell.borderStrong}`
                }`}
              />
              <img
                src={logoSrc}
                alt={displayName}
                className="absolute inset-[6px] w-[calc(100%-12px)] h-[calc(100%-12px)] rounded-full object-cover bg-white"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.endsWith('/logos/_us.png')) { img.src = '/logos/_us.png'; }
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

            {/* 🔥 [핵심 수정] 
              이름과 돈을 감싸는 컨테이너에 높이(h-[72px])를 줍니다.
              - 이름이 짧으면 돈이 위로 붙습니다.
              - 이름이 길어도(3줄) 공간이 확보됩니다.
              - 남는 공간은 돈 '밑'에 생깁니다.
            */}
            <div className="h-[72px] px-1 flex flex-col justify-start items-center">
              
              {/* 종목명: 높이 제한 해제 (auto) -> 내용만큼만 차지 */}
              <span className="text-sm font-medium break-keep line-clamp-3 leading-tight tracking-tight">
                 {displayName}
              </span>

              {/* 금액: 종목명 바로 아래 붙음 (mt-0.5) */}
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