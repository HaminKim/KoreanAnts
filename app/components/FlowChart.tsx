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
  LineSeries, // ✅ LineSeries 추가
} from 'lightweight-charts';

// ✅ 데이터 타입 확장 (주가 포함)
type FlowData = {
  date: string;   // YYYY-MM-DD
  netBuy: number; // 순매수 금액
  price?: number; // 주가 (선택적)
};

// YYYY-MM-DD → BusinessDay
function toBusinessDay(ymd: string): Time {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d } as any;
}

/**
 * ✅ "만/억" 달러 표기 (만 단위 반올림)
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

// ✅ 일반 달러 표기 (주가용)
function formatPriceUSD(price: number) {
  return `$${price.toFixed(2)}`;
}

export default function FlowChart({
  data,
}: {
  data: FlowData[];
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  const histRef = useRef<any>(null);  // 수급 (막대)
  const lineRef = useRef<any>(null);  // 주가 (선)

  // 1. 수급 데이터 (막대)
  const histData = useMemo(() => {
    return (data ?? []).map((p) => {
      const v = Number(p.netBuy ?? 0);
      return {
        time: toBusinessDay(p.date),
        value: v,
        color: v >= 0 ? 'rgba(239,68,68,0.65)' : 'rgba(56,189,248,0.70)',
      };
    });
  }, [data]);

  // 2. 주가 데이터 (선) - 데이터 있는 것만 필터링
  const lineData = useMemo(() => {
    return (data ?? [])
      .filter(p => p.price !== undefined && p.price > 0)
      .map((p) => ({
        time: toBusinessDay(p.date),
        value: p.price!,
      }));
  }, [data]);

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
      
      // ✅ [핵심] 이중 축 설정
      // 왼쪽: 수급 (막대), 오른쪽: 주가 (선)
      leftPriceScale: {
        visible: true,
        borderColor: 'rgba(255,255,255,0.08)',
      },
      rightPriceScale: {
        visible: true,
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

    const anyChart: any = chart;

    // -------------------------------------------
    // A. 수급 막대 그래프 (왼쪽 축)
    // -------------------------------------------
    const histOptions = {
      priceScaleId: 'left', // 👈 왼쪽 축 사용
      priceFormat: {
        type: 'custom',
        minMove: 1,
        formatter: (price: number) => formatUSD_KR(price),
      },
      lastValueVisible: false,
      priceLineVisible: false,
    };

    let histogram: any;
    if (typeof anyChart.addHistogramSeries === 'function') {
      histogram = anyChart.addHistogramSeries(histOptions);
    } else {
      histogram = anyChart.addSeries(HistogramSeries as any, histOptions);
    }
    histRef.current = histogram;


    // -------------------------------------------
    // B. 주가 선 그래프 (오른쪽 축)
    // -------------------------------------------
    const lineOptions = {
      priceScaleId: 'right', // 👈 오른쪽 축 사용
      color: '#4ade80',      // 밝은 초록색 (주가)
      lineWidth: 2,
      crosshairMarkerVisible: true,
      lastValueVisible: true,
      priceLineVisible: true,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => formatPriceUSD(price), // $150.00 형식
      },
    };

    let lineSeries: any;
    if (typeof anyChart.addLineSeries === 'function') {
      lineSeries = anyChart.addLineSeries(lineOptions);
    } else {
      lineSeries = anyChart.addSeries(LineSeries as any, lineOptions);
    }
    lineRef.current = lineSeries;


    // 데이터 초기 주입
    histogram.setData(histData);
    lineSeries.setData(lineData);
    
    chart.timeScale().fitContent();

    // 리사이즈 처리
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
      lineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 데이터 업데이트 (차트 재생성 없이)
  useEffect(() => {
    if (!chartRef.current || !histRef.current || !lineRef.current) return;
    
    histRef.current.setData(histData);
    lineRef.current.setData(lineData);
    
    chartRef.current.timeScale().fitContent();
  }, [histData, lineData]);

  return <div ref={hostRef} className="w-full h-80" />;
}