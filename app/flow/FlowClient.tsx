'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { COLORS } from '../constants/colors';

import {
  createChart,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  type IChartApi,
  type Time,
} from 'lightweight-charts';

type Side = 'netBuy' | 'netSell';

type Row = {
  date: string; // YYYY-MM-DD
  net: number;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
};

/* ---------------- utils ---------------- */

function toBusinessDay(ymd: string): Time {
  const [y, m, d] = ymd.split('-').map(Number);
  return { year: y, month: m, day: d } as any;
}

function formatDateDot(ymd: string) {
  return ymd.replaceAll('-', '.');
}

function formatMoneyCompact(v: number) {
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(2)}K`;
  return v.toFixed(0);
}

/* ---------------- component ---------------- */

export default function FlowClient() {
  const params = useSearchParams();

  const ticker = params.get('ticker') ?? '';
  const fileTicker = params.get('fileTicker') ?? ticker;
  const side = (params.get('side') as Side) || 'netBuy';

  const themeColor = COLORS[side];

  /* ---------- state ---------- */

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [showMA5, setShowMA5] = useState(true);
  const [showMA10, setShowMA10] = useState(false);
  const [showMA20, setShowMA20] = useState(false);

  /* ---------- refs ---------- */

  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const histRef = useRef<any>(null);
  const ma5Ref = useRef<any>(null);
  const ma10Ref = useRef<any>(null);
  const ma20Ref = useRef<any>(null);

  /* ---------- data load ---------- */

  useEffect(() => {
    if (!fileTicker) return;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        // ✅ 전체 기간 파일 사용 (파일명이 실제로 존재해야 함!)
        const res = await fetch(
          `/data/flow/${encodeURIComponent(fileTicker)}_all.json`,
          { cache: 'no-store' }
        );

        if (!res.ok) throw new Error(`Flow JSON 로드 실패: ${res.status}`);

        const json = await res.json();
        setRows(json.series ?? []);
      } catch (e: any) {
        setRows([]);
        setErr(e?.message ?? 'Unknown error');
      } finally {
        setLoading(false);
      }
    })();
  }, [fileTicker]);

  /* ---------- derived ---------- */

  const rangeText = useMemo(() => {
    if (!rows.length) return '';
    return `${formatDateDot(rows[0].date)} ~ ${formatDateDot(rows[rows.length - 1].date)}`;
  }, [rows]);

  const last = rows.length ? rows[rows.length - 1] : null;

  const histData = useMemo(
    () =>
      rows.map((r) => ({
        time: toBusinessDay(r.date),
        value: r.net,
        // ✅ 0 기준 빨강/하늘색
        color: r.net >= 0 ? 'rgba(239,68,68,0.65)' : 'rgba(56,189,248,0.70)',
      })),
    [rows]
  );

  const ma5Data = useMemo(
    () =>
      rows
        .filter((r) => r.ma5 !== null)
        .map((r) => ({ time: toBusinessDay(r.date), value: r.ma5! })),
    [rows]
  );

  const ma10Data = useMemo(
    () =>
      rows
        .filter((r) => r.ma10 !== null)
        .map((r) => ({ time: toBusinessDay(r.date), value: r.ma10! })),
    [rows]
  );

  const ma20Data = useMemo(
    () =>
      rows
        .filter((r) => r.ma20 !== null)
        .map((r) => ({ time: toBusinessDay(r.date), value: r.ma20! })),
    [rows]
  );

  /* ---------- chart init (ONLY ONCE) ---------- */

  useEffect(() => {
    const host = hostRef.current;
    if (!host || chartRef.current) return;

    const chart = createChart(host, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.06)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    chartRef.current = chart;

    histRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      lastValueVisible: false,
      priceLineVisible: false,
    });

    ma5Ref.current = chart.addSeries(LineSeries, {
      color: 'rgba(250,204,21,0.95)', // 노랑
      lineWidth: 2,
      visible: showMA5,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    ma10Ref.current = chart.addSeries(LineSeries, {
      color: 'rgba(167,139,250,0.95)', // 보라
      lineWidth: 2,
      visible: showMA10,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    ma20Ref.current = chart.addSeries(LineSeries, {
      color: 'rgba(74,222,128,0.95)', // 초록
      lineWidth: 2,
      visible: showMA20,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    const ro = new ResizeObserver(() => {
      chart.applyOptions({
        width: host.clientWidth,
        height: host.clientHeight,
      });
      chart.timeScale().fitContent();
    });
    ro.observe(host);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      histRef.current = null;
      ma5Ref.current = null;
      ma10Ref.current = null;
      ma20Ref.current = null;
    };
  }, []);

  /* ---------- data update (NO destroy) ---------- */

  useEffect(() => {
    if (!chartRef.current || !histRef.current) return;

    histRef.current.setData(histData);
    ma5Ref.current?.setData(ma5Data);
    ma10Ref.current?.setData(ma10Data);
    ma20Ref.current?.setData(ma20Data);

    chartRef.current.timeScale().fitContent();
  }, [histData, ma5Data, ma10Data, ma20Data]);

  /* ---------- MA toggle ---------- */

  useEffect(() => {
    ma5Ref.current?.applyOptions({ visible: showMA5 });
  }, [showMA5]);

  useEffect(() => {
    ma10Ref.current?.applyOptions({ visible: showMA10 });
  }, [showMA10]);

  useEffect(() => {
    ma20Ref.current?.applyOptions({ visible: showMA20 });
  }, [showMA20]);

  /* ---------- render ---------- */

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">서학개미 수급 흐름</h2>

      <div className="flex items-center gap-4 mb-4">
        <div className={`w-14 h-14 rounded-full border-2 ${themeColor.borderStrong}`} />
        <div className="space-y-1">
          <div className="text-sm text-gray-500">종목</div>
          <div className="text-xl font-semibold">{ticker}</div>

          {rangeText && <div className="text-sm text-gray-500">기간: {rangeText}</div>}

          {last && (
            <div className="text-sm text-gray-300">
              최신({formatDateDot(last.date)}):{' '}
              <span className={last.net >= 0 ? 'text-red-400' : 'text-sky-400'}>
                {formatMoneyCompact(last.net)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* MA 토글 */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setShowMA5((v) => !v)}
          className={`px-3 py-1 rounded border text-sm ${
            showMA5 ? 'bg-gray-700 text-white border-gray-600' : 'text-gray-400 border-gray-700'
          }`}
        >
          MA5
        </button>
        <button
          onClick={() => setShowMA10((v) => !v)}
          className={`px-3 py-1 rounded border text-sm ${
            showMA10 ? 'bg-gray-700 text-white border-gray-600' : 'text-gray-400 border-gray-700'
          }`}
        >
          MA10
        </button>
        <button
          onClick={() => setShowMA20((v) => !v)}
          className={`px-3 py-1 rounded border text-sm ${
            showMA20 ? 'bg-gray-700 text-white border-gray-600' : 'text-gray-400 border-gray-700'
          }`}
        >
          MA20
        </button>
      </div>

      {/* 차트 */}
      <div className={`w-full rounded-lg border ${themeColor.border} p-4`}>
        {loading && <div className="text-sm text-gray-500 mb-2">불러오는 중…</div>}
        {err && <div className="text-sm text-red-500 mb-2">에러: {err}</div>}
        <div ref={hostRef} className="w-full h-80" />
      </div>
    </>
  );
}
