'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type Time,
  HistogramSeries,
} from 'lightweight-charts';

type Point = { date: string; value: number }; // date: YYYY-MM-DD
type Side = 'netBuy' | 'netSell';

// YYYY-MM-DD → BusinessDay
function toBusinessDay(ymd: string): Time {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d } as any;
}

/**
 * ✅ "만/억" 달러 표기 (만 단위 반올림)
 * 56,280,000 -> 5,628만 달러
 * 122,196,000 -> 1억 2,220만 달러 (만단위 반올림)
 */
function formatUSD_KR(amount: number) {
  if (amount == null || Number.isNaN(amount)) return '-';

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (abs < 10_000) {
    return `${sign}${Math.round(abs).toLocaleString('ko-KR')} 달러`;
  }

  const manTotal = Math.round(abs / 10_000);
  const eok = Math.floor(manTotal / 10_000);
  const man = manTotal % 10_000;

  if (eok > 0) {
    if (man === 0) return `${sign}${eok}억 달러`;
    return `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만 달러`;
  }

  return `${sign}${manTotal.toLocaleString('ko-KR')}만 달러`;
}

export default function FlowChart({
  series,
  side,
}: {
  series: Point[];
  side: Side;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const histRef = useRef<any>(null);

  const histData = useMemo(() => {
    return (series ?? []).map((p) => {
      const v = Number(p.value ?? 0);
      return {
        time: toBusinessDay(p.date),
        value: v,
        color: v >= 0 ? 'rgba(239,68,68,0.65)' : 'rgba(56,189,248,0.70)',
      };
    });
  }, [series]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || chartRef.current) return;

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 320;

    const chart = createChart(el, {
      width,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.08)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        rightOffset: 2,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.20)', style: LineStyle.Solid, width: 1 },
        horzLine: { color: 'rgba(255,255,255,0.20)', style: LineStyle.Solid, width: 1 },
      },

      // ✅ 이게 핵심: 축 라벨(350M 같은거)을 여기서 잡아버림
      localization: {
        priceFormatter: (price: number) => formatUSD_KR(price),
      },

      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // ✅ 시리즈 쪽도 같이 (크로스헤어/툴팁/마지막값 등)
    const seriesOptions = {
      priceFormat: {
        type: 'custom',
        minMove: 1,
        formatter: (price: number) => formatUSD_KR(price),
      },
      lastValueVisible: false,
      priceLineVisible: false,
    };

    const anyChart: any = chart;
    let histogram: any;

    if (typeof anyChart.addHistogramSeries === 'function') {
      histogram = anyChart.addHistogramSeries(seriesOptions);
    } else {
      histogram = anyChart.addSeries(HistogramSeries as any, seriesOptions);
    }

    histRef.current = histogram;

    histogram.setData(histData);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w > 0 && h > 0) {
        chart.applyOptions({ width: w, height: h });
        chart.timeScale().fitContent();
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      histRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!chartRef.current || !histRef.current) return;
    histRef.current.setData(histData);
    chartRef.current.timeScale().fitContent();
  }, [histData, side]);

  return <div ref={hostRef} className="w-full h-80" />;
}
