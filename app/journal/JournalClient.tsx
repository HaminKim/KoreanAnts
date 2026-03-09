'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/client';
import { KOREAN_NAMES } from '@/app/constants/stockNames';

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

type JournalItem = {
  id: string;
  ticker: string;
  name: string | null;
  entry_date: string | null;
  entry_reason: string | null;
  result: '성공' | '실패' | '홀딩' | '관망' | null;
  memo: string | null;
  created_at: string;
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

type Tab = 'watchlist' | 'journal' | 'paper';

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

const RESULT_COLORS: Record<string, string> = {
  성공: 'bg-green-100 text-green-700',
  실패: 'bg-red-100 text-red-700',
  홀딩: 'bg-blue-100 text-blue-700',
  관망: 'bg-gray-100 text-gray-600',
};

// ─── Main Component ───────────────────────────────────────
export default function JournalClient({ userId }: { userId: string }) {
  const [tab, setTab] = useState<Tab>('watchlist');
  const supabase = createClient();

  return (
    <div className={`mx-auto py-6 px-2 transition-all ${tab === 'watchlist' ? 'max-w-6xl' : 'max-w-2xl'}`}>
      <h1 className="text-xl font-bold mb-5">📒 내 매매일지</h1>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
        {([['watchlist', '⭐ 관심종목'], ['journal', '📝 매매일지'], ['paper', '💸 가상매매']] as const).map(([key, label]) => (
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
      {tab === 'journal' && <JournalTab userId={userId} supabase={supabase} />}
      {tab === 'paper' && <PaperTab userId={userId} supabase={supabase} />}
    </div>
  );
}

// ─── Tab 1: 관심종목 ─────────────────────────────────────
function WatchlistTab({ userId, supabase }: { userId: string; supabase: ReturnType<typeof createClient> }) {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: '', name: '', sector: '', memo: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('personal_watchlist')
      .select('*')
      .order('added_at', { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.ticker.trim()) return;
    setSaving(true);
    await supabase.from('personal_watchlist').insert({
      user_id: userId,
      ticker: form.ticker.trim().toUpperCase(),
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
    await supabase.from('personal_watchlist').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const updateField = async (id: string, fields: Partial<Pick<WatchItem, 'memo' | 'name' | 'sector'>>) => {
    const patch = Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, (v as string)?.trim() || null])
    );
    await supabase.from('personal_watchlist').update(patch).eq('id', id);
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">{items.length}개 저장됨</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800"
        >
          + 추가
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border rounded-xl p-4 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="티커 (예: AAPL) *"
              value={form.ticker}
              onChange={e => {
                const t = e.target.value.toUpperCase();
                setForm(p => ({ ...p, ticker: t, name: KOREAN_NAMES[t] || p.name }));
              }}
              className="border rounded-lg px-3 py-2 text-sm uppercase"
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
            <WatchCard key={item.id} item={item} onRemove={remove} onUpdate={updateField} supabase={supabase} userId={userId} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── InlineEdit: 클릭하면 input으로 전환 ─────────────────
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
  item, onRemove, onUpdate, supabase, userId,
}: {
  item: WatchItem
  onRemove: (id: string) => void
  onUpdate: (id: string, fields: Partial<Pick<WatchItem, 'memo' | 'name' | 'sector'>>) => Promise<void>
  supabase: ReturnType<typeof createClient>
  userId: string
}) {
  const router = useRouter();

  return (
    <div className="border rounded-2xl overflow-hidden hover:shadow-lg transition-shadow bg-white">
      {/* 차트 미리보기 */}
      <div style={{ height: 260 }}>
        <TradingViewChart symbol={item.ticker} height={260} showStudies={false} minimal={true} />
      </div>

      {/* 정보 */}
      <div className="p-3 border-t border-gray-100 space-y-2">

        {/* 티커(클릭→히트맵 상세) + 종목명(인라인편집) + 삭제 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => router.push(`/watchlist?stock=${item.ticker}`)}
              className="font-black text-base tracking-tight hover:text-blue-600 transition-colors"
            >
              {item.ticker}
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

        {/* 섹터(인라인편집) + 날짜 */}
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

        {/* SNS 메모 */}
        <MemoList watchlistId={item.id} userId={userId} supabase={supabase} />
      </div>
    </div>
  );
}

// ─── MemoList: SNS 댓글 스타일 ───────────────────────────
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
      {/* 메모 목록 */}
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

      {/* 입력창 */}
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

// ─── Tab 2: 매매일지 ─────────────────────────────────────
function JournalTab({ userId, supabase }: { userId: string; supabase: ReturnType<typeof createClient> }) {
  const [items, setItems] = useState<JournalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<string>('전체');
  const [form, setForm] = useState({
    ticker: '', name: '', entry_date: '', entry_reason: '', result: '홀딩', memo: ''
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('trade_journal')
      .select('*')
      .order('created_at', { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.ticker.trim()) return;
    setSaving(true);
    await supabase.from('trade_journal').insert({
      user_id: userId,
      ticker: form.ticker.trim().toUpperCase(),
      name: form.name.trim() || null,
      entry_date: form.entry_date || null,
      entry_reason: form.entry_reason.trim() || null,
      result: form.result as JournalItem['result'],
      memo: form.memo.trim() || null,
    });
    setForm({ ticker: '', name: '', entry_date: '', entry_reason: '', result: '홀딩', memo: '' });
    setShowForm(false);
    setSaving(false);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('trade_journal').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = filter === '전체' ? items : items.filter(i => i.result === filter);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div className="flex gap-1 flex-wrap">
          {['전체', '성공', '실패', '홀딩', '관망'].map(r => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-all ${filter === r ? 'bg-black text-white border-black' : 'text-gray-500 border-gray-200 hover:border-gray-400'}`}
            >
              {r}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 shrink-0"
        >
          + 추가
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border rounded-xl p-4 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="티커 *"
              value={form.ticker}
              onChange={e => {
                const t = e.target.value.toUpperCase();
                setForm(p => ({ ...p, ticker: t, name: KOREAN_NAMES[t] || p.name }));
              }}
              className="border rounded-lg px-3 py-2 text-sm uppercase"
            />
            <input
              placeholder="종목명"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={form.entry_date}
              onChange={e => setForm(p => ({ ...p, entry_date: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={form.result}
              onChange={e => setForm(p => ({ ...p, result: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option>홀딩</option>
              <option>성공</option>
              <option>실패</option>
              <option>관망</option>
            </select>
          </div>
          <textarea
            placeholder="진입 근거"
            value={form.entry_reason}
            onChange={e => setForm(p => ({ ...p, entry_reason: e.target.value }))}
            rows={2}
            className="border rounded-lg px-3 py-2 text-sm w-full resize-none"
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
      ) : filtered.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-10">기록이 없어요</p>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="border rounded-xl p-3 hover:bg-gray-50">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm">{item.ticker}</span>
                  {item.name && <span className="text-gray-500 text-xs">{item.name}</span>}
                  {item.result && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RESULT_COLORS[item.result]}`}>
                      {item.result}
                    </span>
                  )}
                  {item.entry_date && <span className="text-xs text-gray-400">{item.entry_date}</span>}
                </div>
                <button onClick={() => remove(item.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none ml-2">×</button>
              </div>
              {item.entry_reason && (
                <p className="text-xs text-gray-600 mt-1.5 bg-gray-50 px-2 py-1 rounded-lg">📌 {item.entry_reason}</p>
              )}
              {item.memo && <p className="text-xs text-gray-400 mt-1">{item.memo}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tab 3: 가상매매 ─────────────────────────────────────
function PaperTab({ userId, supabase }: { userId: string; supabase: ReturnType<typeof createClient> }) {
  const [items, setItems] = useState<PaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [sellTarget, setSellTarget] = useState<string | null>(null);
  const [sellForm, setSellForm] = useState({ sell_price: '', sell_date: '' });
  const [form, setForm] = useState({ ticker: '', name: '', buy_price: '', quantity: '', buy_date: '', memo: '' });
  const [saving, setSaving] = useState(false);

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

  const save = async () => {
    if (!form.ticker.trim() || !form.buy_price || !form.quantity || !form.buy_date) return;
    setSaving(true);
    await supabase.from('paper_trade').insert({
      user_id: userId,
      ticker: form.ticker.trim().toUpperCase(),
      name: form.name.trim() || null,
      buy_price: parseFloat(form.buy_price),
      quantity: parseInt(form.quantity),
      buy_date: form.buy_date,
      memo: form.memo.trim() || null,
    });
    setForm({ ticker: '', name: '', buy_price: '', quantity: '', buy_date: '', memo: '' });
    setShowForm(false);
    setSaving(false);
    load();
  };

  const saveSell = async (id: string) => {
    if (!sellForm.sell_price || !sellForm.sell_date) return;
    await supabase.from('paper_trade').update({
      sell_price: parseFloat(sellForm.sell_price),
      sell_date: sellForm.sell_date,
    }).eq('id', id);
    setSellTarget(null);
    setSellForm({ sell_price: '', sell_date: '' });
    load();
  };

  const remove = async (id: string) => {
    await supabase.from('paper_trade').delete().eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const holding = items.filter(i => !i.sell_price);
  const closed = items.filter(i => i.sell_price);

  const totalPnL = closed.reduce((sum, i) => {
    return sum + (i.sell_price! - i.buy_price) * i.quantity;
  }, 0);

  return (
    <div>
      {/* 요약 */}
      {closed.length > 0 && (
        <div className="bg-gray-50 border rounded-xl p-3 mb-4 flex gap-4 text-sm">
          <div>
            <p className="text-gray-400 text-xs">청산 종목</p>
            <p className="font-bold">{closed.length}개</p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">총 손익</p>
            <p className={`font-bold ${totalPnL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-gray-400 text-xs">승률</p>
            <p className="font-bold">
              {Math.round((closed.filter(i => (i.sell_price! - i.buy_price) > 0).length / closed.length) * 100)}%
            </p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-gray-500">보유 {holding.length}개 · 청산 {closed.length}개</span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm bg-black text-white px-3 py-1.5 rounded-lg hover:bg-gray-800"
        >
          + 매수
        </button>
      </div>

      {showForm && (
        <div className="bg-gray-50 border rounded-xl p-4 mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              placeholder="티커 *"
              value={form.ticker}
              onChange={e => {
                const t = e.target.value.toUpperCase();
                setForm(p => ({ ...p, ticker: t, name: KOREAN_NAMES[t] || p.name }));
              }}
              className="border rounded-lg px-3 py-2 text-sm uppercase"
            />
            <input
              placeholder="종목명"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              placeholder="매수가 *"
              type="number"
              value={form.buy_price}
              onChange={e => setForm(p => ({ ...p, buy_price: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              placeholder="수량 *"
              type="number"
              value={form.quantity}
              onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="date"
              value={form.buy_date}
              onChange={e => setForm(p => ({ ...p, buy_date: e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm"
            />
          </div>
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
        <p className="text-center text-gray-400 text-sm py-10">가상 매수 내역이 없어요</p>
      ) : (
        <div className="space-y-2">
          {/* 보유 중 */}
          {holding.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-1">보유 중</p>
              {holding.map(item => (
                <div key={item.id} className="border rounded-xl p-3 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{item.ticker}</span>
                        {item.name && <span className="text-gray-500 text-xs">{item.name}</span>}
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">보유</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        ${item.buy_price.toFixed(2)} × {item.quantity}주 = <strong>${(item.buy_price * item.quantity).toFixed(2)}</strong>
                      </p>
                      <p className="text-xs text-gray-400">{item.buy_date}</p>
                      {item.memo && <p className="text-xs text-gray-400 mt-0.5">{item.memo}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-2">
                      <button onClick={() => remove(item.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
                      <button
                        onClick={() => { setSellTarget(item.id); setSellForm({ sell_price: '', sell_date: '' }); }}
                        className="text-xs text-orange-500 hover:text-orange-700 border border-orange-200 px-2 py-0.5 rounded-lg"
                      >
                        매도
                      </button>
                    </div>
                  </div>
                  {sellTarget === item.id && (
                    <div className="mt-2 flex gap-2 items-center">
                      <input
                        placeholder="매도가"
                        type="number"
                        value={sellForm.sell_price}
                        onChange={e => setSellForm(p => ({ ...p, sell_price: e.target.value }))}
                        className="border rounded-lg px-2 py-1 text-xs flex-1"
                      />
                      <input
                        type="date"
                        value={sellForm.sell_date}
                        onChange={e => setSellForm(p => ({ ...p, sell_date: e.target.value }))}
                        className="border rounded-lg px-2 py-1 text-xs"
                      />
                      <button onClick={() => saveSell(item.id)} className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg">확인</button>
                      <button onClick={() => setSellTarget(null)} className="text-xs text-gray-400">취소</button>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {/* 청산 */}
          {closed.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-3">청산 완료</p>
              {closed.map(item => {
                const pnl = (item.sell_price! - item.buy_price) * item.quantity;
                const pct = ((item.sell_price! - item.buy_price) / item.buy_price * 100);
                return (
                  <div key={item.id} className="border rounded-xl p-3 hover:bg-gray-50 opacity-80">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm">{item.ticker}</span>
                          {item.name && <span className="text-gray-500 text-xs">{item.name}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${pnl >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {pnl >= 0 ? '+' : ''}{pct.toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          ${item.buy_price.toFixed(2)} → ${item.sell_price!.toFixed(2)} × {item.quantity}주
                          <span className={`ml-2 font-semibold ${pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                          </span>
                        </p>
                        <p className="text-xs text-gray-400">{item.buy_date} → {item.sell_date}</p>
                      </div>
                      <button onClick={() => remove(item.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none ml-2">×</button>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
