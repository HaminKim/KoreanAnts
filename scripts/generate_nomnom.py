import json
import os
import datetime

# -----------------------------------------------------------
# 1. 설정 및 경로
# -----------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'public', 'data')

TOP10_DIR = os.path.join(DATA_DIR, 'top10')
FLOW_DIR = os.path.join(DATA_DIR, 'flow')
HISTORY_DIR = os.path.join(DATA_DIR, 'history') 

MAP_FILE = os.path.join(DATA_DIR, 'ticker_map.json')
NAME_ALIAS_FILE = os.path.join(DATA_DIR, 'name_alias.json')

TARGET_RANKS = ['netBuy_5.json', 'netBuy_10.json', 'netSell_5.json', 'netSell_10.json']

# ✨ [수정] 최소 점수 완화 (4일 -> 3일)
MIN_SCORE_CUTLINE = 4

# 🚫 ETF 및 파생상품 필터링 키워드
BLACKLIST_KEYWORDS = [
    "ETF", "ETN", "FUND", "TRUST", "LP",          
    "2X", "3X", "-1X", "-2X", "-3X", "1.5X",      
    "BULL", "BEAR", "ULTRA", "SHORT", "LONG",     
    "SHARES", "VANGUARD", "ISHARES", "DIREXION",  
    "PROSHARES", "INVESCO", "SPDR", "SWAP", "VIX", 
    "HOLDINGS", "GROUP", "PARTNERS"               
]

# -----------------------------------------------------------
# 2. 유틸리티 함수
# -----------------------------------------------------------
def load_json(path):
    try:
        if not os.path.exists(path): return None
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def find_stock_file(name_or_ticker):
    if not name_or_ticker: return None
    safe_name = "".join([c if c.isalnum() else "_" for c in name_or_ticker.upper()])
    path = os.path.join(FLOW_DIR, f"{safe_name}_all.json")
    if os.path.exists(path): return path
    return None

def is_etf_keyword(name):
    if not name: return False
    upper_name = name.upper()
    for keyword in BLACKLIST_KEYWORDS:
        if keyword in upper_name:
            return True
    return False

# -----------------------------------------------------------
# 3. 분석 로직
# -----------------------------------------------------------
def analyze_stock(file_path, file_ticker_name, alias_map):
    data = load_json(file_path)
    if not data or 'data' not in data or len(data['data']) < 5: return None

    daily = data['data']
    meta = data.get('meta', {})
    ticker = meta.get('ticker', '')
    stock_name = meta.get('name', '') 

    # ETF 필터링
    if is_etf_keyword(stock_name):
        return None

    last = daily[-1]
    prev_5 = daily[-5]
    
    current_price = last.get('price', 0)
    prev_price = prev_5.get('price', 0)
    
    last_date = last.get('date', '') 
    
    if current_price == 0 or prev_price == 0: return None

    price_change_pct = (current_price - prev_price) / prev_price
    recent_5_days = daily[-5:]
    net_buy_sum = sum(d.get('netBuy', 0) for d in recent_5_days)

    check_days = 10
    recent_days = daily[-check_days:] if len(daily) >= check_days else daily
    
    buy_days_count = sum(1 for d in recent_days if d.get('netBuy', 0) > 0)
    sell_days_count = sum(1 for d in recent_days if d.get('netBuy', 0) < 0)

    korean_name = alias_map.get(ticker.upper()) or alias_map.get(stock_name.upper()) or ""

    return {
        "name": stock_name,
        "name_kr": korean_name,
        "ticker": ticker,
        "file_ticker": file_ticker_name, 
        "close": current_price,
        "price_change": price_change_pct,
        "net_buy_sum": net_buy_sum,
        "buy_score": buy_days_count,    
        "sell_score": sell_days_count,
        "last_date": last_date 
    }

# -----------------------------------------------------------
# 4. 멘트 생성기
# -----------------------------------------------------------
def get_comment(type_key):
    comments = {
        "fire": "개미 털고 세력 떡상 중 🚀",
        "top": "고점 판독기 삐빅... 조심해 ⚠️",
        "bottom": "공포에 줍줍할 기회인가 💎",
        "knife": "물타기하다 익사한다... 도망쳐! 🩸"
    }
    return comments.get(type_key, "")

# -----------------------------------------------------------
# 5. 메인 실행
# -----------------------------------------------------------
def main():
    print(f"🚀 놈놈놈 V7 (기준 완화: {MIN_SCORE_CUTLINE}일) 시작...")
    
    ticker_map = load_json(MAP_FILE) or {}
    normalized_ticker_map = {k.upper().strip(): v for k, v in ticker_map.items()}
    
    name_alias_map = load_json(NAME_ALIAS_FILE) or {}
    normalized_alias_map = {k.upper(): v for k, v in name_alias_map.items()}

    candidate_paths = {} 
    for rank_file in TARGET_RANKS:
        path = os.path.join(TOP10_DIR, rank_file)
        rank_data = load_json(path)
        if rank_data and 'items' in rank_data:
            for item in rank_data['items'][:40]: 
                raw_name = item.get('ticker') or item.get('name')
                if not raw_name: continue
                
                file_path = find_stock_file(raw_name)
                if not file_path:
                    short_ticker = normalized_ticker_map.get(raw_name.upper().strip())
                    if short_ticker: file_path = find_stock_file(short_ticker)
                
                if file_path:
                    candidate_paths[file_path] = raw_name

    analyzed_pool = []
    for file_path, raw_name in candidate_paths.items():
        info = analyze_stock(file_path, raw_name, normalized_alias_map) 
        if info: analyzed_pool.append(info)

    final_result = {}
    pools = {"fire": [], "top": [], "bottom": [], "knife": []}

    # ✨ [수정] 등락폭 기준 완화 (더 많은 종목 포착)
    for stock in analyzed_pool:
        pct = stock['price_change']
        net = stock['net_buy_sum']
        
        # Fire: 3% -> 4%
        if pct > 0.04 and net < 0: pools['fire'].append(stock)
        # Top: 5% -> 4%
        elif pct > 0.04 and net > 0: pools['top'].append(stock)
        # Bottom: -5% -> -2.5%
        elif pct < -0.025 and net < 0: pools['bottom'].append(stock)
        # Knife: -3% -> -2%
        elif pct < -0.03 and net > 0: pools['knife'].append(stock)

    def pick_qualified_best(category_pool, score_key, sort_key_func):
        if not category_pool: return None
        sorted_pool = sorted(category_pool, key=sort_key_func, reverse=True)
        best_pick = sorted_pool[0]
        
        if best_pick[score_key] < MIN_SCORE_CUTLINE:
            # print(f"⚠️ 과락: {best_pick['ticker']} (점수: {best_pick[score_key]})")
            return None
        return best_pick

    pick = pick_qualified_best(pools['fire'], 'sell_score', lambda x: (x['sell_score'], x['price_change']))
    if pick:
        pick['comment'] = get_comment('fire')
        final_result['fire'] = pick

    pick = pick_qualified_best(pools['top'], 'buy_score', lambda x: (x['buy_score'], x['net_buy_sum']))
    if pick:
        pick['comment'] = get_comment('top')
        final_result['top'] = pick

    pick = pick_qualified_best(pools['bottom'], 'sell_score', lambda x: (x['sell_score'], -x['net_buy_sum']))
    if pick:
        pick['comment'] = get_comment('bottom')
        final_result['bottom'] = pick

    pick = pick_qualified_best(pools['knife'], 'buy_score', lambda x: (x['buy_score'], x['net_buy_sum']))
    if pick:
        pick['comment'] = get_comment('knife')
        final_result['knife'] = pick

    if not os.path.exists(FLOW_DIR): os.makedirs(FLOW_DIR)
    
    with open(os.path.join(FLOW_DIR, 'nom_nom_data.json'), 'w', encoding='utf-8') as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)
    
    # 히스토리 저장
    if not os.path.exists(HISTORY_DIR): os.makedirs(HISTORY_DIR)
    
    file_date_str = datetime.datetime.now().strftime("%Y%m%d")
    found_date = None
    for key in ['fire', 'top', 'bottom', 'knife']:
        if key in final_result and 'last_date' in final_result[key]:
            found_date = final_result[key]['last_date'] 
            break
            
    if found_date:
        file_date_str = found_date.replace('-', '')

    with open(os.path.join(HISTORY_DIR, f"history_{file_date_str}.json"), 'w', encoding='utf-8') as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)

    print(f"✅ V7 완료! (기준 완화 적용됨) 저장: history_{file_date_str}.json")

if __name__ == "__main__":
    main()