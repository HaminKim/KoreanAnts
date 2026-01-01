'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type Time,
} from 'lightweight-charts';

type Point = { date: string; value: number }; // date: YYYY-MM-DD
type Side = 'netBuy' | 'netSell';

// lightweight-charts 권장 형태(Time = BusinessDay)
function toBusinessDay(ymd: string): Time {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d } as any;
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

  // ✅ 막대는 “순매수/순매도 상관없이” 0 기준 색상 적용
  const histData = useMemo(() => {
    return (series ?? []).map((p) => {
      const v = Number(p.value ?? 0);
      return {
        time: toBusinessDay(p.date),
        value: v,
        color: v >= 0 ? 'rgba(239,68,68,0.65)' : 'rgba(56,189,248,0.70)', // 빨강 / 하늘색
      };
    });
  }, [series]);

  // 1) 차트는 1번만 생성
  useEffect(() => {
    const el = hostRef.current;
    if (!el || chartRef.current) return;

    const chart = createChart(el, {
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
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // ✅ 버전 호환되는 방식
    const histogram = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    histRef.current = histogram;

    // 리사이즈 대응
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      chart.timeScale().fitContent();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      histRef.current = null;
    };
  }, []);

  // 2) 데이터만 갱신 (차트 재생성 X)
  useEffect(() => {
    if (!chartRef.current || !histRef.current) return;

    histRef.current.setData(histData);
    chartRef.current.timeScale().fitContent();
  }, [histData, side]);

  return <div ref={hostRef} className="w-full h-80" />;
}
