'use client';

import Link from 'next/link';
import { COLORS } from '../constants/colors';

type TopItem = {
  rank: number;
  ticker: string;      // ✅ 화면 표시용 (한글 alias 가능)
  fileTicker?: string; // ✅ 로고 파일 찾기용 (원래 rawName)
  value?: number;
};

type Props = {
  side: 'netBuy' | 'netSell';
  days: number;
  topN?: number;
  items: TopItem[];
};

function formatUSD_KR(amount?: number) {
  if (amount == null || Number.isNaN(amount)) return '-';

  const sign = amount < 0 ? '-' : '';
  let n = Math.round(Math.abs(amount)); // 달러 단위 정수

  const eok = Math.floor(n / 100_000_000);
  n %= 100_000_000;

  const million = Math.floor(n / 1_000_000);
  n %= 1_000_000;

  const man = Math.floor(n / 10_000);
  n %= 10_000;

  const parts: string[] = [];
  if (eok) parts.push(`${eok}억`);
  if (million) parts.push(`${million}백만`);
  if (man) parts.push(`${man}만`);

  if (parts.length === 0) return `${sign}${n.toLocaleString('ko-KR')}달러`;
  return `${sign}${parts.join(' ')}달러`;
}

export default function Top10Grid({ side, days, topN, items }: Props) {
  const isBuy = side === 'netBuy';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
      {items.map((item, i) => {
        const displayName = item.ticker;                 // ✅ 화면 텍스트
        const logoKey = (item.fileTicker ?? '').trim(); // ✅ 로고 파일명 키(rawName)

        const qs = new URLSearchParams();
        qs.set('ticker', displayName);        // 화면 표시용
        qs.set('fileTicker', logoKey);        // 차트/로고 기준용
        qs.set('side', side);
        qs.set('days', String(days));
        if (topN) qs.set('top', String(topN));

        // ✅ 로고 URL: 반드시 encodeURIComponent
        // ✅ 없으면 _us.png
        const logoSrc = logoKey
          ? `/logos/${encodeURIComponent(logoKey)}.png`
          : `/logos/_us.png`;

        return (
          <Link
            key={`${logoKey || displayName}-${i}`}
            href={`/flow?${qs.toString()}`}
            className="text-center cursor-pointer"
          >
            {/* 로고 + 랭킹 */}
            <div className="relative w-20 h-20 mx-auto mb-2">
              <div
                className={`absolute inset-0 rounded-full border-2 transition ${
                  isBuy
                    ? `${COLORS.netBuy.border} hover:${COLORS.netBuy.borderStrong}`
                    : `${COLORS.netSell.border} hover:${COLORS.netSell.borderStrong}`
                }`}
              />

              {/* ✅ 로고 이미지 */}
              <img
                src={logoSrc}
                alt={displayName}
                className="absolute inset-[6px] w-[calc(100%-12px)] h-[calc(100%-12px)] rounded-full object-cover bg-white"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.src.endsWith('/logos/_us.png')) {
                    img.src = '/logos/_us.png';
                  }
                }}
              />

              <div
                className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  isBuy ? COLORS.netBuy.bg : COLORS.netSell.bg
                }`}
              >
                {item.rank ?? i + 1}
              </div>
            </div>

            {/* 종목명 */}
            <div className="text-sm font-medium">{displayName}</div>

            {/* 금액 */}
            <div className="text-xs text-gray-500 mt-1">
              {formatUSD_KR(item.value)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
