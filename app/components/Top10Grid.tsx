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
  items: TopItem[];
};

export default function Top10Grid({ side, days, items }: Props) {
  const isBuy = side === 'netBuy';

  return (
    <div className="grid grid-cols-5 gap-6">
      {items.map((item, i) => {
        const ticker = item.ticker;
        const fileTicker = item.fileTicker ?? ticker; // map 없으면 ticker로 fallback

        return (
          <Link
            key={`${ticker}-${i}`}
            href={`/flow?ticker=${encodeURIComponent(ticker)}&fileTicker=${encodeURIComponent(
              fileTicker
            )}&side=${side}&days=${days}`}
            className="text-center cursor-pointer"
          >
            {/* 로고 + 랭킹 */}
            <div className="relative w-20 h-20 mx-auto mb-2">
              {/* 원 */}
              <div
                className={`w-full h-full rounded-full border-2 transition ${
                  isBuy
                    ? `${COLORS.netBuy.border} hover:${COLORS.netBuy.borderStrong}`
                    : `${COLORS.netSell.border} hover:${COLORS.netSell.borderStrong}`
                }`}
              />

              {/* 랭킹 */}
              <div
                className={`absolute -top-2 -left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  isBuy ? COLORS.netBuy.bg : COLORS.netSell.bg
                }`}
              >
                {item.rank ?? i + 1}
              </div>
            </div>

            {/* 종목명(지금은 ticker 그대로) */}
            <div className="text-sm font-medium">{ticker}</div>
          </Link>
        );
      })}
    </div>
  );
}
