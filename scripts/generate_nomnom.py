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

# ✨ 최소 며칠 이상이어야 인정해줄지 설정
MIN_SCORE_CUTLINE = 4 

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

# -----------------------------------------------------------
# 3. 분석 로직
# -----------------------------------------------------------
def analyze_stock(file_path, file_ticker_name, alias_map):
    data = load_json(file_path)
    if not data or 'data' not in data or len(data['data']) < 5: return None

    daily = data['data']
    meta = data.get('meta', {})
    ticker = meta.get('ticker', '')

    last = daily[-1]
    prev_5 = daily[-5]
    
    current_price = last.get('price', 0)
    prev_price = prev_5.get('price', 0)
    
    # ✨ [핵심 수정 1] 데이터의 실제 날짜 가져오기
    last_date = last.get('date', '') 
    
    if current_price == 0 or prev_price == 0: return None

    price_change_pct = (current_price - prev_price) / prev_price
    recent_5_days = daily[-5:]
    net_buy_sum = sum(d.get('netBuy', 0) for d in recent_5_days)

    # 10일치 빈도 계산
    check_days = 10
    recent_days = daily[-check_days:] if len(daily) >= check_days else daily
    
    buy_days_count = sum(1 for d in recent_days if d.get('netBuy', 0) > 0)
    sell_days_count = sum(1 for d in recent_days if d.get('netBuy', 0) < 0)

    korean_name = alias_map.get(ticker.upper()) or alias_map.get(meta.get('name', '').upper()) or ""

    return {
        "name": meta.get('name', ''),
        "name_kr": korean_name,
        "ticker": ticker,
        "file_ticker": file_ticker_name, 
        "close": current_price,
        "price_change": price_change_pct,
        "net_buy_sum": net_buy_sum,
        "buy_score": buy_days_count,    
        "sell_score": sell_days_count,
        "last_date": last_date  # ✨ 날짜 반환 추가
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
    print(f"🚀 놈놈놈 분석 V5 시작 (최소 {MIN_SCORE_CUTLINE}일 이상만 합격)...")
    
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

    for stock in analyzed_pool:
        pct = stock['price_change']
        net = stock['net_buy_sum']
        
        if pct > 0.03 and net < 0: pools['fire'].append(stock)
        elif pct > 0.05 and net > 0: pools['top'].append(stock)
        elif pct < -0.05 and net < 0: pools['bottom'].append(stock)
        elif pct < -0.03 and net > 0: pools['knife'].append(stock)

    def pick_qualified_best(category_pool, score_key, sort_key_func):
        if not category_pool: return None
        sorted_pool = sorted(category_pool, key=sort_key_func, reverse=True)
        best_pick = sorted_pool[0]
        
        if best_pick[score_key] < MIN_SCORE_CUTLINE:
            # print(f"⚠️ 1등 과락 ({best_pick['ticker']}) -> 패스")
            return None
        return best_pick

    # 카테고리별 선발
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

    # 저장
    if not os.path.exists(FLOW_DIR): os.makedirs(FLOW_DIR)
    
    # nom_nom_data.json 저장 (이건 UI 표시용이라 덮어쓰기)
    with open(os.path.join(FLOW_DIR, 'nom_nom_data.json'), 'w', encoding='utf-8') as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)
    
    # ✨ [핵심 수정 2] 히스토리 파일명 결정 (데이터 기준)
    if not os.path.exists(HISTORY_DIR): os.makedirs(HISTORY_DIR)
    
    # 기본값은 오늘 날짜지만...
    file_date_str = datetime.datetime.now().strftime("%Y%m%d")
    
    # 결과가 하나라도 있으면, 그 종목의 데이터 날짜를 씁니다.
    # (예: 미국장 금요일 데이터면 20240109가 나옴)
    found_date = None
    for key in ['fire', 'top', 'bottom', 'knife']:
        if key in final_result and 'last_date' in final_result[key]:
            found_date = final_result[key]['last_date'] # YYYY-MM-DD
            break
            
    if found_date:
        file_date_str = found_date.replace('-', '') # YYYYMMDD 변환
        print(f"📅 데이터 기준 날짜 감지: {file_date_str} (미국 현지 시간)")
    else:
        print(f"📅 데이터 날짜 감지 실패, 시스템 시간 사용: {file_date_str}")

    with open(os.path.join(HISTORY_DIR, f"history_{file_date_str}.json"), 'w', encoding='utf-8') as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)

    print(f"✅ V5 완료! 저장된 파일명: history_{file_date_str}.json")

if __name__ == "__main__":
    main()