'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type Time,
  HistogramSeries, // ✨ 필수 import
  LineSeries,      // ✨ 필수 import
  AreaSeries,      // ✨ 필수 import
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

// 💰 초슬림 포맷터
function formatUltraCompact(amount: number) {
  if (amount == null || Number.isNaN(amount)) return '-';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  if (abs >= 100_000_000) return `${sign}$${(abs / 100_000_000).toFixed(1)}억`;
  if (abs >= 10_000) return `${sign}$${Math.round(abs / 10_000)}만`;
  return `${sign}$${Math.round(abs)}`;
}

// 💵 주가 포맷터
function formatPriceCompact(price: number) {
  return `$${price.toFixed(2)}`;
}

export default function FlowChart({ data }: { data: FlowData[] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  const histRef = useRef<any>(null);      
  const areaRef = useRef<any>(null); 
  
  const ma5Ref = useRef<any>(null);
  const ma10Ref = useRef<any>(null);
  const ma20Ref = useRef<any>(null);

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
        color: v >= 0 ? 'rgba(248, 113, 113, 0.6)' : 'rgba(96, 165, 250, 0.6)', 
      };
    });
  }, [data]);

  const lineData = useMemo(() => {
    return (data ?? [])
      .filter(p => p.price !== undefined && p.price > 0)
      .map((p) => ({ time: toBusinessDay(p.date), value: p.price! }));
  }, [data]);

  const ma5Data = useMemo(() => (data ?? []).filter(p => p.ma5).map(p => ({ time: toBusinessDay(p.date), value: p.ma5! })), [data]);
  const ma10Data = useMemo(() => (data ?? []).filter(p => p.ma10).map(p => ({ time: toBusinessDay(p.date), value: p.ma10! })), [data]);
  const ma20Data = useMemo(() => (data ?? []).filter(p => p.ma20).map(p => ({ time: toBusinessDay(p.date), value: p.ma20! })), [data]);

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
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
      grid: { 
        vertLines: { visible: false }, 
        horzLines: { color: '#f3f4f6' } 
      },
      rightPriceScale: { 
        visible: true, 
        borderColor: 'transparent', 
        scaleMargins: { top: 0.1, bottom: 0.1 }, 
      },
      leftPriceScale: { 
        visible: true, 
        borderColor: 'transparent',
        scaleMargins: { top: 0.2, bottom: 0.2 }, 
      },
      timeScale: { borderColor: '#f3f4f6', rightOffset: 5 },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    // 0점 대칭 스케일
    const symmetricScaleProvider = (original: any) => {
      const res = original();
      if (res !== null && res.priceRange !== null) {
        const limit = Math.max(Math.abs(res.priceRange.minValue), Math.abs(res.priceRange.maxValue));
        const buffer = (limit === 0 ? 1 : limit) * 1.1; 
        return { priceRange: { minValue: -buffer, maxValue: buffer } };
      }
      return null;
    };

    // ✨ [수정 핵심] addHistogramSeries 대신 addSeries(HistogramSeries, ...) 사용
    const histOptions = {
      priceScaleId: 'left',
      priceFormat: { type: 'custom', minMove: 1, formatter: formatUltraCompact },
      lastValueVisible: false, 
      priceLineVisible: false, 
      autoscaleInfoProvider: symmetricScaleProvider,
    };
    const histogram = chart.addSeries(HistogramSeries, histOptions);
    histRef.current = histogram;

    // B. MA 선들
    const createMaSeries = (color: string) => {
      const options = {
        priceScaleId: 'right',
        color, lineWidth: 1,
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        priceFormat: { type: 'custom', formatter: formatPriceCompact },
        lineStyle: LineStyle.Solid,
      };
      // ✨ [수정 핵심] addSeries(LineSeries, ...) 사용
      return chart.addSeries(LineSeries, options);
    };

    ma5Ref.current = createMaSeries('#fb923c');  
    ma10Ref.current = createMaSeries('#a78bfa'); 
    ma20Ref.current = createMaSeries('#38bdf8'); 

    // C. 주가 영역형 차트 (AreaSeries)
    const areaOptions = {
      priceScaleId: 'right', 
      lineColor: '#059669',     // 진한 에메랄드
      topColor: 'rgba(16, 185, 129, 0.4)', 
      bottomColor: 'rgba(255, 255, 255, 0)', 
      lineWidth: 3,             // 굵게!
      crosshairMarkerVisible: true, 
      lastValueVisible: true, 
      priceLineVisible: true, 
      priceFormat: { type: 'custom', formatter: formatPriceCompact },
    };
    // ✨ [수정 핵심] addSeries(AreaSeries, ...) 사용
    const areaSeries = chart.addSeries(AreaSeries, areaOptions);
    areaRef.current = areaSeries;

    // 데이터 주입
    histogram.setData(histData);
    ma5Ref.current.setData(ma5Data);
    ma10Ref.current.setData(ma10Data);
    ma20Ref.current.setData(ma20Data);
    areaSeries.setData(lineData);
    
    // 줌 설정
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
    if (areaRef.current) areaRef.current.setData(lineData);
  }, [histData, lineData, ma5Data, ma10Data, ma20Data]);

  // MA 토글
  useEffect(() => {
    if (ma5Ref.current) ma5Ref.current.applyOptions({ visible: showMa5 });
    if (ma10Ref.current) ma10Ref.current.applyOptions({ visible: showMa10 });
    if (ma20Ref.current) ma20Ref.current.applyOptions({ visible: showMa20 });
  }, [showMa5, showMa10, showMa20]);

  return (
    <div className="w-full bg-white rounded-xl shadow-sm p-1">
      <div className="flex justify-start gap-1 mb-1 px-1">
        <button onClick={() => setShowMa5(!showMa5)} className={`text-[9px] px-1.5 py-0.5 rounded border ${showMa5 ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>MA5</button>
        <button onClick={() => setShowMa10(!showMa10)} className={`text-[9px] px-1.5 py-0.5 rounded border ${showMa10 ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>MA10</button>
        <button onClick={() => setShowMa20(!showMa20)} className={`text-[9px] px-1.5 py-0.5 rounded border ${showMa20 ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>MA20</button>
      </div>

      <div ref={hostRef} className="w-full h-[340px]" />
    </div>
  );
}