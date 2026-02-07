'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import FlowChart from '../components/FlowChart';
import { createClient } from '@/utils/supabase/client';

type MetaData = { name: string; ticker: string; lastUpdate: string };
type Row = { date: string; netBuy: number; price?: number };

function formatMoneyKR(val: number) {
    const absVal = Math.abs(val);
    if (absVal >= 100000000) return `${(val / 100000000).toFixed(1)}억$`;
    if (absVal >= 10000) return `${(val / 10000).toFixed(0)}만$`;
    return `${val.toLocaleString()}$`;
}

// ✨ [설정] 기본 3회 + 보너스 2회 = 5회
const FREE_LIMIT = 3;
const BONUS_ADD = 2;

export default function FlowClient() {
  const params = useSearchParams();
  const ticker = params.get('ticker') ?? '';
  const fileTicker = params.get('fileTicker') ?? ticker;
  const supabase = createClient();
  
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<MetaData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [aliasMap, setAliasMap] = useState<Record<string, string>>({});

  const [isLocked, setIsLocked] = useState(false);
  const [bonusKey, setBonusKey] = useState(0);

  // ✨ 구독 여부 및 로딩 상태
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true); // 🚀 핵심: 초기값 true

  // 0-1. 구독자 체크 (제일 먼저 실행)
  useEffect(() => {
    const checkSubscription = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data } = await supabase
                    .from('subscriptions')
                    .select('*')
                    .eq('user_id', session.user.id)
                    .eq('status', 'active')
                    .gt('end_date', new Date().toISOString())
                    .single();
                
                if (data) setIsSubscribed(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            // ✨ [핵심] 체크가 끝나면 로딩 해제!
            setIsLoadingAuth(false);
        }
    };
    checkSubscription();
  }, [supabase]);

  // 0-2. 조회수 제한 로직 (Auth 로딩 끝나면 실행)
  useEffect(() => {
    if (!ticker) return;
    
    // ✨ [핵심 방어] 아직 구독자인지 확인 중이면 판단하지 마! (깜빡임 방지)
    if (isLoadingAuth) return;

    // ✨ 구독자면 무조건 잠금 해제 & 종료
    if (isSubscribed) {
        setIsLocked(false);
        return;
    }

    const storageKey = 'reant_chart_views';
    const today = new Date().toDateString(); 
    const currentTicker = ticker.toUpperCase();
    
    let saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    if (saved.date !== today) {
        saved = { date: today, count: 0, viewedTickers: [], hasBonus: false };
    }
    if (!Array.isArray(saved.viewedTickers)) saved.viewedTickers = [];

    const currentLimit = saved.hasBonus ? (FREE_LIMIT + BONUS_ADD) : FREE_LIMIT;

    if (!saved.viewedTickers.includes(currentTicker)) {
        if (saved.count < currentLimit) {
            saved.count = (saved.count || 0) + 1;
            saved.viewedTickers.push(currentTicker);
            localStorage.setItem(storageKey, JSON.stringify(saved));
        }
    }

    const isAlreadyViewed = saved.viewedTickers.includes(currentTicker);
    
    // 안 본 종목이고 한도 초과면 잠금
    if (!isAlreadyViewed && saved.count >= currentLimit) {
         setIsLocked(true);
    } else {
         setIsLocked(false);
    }
    
  }, [ticker, bonusKey, isSubscribed, isLoadingAuth]); // ✨ isLoadingAuth 의존성 추가

  // ... (공유하기 헬퍼)
  const handleShare = async () => {
    const url = window.location.href;
    const shareData = { title: `REANT - ${fileTicker}`, text: `${fileTicker} 수급 분석`, url: url };
    try {
        if (navigator.share) await navigator.share(shareData);
        else { await navigator.clipboard.writeText(url); alert('링크가 복사되었습니다!'); }
    } catch (e) {}

    const storageKey = 'reant_chart_views';
    let saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    
    if (!saved.hasBonus) {
        saved.hasBonus = true; 
        if (!saved.date) saved.date = new Date().toDateString();
        localStorage.setItem(storageKey, JSON.stringify(saved));
        setBonusKey(prev => prev + 1); 
        setIsLocked(false);
        alert(`🎉 공유 완료!\n추가로 ${BONUS_ADD}종목을 더 보실 수 있습니다.`);
    } else {
        alert(`이미 보너스를 받으셨습니다!`);
    }
  };

  useEffect(() => {
    Promise.all([fetch('/data/name_alias.json').then(res => res.json()), fetch('/data/ticker_map.json').then(res => res.json())])
    .then(([nameData]) => setAliasMap(nameData));
  }, []);

  useEffect(() => {
    if (!ticker) return; 
    (async () => {
      try {
        setLoading(true);
        const safeTicker = ticker.toUpperCase().replace(/[^A-Z0-9]/g, "_");
        const res = await fetch(`/data/flow/${safeTicker}_all.json`, { cache: 'no-store' });
        if (!res.ok) throw new Error('데이터 없음');
        const text = await res.text();
        const json = JSON.parse(text.replace(/:\s*NaN/g, ': null'));
        setRows(json.data ?? []);
        setMeta(json.meta ?? null);
      } catch (e) { setRows([]); setErr('데이터를 불러올 수 없습니다.'); } finally { setLoading(false); }
    })();
  }, [ticker]);

  const priceInfo = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    if (last.price && prev.price) return { price: last.price, change: last.price - prev.price, changePercent: ((last.price - prev.price) / prev.price) * 100, isUp: last.price > prev.price };
    return null;
  }, [rows]);

  const insightMessage = useMemo(() => {
    if (rows.length < 20) return null; 
    const last = rows[rows.length - 1];
    const row5 = rows[rows.length - 6];   
    const row20 = rows[rows.length - 21]; 
    if (!last?.price || !row5?.price || !row20?.price) return null;
    const c5 = ((last.price - row5.price) / row5.price) * 100;
    const c20 = ((last.price - row20.price) / row20.price) * 100;
    const isLong = Math.abs(c20) > Math.abs(c5);
    return { periodText: isLong ? "지난 한 달 동안" : "최근 일주일 동안", targetChange: isLong ? c20 : c5, netSum5d: rows.slice(-5).reduce((a, c) => a + c.netBuy, 0), isNetBuy: rows.slice(-5).reduce((a, c) => a + c.netBuy, 0) > 0 };
  }, [rows]);

  const normalize = (s: string) => s?.toUpperCase().trim() || '';
  const displayName = aliasMap[normalize(fileTicker)] || aliasMap[normalize(ticker)] || meta?.name || ticker;

  return (
    <div className="w-full pb-20 md:max-w-4xl md:mx-auto md:p-4">
      <div className="px-2 pt-6 pb-2 flex items-center gap-3 bg-white md:bg-transparent">
        <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-100 bg-white shadow-sm shrink-0">
          <Image src={`/logos/${encodeURIComponent(fileTicker)}.png`} alt={ticker} fill className="object-contain p-2" onError={(e) => { const target = e.currentTarget; if (!target.src.includes('_us.png')) target.src = '/logos/_us.png'; }} unoptimized />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2"><h1 className="text-xl font-bold text-gray-900 tracking-tight leading-none">{displayName}</h1><span className="text-sm text-gray-400 font-medium">{ticker}</span></div>
          <div className="flex items-center gap-2 mt-1">
            {priceInfo ? (<><span className={`text-2xl font-bold leading-none ${priceInfo.isUp ? 'text-red-400' : 'text-blue-400'}`}>${priceInfo.price.toLocaleString()}</span><span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${priceInfo.isUp ? 'bg-red-50 text-red-400' : 'bg-blue-50 text-blue-400'}`}>{priceInfo.isUp ? '▲' : '▼'} {Math.abs(priceInfo.changePercent).toFixed(2)}%</span></>) : <span className="text-gray-300 text-xl font-bold">$ --.--</span>}
          </div>
        </div>
      </div>

      <div className="w-full mt-2 relative">
        {/* 잠금 화면 (구독자는 볼 일 없음) */}
        {isLocked && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 text-center rounded-xl overflow-hidden">
                <div className="absolute inset-0 bg-white/60 backdrop-blur-md"></div>
                <div className="relative z-10 bg-white p-6 rounded-2xl shadow-xl border border-gray-100 max-w-xs w-full">
                    <div className="text-4xl mb-3">🔒</div>
                    <h3 className="text-lg font-black text-gray-900 mb-2">무료 조회 한도 초과</h3>
                    <p className="text-sm text-gray-500 mb-6 leading-relaxed">오늘의 무료 리포트를 모두 확인하셨네요.<br/>친구에게 <span className="text-blue-500 font-bold">공유하면 +{BONUS_ADD}회</span> 더 볼 수 있어요.</p>
                    <button onClick={handleShare} className="block w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3.5 rounded-xl active:scale-95 transition-all mb-2 shadow-lg shadow-blue-200">📤 공유하고 +{BONUS_ADD}회 받기</button>
                    <Link href="/pricing" className="block w-full bg-gray-100 text-gray-600 hover:bg-gray-200 font-bold py-3.5 rounded-xl transition-colors">👑모든 종목 잠금 해제</Link>
                    <button onClick={() => window.location.href = '/'} className="mt-3 text-xs text-gray-400 underline decoration-gray-300 underline-offset-4">홈으로 돌아가기</button>
                </div>
            </div>
        )}

        <div className={isLocked ? 'blur-sm pointer-events-none select-none' : ''}>
            {insightMessage && (<div className="px-2 pt-2 pb-4"><div className="bg-gray-50/50 rounded-2xl p-5 border border-gray-100 text-center"><p className="text-lg text-gray-700 font-medium leading-relaxed break-keep">{insightMessage.periodText} <span className={`font-bold ${insightMessage.targetChange > 0 ? 'text-red-400' : 'text-blue-400'}`}>{Math.abs(insightMessage.targetChange).toFixed(1)}% {insightMessage.targetChange > 0 ? '상승' : '하락'}</span>했고,<br />{' '}서학개미들은 <span className={`font-bold ${insightMessage.isNetBuy ? 'text-red-400' : 'text-blue-400'}`}>{formatMoneyKR(insightMessage.netSum5d)} {insightMessage.isNetBuy ? '순매수' : '순매도'}</span>했어요.</p></div></div>)}
            <div className="relative w-full px-1 pb-4">
                {loading && <div className="h-80 flex items-center justify-center text-gray-400 text-sm">데이터 로딩 중...</div>}
                {err && <div className="h-80 flex items-center justify-center text-red-400 text-sm">{err}</div>}
                {!loading && !err && rows.length > 0 && (
                <>
                    <div className="absolute top-0 right-2 z-10 md:top-2 md:right-4"><button onClick={handleShare} className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm border border-gray-200 text-gray-500 px-2.5 py-1 rounded-full shadow-sm hover:bg-gray-50 transition-all text-[11px] font-bold"><span>📤</span><span>공유</span></button></div>
                    <div><FlowChart data={rows} /></div>
                    <div className="flex justify-center gap-4 mt-1 pb-1">
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-red-400 rounded-sm opacity-80"></div><span className="text-xs text-gray-500 font-medium">서학개미 순매수</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 bg-blue-400 rounded-sm opacity-80"></div><span className="text-xs text-gray-500 font-medium">서학개미 순매도</span></div>
                        <div className="flex items-center gap-1.5"><div className="w-8 h-0.5 bg-[#059669] rounded-full"></div><span className="text-xs text-gray-500 font-medium">주가</span></div>
                    </div>
                </>)}
            </div>
        </div>
      </div>
      <div className="mt-8 px-2 border-t border-gray-100 pt-6 text-center"><div className="text-xs font-bold text-gray-400 mb-2">데이터 기반 투자 인사이트, REANT</div><div className="text-[10px] text-gray-300 flex flex-col gap-1"><span>* 주가 기준: 1일 전 종가 (Market Closed)</span>{meta?.lastUpdate && <span>* Last Update: {meta.lastUpdate}</span>}<span>* 본 정보는 투자 참고용이며, 법적 책임은 지지 않습니다.</span></div></div>
    </div>
  );
}