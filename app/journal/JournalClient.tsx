'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { KOREAN_NAMES } from '@/app/constants/stockNames';
import { KR_STOCK_NAMES, displayTicker, tradingViewSymbol } from '@/app/constants/stockNamesKR';

const TradingViewChart = dynamic(
  () => import('@/app/components/TradingViewChart'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-300 text-xs">차트 로딩 중...</div> }
)

// ─── Types ───────────────────────────────────────────────
type WatchItem = {
  id: string;
  ticker: string;
  name: string | null;
  sector: string | null;
  memo: string | null;
  added_at: string;
};

type PaperItem = {
  id: string;
  ticker: string;
  name: string | null;
  buy_price: number;
  quantity: number;
  buy_date: string;
  sell_price: number | null;
  sell_date: string | null;
  memo: string | null;
};

type Tab = 'watchlist' | 'paper';

type WatchMemo = {
  id: string;
  content: string;
  created_at: string;
};

function formatMemoDate(iso: string): string {
  const d = new Date(iso);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  const h  = String(d.getHours()).padStart(2, '0');
  const m  = String(d.getMinutes()).padStart(2, '0');
  const s  = String(d.getSeconds()).padStart(2, '0');
  return `${mo}월 ${day}일 ${h}:${m}:${s}`;
}

// ─── Main Component ───────────────────────────────────────
export default function JournalClient({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('watchlist');
  const supabase = createClient();

  return (
    <div className={`mx-auto py-6 px-2 transition-all ${tab === 'watchlist' ? 'max-w-6xl' : 'max-w-2xl'}`}>
      <h1 className="text-xl font-bold mb-5">📒 내 매매일지</h1>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {([['watchlist', '⭐ 관심종목'], ['paper', '💸 가상매매']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
              tab === key ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'watchlist' && <WatchlistTab userId={userId} supabase={supabase} />}
      {tab === 'paper' && <PaperTab userId={userId} supabase={supabase} />}
    </div>
  );
}

// ─── Tab 1: 관심종목 ─────────────────────────────────────
function WatchlistTab({ userId, supabase }: { userId: string; supabase: ReturnType<typeof createClient> }) {
  const [market, setMarket] = useState<'us' | 'kr'>('us');
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: '', name: '', sector: '', memo: '' });
  const [saving, setSaving] = useState(false);

  const tableName = market === 'kr' ? 'personal_watchlist_kr' : 'personal_watchlist';

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from(tableName)
      .select('*')
      .order('added_at', { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }, [supabase, tableName]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.ticker.trim()) return;
    setSaving(true);
    await supabase.from(tableName).insert({
      user_id: userId,
      ticker: form.ticker.trim(),
      name: form.name.trim() || null,
      sector: form.sector.trim() || null,
      memo: form.memo.trim() || null,
    });
    setForm({ ticker: '', name: '', sector: '', memo: '' });
    setShowForm(false);
    setSaving(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from(tableName).delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateField = async (id: string, fields: Partial<Pick<WatchItem, 'memo' | 'name' | 'sector'>>) => {
    const patch = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, (v as string)?.trim() || null])
    );
    await supabase.from(tableName).update(patch).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  return (
    <div className="space-y-4">
      {/* 🇺🇸 / 🇰🇷 마켓 토글 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
        <button
          onClick={() => { setMarket('us'); setShowForm(false); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${market === 'us' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-gray-700'}`}
        >
          🇺🇸 미국
        </button>
        <button
          onClick={() => { setMarket('kr'); setShowForm(false); }}
          className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${market === 'kr' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-gray-700'}`}
        >
          🇰🇷 한국
        </button>
      </div>

      {/* 다크 요약 카드 */}
      <div className="bg-gray-950 text-white rounded-2xl p-5">
        <div className="flex justify-between items-start mb-5">
          <div>
            <p className="text-gray-400 text-xs mb-1">관심 종목 ({market === 'kr' ? '한국' : '미국'})</p>
            <p className="text-3xl font-black tracking-tight">{items.length}<span className="text-lg font-semibold text-gray-400 ml-1">개</span></p>
            {items.length > 0 && (
              <p className="text-sm text-gray-500 mt-1">
                섹터 {[...new Set(items.map(i => i.sector).filter(Boolean))].length}개 분산
              </p>
            )}
          </div>
          <button
            onClick={() => setShowForm(v => !v)}
            className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
          >
            + 추가
          </button>
        </div>
        {items.length === 0 && (
          <p className="text-gray-500 text-xs text-center">↑ 관심 종목을 추가해보세요</p>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-50 border rounded-xl p-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder={market === 'kr' ? '티커 (예: 005930.KS) *' : '티커 (예: AAPL) *'}
              value={form.ticker}
              onChange={e => {
                const t = market === 'kr' ? e.target.value : e.target.value.toUpperCase();
                const autoName = market === 'kr' ? (KR_STOCK_NAMES[t] || '') : (KOREAN_NAMES[t] || '');
                setForm(p => ({ ...p, ticker: t, name: autoName || p.name }));
              }}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="종목명"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="섹터"
            value={form.sector}
            onChange={e => setForm(p => ({ ...p, sector: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm w-full"
          />
          <textarea
            placeholder="메모"
            value={form.memo}
            onChange={e => setForm(p => ({ ...p, memo: e.target.value }))}
            rows={2}
            className="border rounded-lg px-3 py-2 text-sm w-full resize-none"
          />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-500 px-3 py-1.5">취소</button>
            <button onClick={save} disabled={saving} className="text-sm bg-black text-white px-4 py-1.5 rounded-lg disabled:opacity-50">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-center text-gray-400 text-sm py-10">로딩 중...</p>
      ) : items.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-10">저장된 종목이 없어요</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(item => (
            <WatchCard key={item.id} item={item} onRemove={remove} onUpdate={updateField} supabase={supabase} userId={userId} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}


// ─── InlineEdit ─────────────────────────────────────────
function InlineEdit({
  value, placeholder, onSave, bold, small,
}: {
  value: string | null
  placeholder: string
  onSave: (v: string) => Promise<void>
  bold?: boolean
  small?: boolean
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const save = async () => {
    await onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
        className={`border-b border-gray-300 focus:outline-none bg-transparent ${small ? 'text-xs w-24' : 'text-sm w-32'}`}
      />
    );
  }

  return (
    <button onClick={() => { setDraft(value ?? ''); setEditing(true); }} className="text-left hover:opacity-60 transition-opacity">
      {value ? (
        <span className={`${bold ? 'font-black text-base tracking-tight' : small ? 'text-xs text-gray-400' : 'text-xs text-gray-500'}`}>
          {value}
        </span>
      ) : (
        <span className={`${small ? 'text-[11px]' : 'text-xs'} text-gray-300 hover:text-gray-400 transition-colors`}>
          {placeholder}
        </span>
      )}
    </button>
  );
}

// ─── WatchCard ───────────────────────────────────────────
function WatchCard({
  item, onRemove, onUpdate, supabase, userId, market,
}: {
  item: WatchItem
  onRemove: (id: string) => void
  onUpdate: (id: string, fields: Partial<Pick<WatchItem, 'memo' | 'name' | 'sector'>>) => Promise<void>
  supabase: ReturnType<typeof createClient>
  userId: string
  market: 'us' | 'kr'
}) {
  const router  = useRouter();
  const tvSym   = market === 'kr' ? tradingViewSymbol(item.ticker) : item.ticker;
  const dispTkr = market === 'kr' ? displayTicker(item.ticker) : item.ticker;
  const wlLink  = market === 'kr' ? `/watchlist-kr?stock=${item.ticker}` : `/watchlist?stock=${item.ticker}`;

  return (
    <div className="border rounded-2xl overflow-hidden hover:shadow-lg transition-shadow bg-white">
      <div style={{ height: 260 }}>
        <TradingViewChart symbol={tvSym} height={260} showStudies={false} minimal={true} />
      </div>
      <div className="p-3 border-t border-gray-100 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push(wlLink)}
              className="font-black text-base tracking-tight hover:text-blue-600 transition-colors"
            >
              {dispTkr}
            </button>
            <InlineEdit
              value={item.name}
              placeholder="+ 종목명"
              onSave={v => onUpdate(item.id, { name: v })}
              small
            />
          </div>
          <button onClick={() => onRemove(item.id)} className="text-gray-200 hover:text-red-400 text-xl leading-none transition-colors shrink-0">×</button>
        </div>
        <div className="flex items-center gap-2">
          <InlineEdit
            value={item.sector}
            placeholder="+ 섹터"
            onSave={v => onUpdate(item.id, { sector: v })}
            small
          />
          {item.sector && <span className="text-[11px] text-gray-300">·</span>}
          <span className="text-[11px] text-gray-300">{item.added_at.slice(0, 10)}</span>
        </div>
        <MemoList watchlistId={item.id} userId={userId} supabase={supabase} />
      </div>
    </div>
  );
}

// ─── MemoList ─────────────────────────────────────────────
function MemoList({
  watchlistId, userId, supabase,
}: {
  watchlistId: string
  userId: string
  supabase: ReturnType<typeof createClient>
}) {
  const [memos, setMemos] = useState<WatchMemo[]>([]);
  const [input, setInput] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    supabase
      .from('watchlist_memos')
      .select('id, content, created_at')
      .eq('watchlist_id', watchlistId)
      .order('created_at', { ascending: true })
      .then(({ data }) => setMemos(data ?? []));
  }, [watchlistId, supabase]);

  const add = async () => {
    if (!input.trim() || posting) return;
    setPosting(true);
    const { data } = await supabase
      .from('watchlist_memos')
      .insert({ user_id: userId, watchlist_id: watchlistId, content: input.trim() })
      .select('id, content, created_at')
      .single();
    if (data) setMemos(prev => [...prev, data]);
    setInput('');
    setPosting(false);
  };

  const remove = async (id: string) => {
    await supabase.from('watchlist_memos').delete().eq('id', id);
    setMemos(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="pt-1">
      {memos.length > 0 && (
        <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
          {memos.map(memo => (
            <div key={memo.id} className="flex items-start gap-1.5 group">
              <div className="flex-1 bg-gray-50 rounded-lg px-2.5 py-1.5">
                <p className="text-xs text-gray-700 leading-relaxed">{memo.content}</p>
                <p className="text-[10px] text-gray-300 mt-0.5">{formatMemoDate(memo.created_at)}</p>
              </div>
              <button
                onClick={() => remove(memo.id)}
                className="text-gray-200 hover:text-red-400 text-sm mt-1.5 opacity-0 group-hover:opacity-100 transition-all shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 items-center border-t border-gray-100 pt-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && add()}
          placeholder="메모 추가... (Enter)"
          className="flex-1 text-xs bg-transparent focus:outline-none text-gray-600 placeholder-gray-300"
        />
        {input.trim() && (
          <button
            onClick={add}
            disabled={posting}
            className="text-[10px] text-blue-500 hover:text-blue-700 font-semibold shrink-0"
          >
            등록
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 종목 검색 인풋 (자동완성 포함) ───────────────────────
type StockSuggestion = { ticker: string; fileTicker: string; name_kr: string; name_en: string };

function TickerSearchInput({
  onSelect,
  allStocks,
}: {
  onSelect: (s: StockSuggestion) => void;
  allStocks: StockSuggestion[];
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<StockSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (!val.trim()) { setSuggestions([]); setOpen(false); return; }

    const upper = val.toUpperCase();
    const results = allStocks
      .filter(s =>
        s.ticker.includes(upper) ||
        s.name_en.toUpperCase().includes(upper) ||
        s.name_kr.includes(val)
      )
      .map(s => {
        let score = 0;
        if (s.ticker === upper) score = 100;
        else if (s.ticker.startsWith(upper)) score = 80;
        else if (s.name_kr.startsWith(val)) score = 70;
        else if (s.name_en.toUpperCase().startsWith(upper)) score = 60;
        else if (s.ticker.includes(upper)) score = 40;
        else score = 20;
        return { ...s, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);

    setSuggestions(results);
    setOpen(results.length > 0);
  };

  const select = (s: StockSuggestion) => {
    setQuery(s.ticker);
    setOpen(false);
    setSuggestions([]);
    onSelect(s);
  };

  const confirmDirect = () => {
    if (!query.trim()) return;
    const t = query.trim().toUpperCase();
    select({ ticker: t, fileTicker: t, name_en: t, name_kr: t });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (suggestions.length > 0) select(suggestions[0]);
      else confirmDirect();
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        placeholder="티커 또는 종목명 검색 (예: TSLA, 테슬라)"
        value={query}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        autoFocus
        className="w-full border rounded-xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {query.trim().length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border rounded-xl shadow-xl overflow-hidden max-h-64 overflow-y-auto">
          {suggestions.map(s => (
            <li
              key={s.ticker}
              onMouseDown={() => select(s)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-blue-50 cursor-pointer border-b last:border-none"
            >
              <span className="font-black text-sm">{s.ticker}</span>
              <span className="text-xs text-gray-400 truncate">{s.name_kr !== s.ticker ? s.name_kr : s.name_en}</span>
            </li>
          ))}
          {/* 데이터에 없어도 직접 입력 가능 */}
          <li
            onMouseDown={confirmDirect}
            className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50 cursor-pointer text-gray-400 text-sm"
          >
            <span className="text-base">🔍</span>
            <span><strong className="text-gray-700">{query.trim().toUpperCase()}</strong> 직접 입력 (TradingView 차트 참고)</span>
          </li>
        </ul>
      )}
    </div>
  );
}

// ─── Tab 2: 가상매매 (증권앱 스타일) ─────────────────────
function PaperTab({ userId, supabase }: { userId: string; supabase: ReturnType<typeof createClient> }) {
  const [items, setItems] = useState<PaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [allStocks, setAllStocks] = useState<StockSuggestion[]>([]);
  const [cashDeposited, setCashDeposited] = useState(0);
  const [showAddCash, setShowAddCash] = useState(false);
  const [addCashAmount, setAddCashAmount] = useState('');
  const [showBuyPanel, setShowBuyPanel] = useState(false);
  // 확정된 종목 (자동완성에서 선택 후 세팅)
  const [selectedStock, setSelectedStock] = useState<StockSuggestion | null>(null);
  const [buyForm, setBuyForm] = useState({ price: '', quantity: '', memo: '' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sellTarget, setSellTarget] = useState<string | null>(null);
  const [sellForm, setSellForm] = useState({ sell_price: '', sell_date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const fetchCurrentPrice = async (ticker: string) => {
    setFetchingPrice(true);
    try {
      const res = await fetch(`/api/chart?ticker=${ticker}`);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        const last = json.data[json.data.length - 1];
        setBuyForm(p => ({ ...p, price: String(last.value.toFixed(2)) }));
      }
    } catch {}
    setFetchingPrice(false);
  };

  // 종목 데이터 로드
  useEffect(() => {
    Promise.all([
      fetch('/data/ticker_map.json').then(r => r.json()),
      fetch('/data/name_alias.json').then(r => r.json()),
    ]).then(([mapData, aliasData]) => {
      const dedupMap = new Map<string, StockSuggestion>();
      Object.entries(mapData).forEach(([rawName, tickerVal]) => {
        const ticker = String(tickerVal).toUpperCase();
        const name_kr = aliasData[rawName] || '';
        const item: StockSuggestion = { ticker, fileTicker: rawName, name_en: rawName, name_kr: name_kr || rawName };
        const existing = dedupMap.get(ticker);
        if (!existing) {
          dedupMap.set(ticker, item);
        } else {
          // 한글명 있는 항목 우선
          const hasKorean = /[가-힣]/.test(name_kr);
          const existingHasKorean = /[가-힣]/.test(existing.name_kr);
          if (hasKorean && !existingHasKorean) dedupMap.set(ticker, item);
        }
      });
      setAllStocks(Array.from(dedupMap.values()));
    }).catch(() => {});
  }, []);

  const cashKey = `paper_cash_${userId}`;

  useEffect(() => {
    const saved = localStorage.getItem(cashKey);
    if (saved) setCashDeposited(parseFloat(saved));
  }, [cashKey]);

  const persistCash = (amount: number) => {
    localStorage.setItem(cashKey, String(amount));
    setCashDeposited(amount);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('paper_trade')
      .select('*')
      .order('buy_date', { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // ─── 계산 ───────────────────────────────────────────────
  const holding = items.filter(i => !i.sell_price);
  const closed = items.filter(i => i.sell_price);

  const totalInvested = holding.reduce((sum, i) => sum + i.buy_price * i.quantity, 0);
  const closedBuyCost = closed.reduce((sum, i) => sum + i.buy_price * i.quantity, 0);
  const closedSellProceeds = closed.reduce((sum, i) => sum + i.sell_price! * i.quantity, 0);
  const realizedPnL = closedSellProceeds - closedBuyCost;

  // 현금 = 총 입금 - 현재 보유 매입금액 + 실현손익
  const cashBalance = cashDeposited - totalInvested + realizedPnL;
  const totalPortfolioValue = cashBalance + totalInvested;
  const totalReturn = cashDeposited > 0
    ? ((totalPortfolioValue - cashDeposited) / cashDeposited * 100)
    : 0;
  const winRate = closed.length > 0
    ? Math.round(closed.filter(i => i.sell_price! > i.buy_price).length / closed.length * 100)
    : 0;

  // ─── 액션 ───────────────────────────────────────────────
  const addCash = () => {
    const amount = parseFloat(addCashAmount);
    if (isNaN(amount) || amount <= 0) return;
    persistCash(cashDeposited + amount);
    setAddCashAmount('');
    setShowAddCash(false);
  };

  const buy = async () => {
    if (!selectedStock) return;
    const price = parseFloat(buyForm.price);
    const qty = parseInt(buyForm.quantity);
    if (isNaN(price) || isNaN(qty) || qty <= 0) return;
    if (price * qty > cashBalance) { alert('잔여 현금이 부족합니다'); return; }
    setSaving(true);
    await supabase.from('paper_trade').insert({
      user_id: userId,
      ticker: selectedStock.ticker,
      name: selectedStock.name_kr !== selectedStock.ticker ? selectedStock.name_kr : null,
      buy_price: price,
      quantity: qty,
      buy_date: new Date().toISOString().slice(0, 10),
      memo: buyForm.memo.trim() || null,
    });
    setSelectedStock(null);
    setBuyForm({ price: '', quantity: '', memo: '' });
    setShowBuyPanel(false);
    setSaving(false);
    load();
  };

  const sell = async (id: string) => {
    if (!sellForm.sell_price || !sellForm.sell_date) return;
    await supabase.from('paper_trade').update({
      sell_price: parseFloat(sellForm.sell_price),
      sell_date: sellForm.sell_date,
    }).eq('id', id);
    setSellTarget(null);
    setSellForm({ sell_price: '', sell_date: new Date().toISOString().slice(0, 10) });
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('paper_trade').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const fmt = (n: number) => n.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtInt = (n: number) => n.toLocaleString('en', { maximumFractionDigits: 0 });

  return (
    <div className="space-y-4">

      {/* ── 포트폴리오 요약 카드 ── */}
      <div className="bg-gray-950 text-white rounded-2xl p-5">
        <div className="flex justify-between items-start mb-5">
          <div>
            <p className="text-gray-400 text-xs mb-1">총 평가금액</p>
            <p className="text-3xl font-black tracking-tight">${fmt(totalPortfolioValue)}</p>
            {cashDeposited > 0 && (
              <p className={`text-sm font-semibold mt-1 ${totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalReturn >= 0 ? '+' : ''}{totalReturn.toFixed(2)}%
                <span className="text-gray-500 font-normal ml-1.5 text-xs">총수익률</span>
              </p>
            )}
          </div>
          <button
            onClick={() => setShowAddCash(v => !v)}
            className="text-xs font-semibold bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-full transition-colors whitespace-nowrap"
          >
            + 자금 추가
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-white/10 pt-4">
          <div>
            <p className="text-gray-500 text-[11px] mb-0.5">현금잔고</p>
            <p className="text-sm font-bold">${fmtInt(cashBalance)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-[11px] mb-0.5">매입금액</p>
            <p className="text-sm font-bold">${fmtInt(totalInvested)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-[11px] mb-0.5">실현손익</p>
            <p className={`text-sm font-bold ${realizedPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {realizedPnL >= 0 ? '+' : ''}${fmt(realizedPnL)}
            </p>
          </div>
        </div>
        {cashDeposited === 0 && (
          <p className="text-gray-500 text-xs mt-4 text-center">↑ 자금을 추가하고 시작하세요</p>
        )}
      </div>

      {/* ── 자금 추가 패널 ── */}
      {showAddCash && (
        <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm font-bold">자금 추가</p>
            <span className="text-xs text-gray-400">현재 총 입금: ${fmtInt(cashDeposited)}</span>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="금액 입력 (USD)"
              value={addCashAmount}
              onChange={e => setAddCashAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCash()}
              className="flex-1 border rounded-lg px-3 py-2.5 text-sm"
              autoFocus
            />
            <button onClick={addCash} className="bg-black text-white text-sm px-5 rounded-lg font-semibold">추가</button>
            <button onClick={() => setShowAddCash(false)} className="text-gray-400 text-sm px-2">✕</button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[1000, 5000, 10000, 50000].map(amt => (
              <button
                key={amt}
                onClick={() => setAddCashAmount(String(amt))}
                className="text-xs bg-white border rounded-full px-3 py-1.5 hover:border-gray-400 transition-colors"
              >
                ${amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 매수 패널 ── */}
      {showBuyPanel ? (
        <div className="border rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
            <p className="text-sm font-bold">종목 매수</p>
            <button
              onClick={() => { setShowBuyPanel(false); setSelectedStock(null); setBuyForm({ price: '', quantity: '', memo: '' }); }}
              className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="p-4 space-y-3">

            {/* 종목 미확정: 검색창 표시 */}
            {!selectedStock ? (
              <TickerSearchInput
                allStocks={allStocks}
                onSelect={s => { setSelectedStock(s); setBuyForm({ price: '', quantity: '', memo: '' }); }}
              />
            ) : (
              /* 종목 확정: 선택된 종목 + 변경 버튼 */
              <div className="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-3">
                <div>
                  <span className="font-black text-base">{selectedStock.ticker}</span>
                  {selectedStock.name_kr !== selectedStock.ticker && (
                    <span className="text-xs text-blue-500 ml-2">{selectedStock.name_kr}</span>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedStock(null); setBuyForm({ price: '', quantity: '', memo: '' }); }}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  변경
                </button>
              </div>
            )}

            {/* 종목 확정 후: 차트 + 주문 폼 */}
            {selectedStock && (
              <>
                <div className="rounded-xl overflow-hidden border bg-gray-50" style={{ height: 280 }}>
                  <TradingViewChart symbol={selectedStock.ticker} height={280} showStudies={false} minimal={true} />

                </div>

                {/* 매수가 */}
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">매수가 (USD)</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.00"
                      value={buyForm.price}
                      onChange={e => setBuyForm(p => ({ ...p, price: e.target.value }))}
                      className="flex-1 border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => fetchCurrentPrice(selectedStock.ticker)}
                      disabled={fetchingPrice}
                      className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-600 whitespace-nowrap disabled:opacity-50 transition-colors"
                    >
                      {fetchingPrice ? '조회 중...' : '현재가'}
                    </button>
                  </div>
                </div>

                {/* 수량 */}
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1.5 block">수량 (주)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={buyForm.quantity}
                    onChange={e => setBuyForm(p => ({ ...p, quantity: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {/* 퀵 수량 버튼 (가격 입력 시에만 표시) */}
                  {buyForm.price && parseFloat(buyForm.price) > 0 && (() => {
                    const maxQty = Math.floor(cashBalance / parseFloat(buyForm.price));
                    const tenPct = Math.max(1, Math.floor(maxQty / 10));
                    const currentQty = parseInt(buyForm.quantity) || 0;
                    return maxQty > 0 ? (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => setBuyForm(p => ({ ...p, quantity: String(maxQty) }))}
                          className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-600 transition-colors"
                        >
                          최대
                        </button>
                        <button
                          onClick={() => setBuyForm(p => ({ ...p, quantity: String(Math.floor(maxQty / 2)) }))}
                          className="flex-1 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-bold text-gray-600 transition-colors"
                        >
                          1/2
                        </button>
                        <button
                          onClick={() => setBuyForm(p => ({
                            ...p,
                            quantity: String(Math.min(maxQty, currentQty + tenPct))
                          }))}
                          className="flex-1 py-1.5 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-bold text-blue-600 transition-colors"
                        >
                          +10%
                        </button>
                      </div>
                    ) : null;
                  })()}
                </div>

                {buyForm.price && buyForm.quantity && (
                  <div className="bg-blue-50 rounded-xl px-4 py-3 flex justify-between items-center">
                    <span className="text-xs text-blue-500 font-semibold">총 매수금액</span>
                    <span className="text-lg font-black text-blue-700">
                      ${fmt(parseFloat(buyForm.price) * parseInt(buyForm.quantity))}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-xs px-1">
                  <span className="text-gray-400">사용 가능 현금</span>
                  <span className="font-bold text-gray-700">${fmt(cashBalance)}</span>
                </div>

                <textarea
                  placeholder="메모 (선택사항)"
                  value={buyForm.memo}
                  onChange={e => setBuyForm(p => ({ ...p, memo: e.target.value }))}
                  rows={2}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none"
                />

                <button
                  onClick={buy}
                  disabled={saving || !buyForm.price || !buyForm.quantity}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-black rounded-xl transition-colors disabled:opacity-40 text-sm tracking-wide"
                >
                  {saving ? '주문 처리 중...' : `${selectedStock.ticker} 매수하기`}
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowBuyPanel(true)}
          disabled={cashDeposited === 0}
          className="w-full py-4 border-2 border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + 종목 매수
        </button>
      )}

      {/* ── 보유 종목 ── */}
      {!loading && holding.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            보유종목 ({holding.length})
          </p>
          <div className="space-y-2">
            {holding.map(item => (
              <div key={item.id} className="border rounded-xl overflow-hidden">
                {/* 헤더 (클릭 시 차트 토글) */}
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setSelectedId(selectedId === item.id ? null : item.id)}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-base">{item.ticker}</span>
                      {item.name && <span className="text-xs text-gray-400">{item.name}</span>}
                      <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-bold">보유</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      매수가 ${item.buy_price.toFixed(2)} · {item.quantity}주 · 총
                      <strong className="ml-1">${fmt(item.buy_price * item.quantity)}</strong>
                    </p>
                    <p className="text-[11px] text-gray-300 mt-0.5">{item.buy_date}</p>
                  </div>
                  <svg
                    className={`w-4 h-4 text-gray-300 transition-transform shrink-0 ${selectedId === item.id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* 확장: 차트 + 매도 폼 */}
                {selectedId === item.id && (
                  <div className="border-t">
                    <div style={{ height: 260 }}>
                      <TradingViewChart symbol={item.ticker} height={260} showStudies={false} minimal={true} />
                    </div>
                    <div className="p-3 border-t bg-gray-50 space-y-2">
                      {sellTarget === item.id ? (
                        <>
                          <p className="text-xs font-bold text-gray-600">매도 주문</p>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              placeholder="매도가 (USD)"
                              value={sellForm.sell_price}
                              onChange={e => setSellForm(p => ({ ...p, sell_price: e.target.value }))}
                              className="flex-1 border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                              autoFocus
                            />
                            <input
                              type="date"
                              value={sellForm.sell_date}
                              onChange={e => setSellForm(p => ({ ...p, sell_date: e.target.value }))}
                              className="border rounded-xl px-3 py-2.5 text-sm"
                            />
                          </div>
                          {sellForm.sell_price && (() => {
                            const sp = parseFloat(sellForm.sell_price);
                            const pnl = (sp - item.buy_price) * item.quantity;
                            const pct = (sp - item.buy_price) / item.buy_price * 100;
                            return (
                              <div className={`rounded-xl px-4 py-2.5 flex justify-between items-center ${pnl >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                                <span className="text-xs text-gray-500">예상 손익</span>
                                <span className={`text-sm font-black ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                  <span className="text-xs font-semibold ml-1">({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                                </span>
                              </div>
                            );
                          })()}
                          <div className="flex gap-2">
                            <button
                              onClick={() => sell(item.id)}
                              className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white text-sm font-black rounded-xl"
                            >
                              매도 확인
                            </button>
                            <button
                              onClick={() => setSellTarget(null)}
                              className="px-5 py-3 text-sm text-gray-500 border rounded-xl"
                            >
                              취소
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setSellTarget(item.id); setSellForm({ sell_price: '', sell_date: new Date().toISOString().slice(0, 10) }); }}
                            className="flex-1 py-3 border-2 border-orange-300 text-orange-500 hover:bg-orange-50 text-sm font-bold rounded-xl transition-colors"
                          >
                            매도
                          </button>
                          <button
                            onClick={() => remove(item.id)}
                            className="px-5 py-3 border text-gray-400 hover:text-red-500 hover:border-red-200 text-sm rounded-xl transition-colors"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 청산 내역 ── */}
      {!loading && closed.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
            청산 내역 ({closed.length}) · 승률 {winRate}%
          </p>
          <div className="space-y-2">
            {closed.map(item => {
              const pnl = (item.sell_price! - item.buy_price) * item.quantity;
              const pct = (item.sell_price! - item.buy_price) / item.buy_price * 100;
              return (
                <div key={item.id} className="border rounded-xl p-4 flex justify-between items-center opacity-70 hover:opacity-100 transition-opacity">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-sm">{item.ticker}</span>
                      {item.name && <span className="text-xs text-gray-400">{item.name}</span>}
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${pnl >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {pnl >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      ${item.buy_price.toFixed(2)} → ${item.sell_price!.toFixed(2)} × {item.quantity}주
                      <span className={`ml-2 font-bold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-300 mt-0.5">{item.buy_date} → {item.sell_date}</p>
                  </div>
                  <button onClick={() => remove(item.id)} className="text-gray-300 hover:text-red-400 text-xl ml-3 shrink-0">×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <p className="text-center text-gray-400 text-sm py-10">로딩 중...</p>}
    </div>
  );
}
