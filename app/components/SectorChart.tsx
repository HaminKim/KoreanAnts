'use client';

import { createChart, ColorType, AreaSeries, LineSeries } from 'lightweight-charts';
import { useEffect, useRef, useState } from 'react';

// 🧮 이동평균선(SMA) 계산 함수
const calculateSMA = (data: any[], count: number) => {
  const avg = (rows: any[]) => {
    let sum = 0;
    for (let i = 0; i < rows.length; i++) {
      sum += rows[i].value;
    }
    return sum / rows.length;
  };

  const result = [];
  for (let i = count - 1; i < data.length; i++) {
    const val = avg(data.slice(i - count + 1, i + 1));
    result.push({ time: data[i].time, value: val });
  }
  return result;
};

export default function SectorChart({ ticker, change }: { ticker: string, change: number }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 1. API에서 진짜 데이터 가져오기
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/chart?ticker=${ticker}`);
        const json = await res.json();
        if (json.data) {
          setChartData(json.data);
        }
      } catch (error) {
        console.error("차트 로딩 실패:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (ticker) {
      fetchData();
    }
  }, [ticker]);

  // 2. 데이터가 오면 차트 그리기
  useEffect(() => {
    if (!chartContainerRef.current || chartData.length === 0) return;

    // 리포트 톤 토큰을 그대로 (다크모드 포함)
    const css = getComputedStyle(chartContainerRef.current);
    const token = (n: string, fb: string) => css.getPropertyValue(n).trim() || fb;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: token('--ink-mute', '#8c887f'),
      },
      width: chartContainerRef.current.clientWidth,
      height: 250,
      grid: {
        vertLines: { visible: false }, // 세로선 숨김
        horzLines: { color: token('--hairline', '#ddd9d0') }, // 가로선 연하게
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { 
        borderVisible: false,
        // ✨ [옵션] 줌인 했을 때 날짜가 보여야 안 답답할 것 같아서 켰습니다. 
        // 싫으시면 false로 다시 끄셔도 됩니다.
        visible: true, 
      },
      
      // ✨ [핵심 수정] 줌 & 스크롤 기능 활성화!
      handleScale: {
        mouseWheel: true, // 마우스 휠로 줌인/아웃
        pinch: true,      // 모바일 두 손가락 핀치 줌
        axisPressedMouseMove: true, // 축 클릭 드래그 줌
      },
      handleScroll: {
        mouseWheel: true, // 트랙패드 등으로 이동
        pressedMouseMove: true, // 마우스 드래그로 이동
        horzTouchDrag: true, // 모바일 터치 드래그
        vertTouchDrag: false, // 차트 위에서 세로 스크롤은 페이지 스크롤에 양보
      },
    });

    const lineColor = token('--ink', '#0b0b0b');
    const accent = token('--accent', '#1f3547');

    // 메인 차트 (Area)
    const mainSeries = chart.addSeries(AreaSeries, {
      lineColor: lineColor,
      topColor: accent + '22',
      bottomColor: accent + '00',
      lineWidth: 2,
    });

    // 이동평균선 (Line)
    // 이동평균선은 비강조 — 회색 계열 농도로만 구분
    const sma5Series = chart.addSeries(LineSeries, { color: token('--ink-2', '#5c5952'), lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const sma20Series = chart.addSeries(LineSeries, { color: token('--ink-mute', '#8c887f'), lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
    const sma50Series = chart.addSeries(LineSeries, { color: token('--hairline-2', '#cfcbc0'), lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });

    // 데이터 주입
    mainSeries.setData(chartData);
    sma5Series.setData(calculateSMA(chartData, 5));
    sma20Series.setData(calculateSMA(chartData, 20));
    sma50Series.setData(calculateSMA(chartData, 50));

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData, change]);

  return (
    <div className="w-full h-[250px] relative">
        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10" style={{ background: 'var(--surface)' }}>
                <span className="text-xs" style={{ color: 'var(--ink-mute)' }}>불러오는 중…</span>
            </div>
        )}
        <div ref={chartContainerRef} className="w-full h-full cursor-crosshair" />
    </div>
  );
}