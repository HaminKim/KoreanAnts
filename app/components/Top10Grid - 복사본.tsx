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
  topN?: number; // ✅ optional (안 넘기면 URL에 top 안 넣음)
  items: TopItem[];
};

/**
 * ✅ 달러 금액을 "만/억" 기준으로 표시
 * - 10,000달러 미만: 9,532 달러
 * - 10,000달러 이상: 5,628만 달러
 * - 1억(=10,000만) 이상: 1억 2,196만 달러
 * - 만 단위로 반올림
 */
function formatUSD_KR(amount?: number) {
  if (amount == null || Number.isNaN(amount)) return '-';

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  // 1만 달러 미만은 그냥 달러로
  if (abs < 10_000) {
    return `${sign}${Math.round(abs).toLocaleString('ko-KR')} 달러`;
  }

  // ✅ 만(10,000달러) 단위로 반올림
  const manTotal = Math.round(abs / 10_000); // ex) 56,280,000 -> 5,628(만)
  const eok = Math.floor(manTotal / 10_000); // 1억 = 10,000만
  const man = manTotal % 10_000;

  // 1억 이상
  if (eok > 0) {
    if (man === 0) return `${sign}${eok}억 달러`;
    return `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만 달러`;
  }

  // 1억 미만
  return `${sign}${manTotal.toLocaleString('ko-KR')}만 달러`;
}

export default function Top10Grid({ side, days, topN, items }: Props) {
  const isBuy = side === 'netBuy';

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
      {items.map((item, i) => {
        const ticker = item.ticker;
        const fileTicker = item.fileTicker ?? ticker;

        const qs = new URLSearchParams();
        qs.set('ticker', ticker);
        qs.set('fileTicker', fileTicker);
        qs.set('side', side);
        qs.set('days', String(days));
        if (topN) qs.set('top', String(topN));

        return (
          <Link
            key={`${ticker}-${i}`}
            href={`/flow?${qs.toString()}`}
            className="text-center cursor-pointer"
          >
            {/* 로고 + 랭킹 */}
            <div className="relative w-20 h-20 mx-auto mb-2">
              <div
                className={`w-full h-full rounded-full border-2 transition ${
                  isBuy
                    ? `${COLORS.netBuy.border} hover:${COLORS.netBuy.borderStrong}`
                    : `${COLORS.netSell.border} hover:${COLORS.netSell.borderStrong}`
                }`}
              />

              <div
                className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  isBuy ? COLORS.netBuy.bg : COLORS.netSell.bg
                }`}
              >
                {i + 1}
              </div>
            </div>

            {/* 종목명 */}
            <div className="text-sm font-medium">{ticker}</div>

            {/* ✅ 금액 (억/만 달러) */}
            <div className="text-xs text-gray-500 mt-1">
              {formatUSD_KR(item.value)}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
