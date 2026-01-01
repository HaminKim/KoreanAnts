'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';

type Point = { date: string; value: number }; // date: YYYY-MM-DD

export default function FlowChart({ series, side }: { series: Point[]; side: 'netBuy' | 'netSell' }) {
  const ref = useRef<HTMLDivElement | null>(null);

  const data = useMemo(
    () =>
      (series ?? []).map((p) => ({
        time: p.date as any,
        value: Number(p.value),
      })),
    [series]
  );

  useEffect(() => {
    if (!ref.current) return;

    const el = ref.current;

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
        vertLine: { color: 'rgba(255,255,255,0.20)' },
        horzLine: { color: 'rgba(255,255,255,0.20)' },
      },
      handleScroll: true,
      handleScale: true,
    });

    // "순매수/순매도" 데이터는 캔들보다는 히스토그램(막대) or 에어리어가 증권사스럽다.
    const histogram = chart.addHistogramSeries({
      color: side === 'netBuy' ? 'rgba(239,68,68,0.65)' : 'rgba(59,130,246,0.65)',
      priceFormat: { type: 'volume' },
    });

    histogram.setData(data);
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [data, side]);

  return <div ref={ref} className="w-full h-80" />;
}
