'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type Time,
  HistogramSeries,
  LineSeries,
} from 'lightweight-charts';

// ✅ 데이터 타입
type FlowData = {
  date: string;
  netBuy: number;
  price?: number;
  ma5?: number;
  ma10?: number;
  ma20?: number;
};

// YYYY-MM-DD → BusinessDay
function toBusinessDay(ymd: string): Time {
  const [y, m, d] = ymd.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m, day: d } as any;
}

/**
 * 🛠️ [초슬림 포맷터] $1.2억 / $5000만
 * 달러 기호($)를 맨 앞에 붙임
 */
function formatUltraCompact(amount: number) {
  if (amount == null || Number.isNaN(amount)) return '-';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  // 1. 1억 이상 -> "$1.2억"
  if (abs >= 100_000_000) {
    return `${sign}$${(abs / 100_000_000).toFixed(1)}억`;
  }

  // 2. 1만 이상 -> "$5000만"
  if (abs >= 10_000) {
    return `${sign}$${Math.round(abs / 10_000)}만`;
  }

  // 3. 그 외 -> "$100"
  return `${sign}$${Math.round(abs)}`;
}

// 주가 표기 -> "$315.15"
function formatPriceCompact(price: number) {
  return `$${price.toFixed(2)}`;
}

export default function FlowChart({ data }: { data: FlowData[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  const histRef = useRef<any>(null);      
  const lineRef = useRef<any>(null);      
  
  const ma5Ref = useRef<any>(null);
  const ma10Ref = useRef<any>(null);
  const ma20Ref = useRef<any>(null);

  // ✅ [설정] MA 선 기본값: 꺼짐 (OFF) -> 사용자가 켤 수 있음
  const [showMa5, setShowMa5] = useState(false);
  const [showMa10, setShowMa10] = useState(false);
  const [showMa20, setShowMa20] = useState(false);

  // 1. 데이터 가공
  const histData = useMemo(() => {
    return (data ?? []).map((p) => {
      const v = Number(p.netBuy ?? 0);
      return {
        time: toBusinessDay(p.date),
        value: v,
        // 투명도 조절: 주가 선과 겹쳐도 보이게
        color: v >= 0 ? 'rgba(239, 68, 68, 0.55)' : 'rgba(59, 130, 246, 0.55)', 
      };
    });
  }, [data]);

  const lineData = useMemo(() => {
    return (data ?? [])
      .filter(p => p.price !== undefined && p.price > 0)
      .map((p) => ({ time: toBusinessDay(p.date), value: p.price! }));
  }, [data]);

  const ma5Data = useMemo(() => {
    return (data ?? []).filter(p => p.ma5).map(p => ({ time: toBusinessDay(p.date), value: p.ma5! }));
  }, [data]);

  const ma10Data = useMemo(() => {
    return (data ?? []).filter(p => p.ma10).map(p => ({ time: toBusinessDay(p.date), value: p.ma10! }));
  }, [data]);

  const ma20Data = useMemo(() => {
    return (data ?? []).filter(p => p.ma20).map(p => ({ time: toBusinessDay(p.date), value: p.ma20! }));
  }, [data]);

  // 2. 차트 생성
  useEffect(() => {
    const el = hostRef.current;
    if (!el || chartRef.current) return;

    const width = el.clientWidth || 800;
    const height = el.clientHeight || 320;

    const chart = createChart(el, {
      width,
      height,
      layout: { 
        background: { type: ColorType.Solid, color: '#ffffff' }, 
        textColor: '#9ca3af', 
        fontSize: 11,
      },
      grid: { 
        vertLines: { visible: false }, 
        horzLines: { color: '#f3f4f6' } 
      },
      // 주가/수급 겹치기 (영역 공유)
      rightPriceScale: { 
        visible: true, 
        borderColor: 'transparent', 
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      leftPriceScale: { 
        visible: true, 
        borderColor: 'transparent',
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: { borderColor: '#f3f4f6', rightOffset: 2 },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;
    const anyChart: any = chart;

    // 🔥 0점 중앙 고정 로직
    const symmetricScaleProvider = (original: any) => {
      const res = original();
      if (res !== null && res.priceRange !== null) {
        const limit = Math.max(Math.abs(res.priceRange.minValue), Math.abs(res.priceRange.maxValue));
        const buffer = (limit === 0 ? 1 : limit) * 1.1; 
        return { priceRange: { minValue: -buffer, maxValue: buffer } };
      }
      return null;
    };

    // A. 수급 막대 (왼쪽 축)
    const histOptions = {
      priceScaleId: 'left',
      priceFormat: { type: 'custom', minMove: 1, formatter: formatUltraCompact }, // ✅ $1.2억 포맷
      lastValueVisible: false, 
      priceLineVisible: false, 
      autoscaleInfoProvider: symmetricScaleProvider,
    };
    const histogram = anyChart.addHistogramSeries ? anyChart.addHistogramSeries(histOptions) : anyChart.addSeries(HistogramSeries, histOptions);
    histRef.current = histogram;

    // B. MA 선들 (사용자가 켤 수 있음)
    const createMaSeries = (color: string) => {
      const options = {
        priceScaleId: 'left',
        color, lineWidth: 1,
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        priceFormat: { type: 'custom', formatter: formatUltraCompact },
        lineStyle: LineStyle.Solid,
        autoscaleInfoProvider: symmetricScaleProvider,
      };
      return anyChart.addLineSeries ? anyChart.addLineSeries(options) : anyChart.addSeries(LineSeries, options);
    };

    ma5Ref.current = createMaSeries('#fb923c');  
    ma10Ref.current = createMaSeries('#a78bfa'); 
    ma20Ref.current = createMaSeries('#38bdf8'); 

    // C. 주가 선 (오른쪽 축)
    const lineOptions = {
      priceScaleId: 'right', 
      color: '#10b981', lineWidth: 2,
      crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: true, 
      priceFormat: { type: 'custom', formatter: formatPriceCompact }, // ✅ $315.15 포맷
    };
    const lineSeries = anyChart.addLineSeries ? anyChart.addLineSeries(lineOptions) : anyChart.addSeries(LineSeries, lineOptions);
    lineRef.current = lineSeries;

    // 초기 데이터 주입
    histogram.setData(histData);
    ma5Ref.current.setData(ma5Data);
    ma10Ref.current.setData(ma10Data);
    ma20Ref.current.setData(ma20Data);
    lineSeries.setData(lineData);
    
    // 줌 설정 (최근 50일)
    const totalPoints = histData.length;
    const visiblePoints = 50; 
    if (totalPoints > visiblePoints) {
      chart.timeScale().setVisibleLogicalRange({ from: totalPoints - visiblePoints, to: totalPoints + 2 });
    } else {
      chart.timeScale().fitContent();
    }

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []); 

  // 업데이트 Hooks
  useEffect(() => {
    if (!chartRef.current) return;
    if (histRef.current) histRef.current.setData(histData);
    if (ma5Ref.current) ma5Ref.current.setData(ma5Data);
    if (ma10Ref.current) ma10Ref.current.setData(ma10Data);
    if (ma20Ref.current) ma20Ref.current.setData(ma20Data);
    if (lineRef.current) lineRef.current.setData(lineData);
  }, [histData, lineData, ma5Data, ma10Data, ma20Data]);

  // MA 버튼 누를 때마다 보였다 안 보였다 처리
  useEffect(() => {
    if (ma5Ref.current) ma5Ref.current.applyOptions({ visible: showMa5 });
    if (ma10Ref.current) ma10Ref.current.applyOptions({ visible: showMa10 });
    if (ma20Ref.current) ma20Ref.current.applyOptions({ visible: showMa20 });
  }, [showMa5, showMa10, showMa20]);

  return (
    <div className="w-full bg-white rounded-xl border border-gray-100 shadow-sm p-1">
      {/* 컨트롤 패널: 버튼 클릭 시 색상 변경 (켜짐 표시) */}
      <div className="flex justify-end gap-1 mb-1 px-1">
        <button onClick={() => setShowMa5(!showMa5)} className={`text-[9px] px-1.5 py-0.5 rounded border ${showMa5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>MA5</button>
        <button onClick={() => setShowMa10(!showMa10)} className={`text-[9px] px-1.5 py-0.5 rounded border ${showMa10 ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>MA10</button>
        <button onClick={() => setShowMa20(!showMa20)} className={`text-[9px] px-1.5 py-0.5 rounded border ${showMa20 ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>MA20</button>
      </div>

      {/* 차트 영역 */}
      <div ref={hostRef} className="w-full h-[340px]" />
    </div>
  );
}