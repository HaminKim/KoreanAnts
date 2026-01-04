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
 * 🛠️ [수정됨] 금액 포맷팅 함수 (한국식 억/만 단위)
 * 예: 121,831,235 -> "1억 2,183만 달러"
 */
function formatUSD_KR(amount: number) {
  if (amount == null || Number.isNaN(amount)) return '-';

  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);

  // 1. 1만 달러 미만: 그냥 숫자 전체 표시 (예: 5,400달러)
  if (abs < 10_000) {
    return `${sign}${Math.round(abs).toLocaleString('ko-KR')}달러`;
  }

  // 2. 단위 계산 (억, 만)
  const eokUnit = 100_000_000;
  const manUnit = 10_000;

  const eok = Math.floor(abs / eokUnit);          // 억 단위
  const remainder = abs % eokUnit;                // 억을 뺀 나머지
  const man = Math.round(remainder / manUnit);    // 나머지를 만 단위로 반올림

  // (예외처리) 만약 반올림하다가 만 단위가 10,000이 되면 -> 1억을 올려줌
  // 예: 1억 9999.9만 -> 2억 0만
  if (man === 10_000) {
    return `${sign}${eok + 1}억 달러`;
  }

  // 3. 억 단위가 있을 때 (예: 1억 이상)
  if (eok > 0) {
    if (man === 0) {
      return `${sign}${eok}억 달러`; // 예: 1억 달러
    }
    // 예: 1억 2,183만 달러
    return `${sign}${eok}억 ${man.toLocaleString('ko-KR')}만 달러`;
  }

  // 4. 억 단위가 없을 때 (예: 5,000만 달러)
  return `${sign}${man.toLocaleString('ko-KR')}만 달러`;
}

// 주가 표기 (예: $150.23)
function formatPriceUSD(price: number) {
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

  // MA 선 ON/OFF 상태 관리
  const [showMa5, setShowMa5] = useState(true);
  const [showMa10, setShowMa10] = useState(true);
  const [showMa20, setShowMa20] = useState(true);

  // 1. 데이터 가공
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
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9CA3AF' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.06)' }, horzLines: { color: 'rgba(255,255,255,0.06)' } },
      leftPriceScale: { visible: true, borderColor: 'rgba(255,255,255,0.08)' },
      rightPriceScale: { visible: true, borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', rightOffset: 2 },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;
    const anyChart: any = chart;

    // A. 수급 막대 (왼쪽 축)
    const histOptions = {
      priceScaleId: 'left',
      priceFormat: { type: 'custom', minMove: 1, formatter: formatUSD_KR },
      lastValueVisible: false, priceLineVisible: false,
    };
    const histogram = anyChart.addHistogramSeries ? anyChart.addHistogramSeries(histOptions) : anyChart.addSeries(HistogramSeries, histOptions);
    histRef.current = histogram;

    // B. MA 선들 (왼쪽 축)
    const createMaSeries = (color: string) => {
      const options = {
        priceScaleId: 'left', color, lineWidth: 1,
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
        priceFormat: { type: 'custom', formatter: formatUSD_KR },
      };
      return anyChart.addLineSeries ? anyChart.addLineSeries(options) : anyChart.addSeries(LineSeries, options);
    };

    ma5Ref.current = createMaSeries('#fb923c');  // 주황
    ma10Ref.current = createMaSeries('#a78bfa'); // 보라
    ma20Ref.current = createMaSeries('#38bdf8'); // 하늘

    // C. 주가 선 (오른쪽 축)
    const lineOptions = {
      priceScaleId: 'right', color: '#4ade80', lineWidth: 2,
      crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: true,
      priceFormat: { type: 'custom', formatter: formatPriceUSD },
    };
    const lineSeries = anyChart.addLineSeries ? anyChart.addLineSeries(lineOptions) : anyChart.addSeries(LineSeries, lineOptions);
    lineRef.current = lineSeries;

    // 초기 데이터 주입
    histogram.setData(histData);
    ma5Ref.current.setData(ma5Data);
    ma10Ref.current.setData(ma10Data);
    ma20Ref.current.setData(ma20Data);
    lineSeries.setData(lineData);
    
    chart.timeScale().fitContent();

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        chart.timeScale().fitContent();
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []); 

  // 3. 데이터 업데이트
  useEffect(() => {
    if (!chartRef.current) return;
    if (histRef.current) histRef.current.setData(histData);
    if (ma5Ref.current) ma5Ref.current.setData(ma5Data);
    if (ma10Ref.current) ma10Ref.current.setData(ma10Data);
    if (ma20Ref.current) ma20Ref.current.setData(ma20Data);
    if (lineRef.current) lineRef.current.setData(lineData);
  }, [histData, lineData, ma5Data, ma10Data, ma20Data]);

  // 4. Visibility 업데이트
  useEffect(() => {
    if (ma5Ref.current) ma5Ref.current.applyOptions({ visible: showMa5 });
    if (ma10Ref.current) ma10Ref.current.applyOptions({ visible: showMa10 });
    if (ma20Ref.current) ma20Ref.current.applyOptions({ visible: showMa20 });
  }, [showMa5, showMa10, showMa20]);

  return (
    <div className="w-full">
      {/* 컨트롤 패널 */}
      <div className="flex gap-2 mb-2 px-2 items-center">
        <span className="text-xs font-bold text-gray-500 mr-1">이동평균(수급):</span>
        <button
          onClick={() => setShowMa5(!showMa5)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showMa5 
              ? 'bg-orange-500/10 border-orange-500 text-orange-500 font-bold' 
              : 'bg-gray-100 border-gray-200 text-gray-400 line-through'
          }`}
        >
          MA5
        </button>
        <button
          onClick={() => setShowMa10(!showMa10)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showMa10 
              ? 'bg-violet-500/10 border-violet-500 text-violet-500 font-bold' 
              : 'bg-gray-100 border-gray-200 text-gray-400 line-through'
          }`}
        >
          MA10
        </button>
        <button
          onClick={() => setShowMa20(!showMa20)}
          className={`text-xs px-2 py-1 rounded border transition-colors ${
            showMa20 
              ? 'bg-sky-500/10 border-sky-500 text-sky-500 font-bold' 
              : 'bg-gray-100 border-gray-200 text-gray-400 line-through'
          }`}
        >
          MA20
        </button>
      </div>

      {/* 차트 영역 */}
      <div ref={hostRef} className="w-full h-80" />
    </div>
  );
}