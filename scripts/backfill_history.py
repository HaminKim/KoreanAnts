import json
import os
import datetime
import glob

# -----------------------------------------------------------
# 1. 설정 및 경로
# -----------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'public', 'data')

FLOW_DIR = os.path.join(DATA_DIR, 'flow')
HISTORY_DIR = os.path.join(DATA_DIR, 'history')

MAP_FILE = os.path.join(DATA_DIR, 'ticker_map.json')
NAME_ALIAS_FILE = os.path.join(DATA_DIR, 'name_alias.json')

# ✨ 최소 점수 (과락 기준)
MIN_SCORE_CUTLINE = 4 

# -----------------------------------------------------------
# 2. 유틸리티 함수
# -----------------------------------------------------------
def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def get_comment(type_key):
    comments = {
        "fire": "개미 털고 세력 떡상 중 🚀",
        "top": "고점 판독기 삐빅... 조심해 ⚠️",
        "bottom": "공포에 줍줍할 기회인가 💎",
        "knife": "물타기하다 익사한다... 도망쳐! 🩸"
    }
    return comments.get(type_key, "")

# -----------------------------------------------------------
# 3. ✨ [핵심] 티커 기준 마스터 매핑 생성 함수
# -----------------------------------------------------------
def create_master_map():
    print("🗺️ 티커 기준 한글 이름 매핑 생성 중...")
    
    # 1. 파일 로드 (없으면 빈 딕셔너리)
    name_alias = load_json(NAME_ALIAS_FILE) or {} # "ENGLISH NAME": "한글 이름"
    ticker_map = load_json(MAP_FILE) or {}        # "ENGLISH NAME": "TICKER"
    
    # 검색 편의를 위해 키(영어이름)를 모두 대문자로 정리한 임시 맵 생성
    norm_name_alias = {k.upper().strip(): v for k, v in name_alias.items()}
    norm_ticker_map = {k.upper().strip(): v for k, v in ticker_map.items()}

    master_map = {} # 결과물: {"TSLA": "테슬라", "AAPL": "애플", ...}

    # 2. 로직: Ticker Map의 영어 이름을 키로 사용해 Alias Map에서 한글을 찾음
    for eng_name, ticker in norm_ticker_map.items():
        clean_ticker = str(ticker).upper().strip()
        
        # 영어 이름으로 한글 이름 찾기
        korean_name = norm_name_alias.get(eng_name)
        
        if korean_name:
            master_map[clean_ticker] = korean_name
    
    # 3. 보완: Alias Map 자체에 티커가 키로 들어있는 경우 (예: "TSLA": "테슬라")
    for key, val in norm_name_alias.items():
        # 키가 5글자 이하이고 알파벳이면 티커로 간주
        if len(key) <= 5 and key.isalpha():
            master_map[key] = val

    print(f"✅ 총 {len(master_map)}개의 티커-한글 매핑 준비 완료!")
    return master_map

# -----------------------------------------------------------
# 4. 데이터 로드
# -----------------------------------------------------------
def load_all_stocks():
    print("📂 모든 종목 데이터 로딩 중...")
    stock_db = []
    files = glob.glob(os.path.join(FLOW_DIR, "*_all.json"))
    
    for path in files:
        data = load_json(path)
        if data and 'data' in data and len(data['data']) > 10:
            filename = os.path.basename(path).replace('_all.json', '')
            data['file_ticker'] = filename
            stock_db.append(data)
            
    print(f"📊 총 {len(stock_db)}개 종목 로드 완료.")
    return stock_db

# -----------------------------------------------------------
# 5. 과거 복원 엔진 (티커 매핑 적용 + 날짜 수정)
# -----------------------------------------------------------
def generate_history(stock_db, master_map):
    
    today = datetime.datetime.now()
    target_dates = []
    for i in range(60): # 과거 60일치
        d = today - datetime.timedelta(days=i)
        target_dates.append(d.strftime('%Y-%m-%d'))
    
    target_dates.reverse()

    if not os.path.exists(HISTORY_DIR):
        os.makedirs(HISTORY_DIR)

    print(f"🚀 과거 데이터 복원 시작...")
    
    # 중복 저장 방지용 (날짜 기준)
    saved_dates = set()

    for target_date_str in target_dates:
        
        analyzed_pool = []
        actual_data_date = "" # 이 루프에서 발견된 '진짜 데이터 날짜'

        for stock in stock_db:
            daily_list = stock['data']
            meta = stock.get('meta', {})
            
            # ✨ 티커 가져오기 (대문자 변환)
            ticker = str(meta.get('ticker', '')).upper().strip()
            
            # target_date 시점의 데이터만 자르기
            past_data = [d for d in daily_list if d.get('date', '') <= target_date_str]
            
            if len(past_data) < 10: continue

            curr = past_data[-1]      
            prev_5 = past_data[-5]
            
            # ✨ [핵심] 현재 데이터의 '진짜 날짜' 확보 (파일 저장명으로 사용)
            if not actual_data_date:
                actual_data_date = curr.get('date', '')

            current_price = curr.get('price', 0)
            prev_price = prev_5.get('price', 0)
            
            if current_price == 0 or prev_price == 0: continue

            price_change = (current_price - prev_price) / prev_price
            
            recent_5_days = past_data[-5:]
            net_buy_sum = sum(d.get('netBuy', 0) for d in recent_5_days)
            
            recent_10_days = past_data[-10:]
            buy_score = sum(1 for d in recent_10_days if d.get('netBuy', 0) > 0)
            sell_score = sum(1 for d in recent_10_days if d.get('netBuy', 0) < 0)
            
            # ✨ [핵심 수정] 티커로 한글 이름 찾기 (없으면 원래 이름 사용)
            korean_name = master_map.get(ticker)
            if not korean_name:
                korean_name = meta.get('name', '') # 최후의 수단

            analyzed_pool.append({
                "name": meta.get('name', ''),
                "name_kr": korean_name, # 이제 여기가 정확한 한글이 됨
                "ticker": ticker,
                "file_ticker": stock.get('file_ticker', ''),
                "close": current_price,
                "price_change": price_change,
                "net_buy_sum": net_buy_sum,
                "buy_score": buy_score,
                "sell_score": sell_score,
                "last_date": curr.get('date', '') 
            })

        # -------------------------------------------------------
        # 선발 로직
        # -------------------------------------------------------
        final_result = {}
        pools = {"fire": [], "top": [], "bottom": [], "knife": []}

        for item in analyzed_pool:
            pct = item['price_change']
            net = item['net_buy_sum']
            
            if pct > 0.03 and net < 0: pools['fire'].append(item)
            elif pct > 0.05 and net > 0: pools['top'].append(item)
            elif pct < -0.05 and net < 0: pools['bottom'].append(item)
            elif pct < -0.03 and net > 0: pools['knife'].append(item)

        def pick_qualified_best(category_pool, score_key, sort_key_func):
            if not category_pool: return None
            sorted_pool = sorted(category_pool, key=sort_key_func, reverse=True)
            best_pick = sorted_pool[0]
            if best_pick[score_key] < MIN_SCORE_CUTLINE:
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

        # ✨ [저장 로직] 실제 데이터 날짜로 파일명 생성
        save_date_str = ""
        
        # 1. 선발된 종목 중 하나의 날짜 확인
        if final_result:
            for key in final_result:
                if 'last_date' in final_result[key]:
                    save_date_str = final_result[key]['last_date']
                    break
        
        # 2. 없으면(다 과락이면) 해당 시점의 데이터 날짜 사용
        if not save_date_str:
             save_date_str = actual_data_date 
        
        if not save_date_str:
            continue 

        # YYYY-MM-DD -> YYYYMMDD
        file_name_date = save_date_str.replace('-', '')
        
        # 이미 저장한 날짜면 스킵 (효율성) -> 하지만 덮어쓰기 위해 저장 진행
        # if file_name_date in saved_dates: continue
        # saved_dates.add(file_name_date)

        if final_result:
            save_path = os.path.join(HISTORY_DIR, f"history_{file_name_date}.json")
            with open(save_path, 'w', encoding='utf-8') as f:
                json.dump(final_result, f, ensure_ascii=False, indent=2)

    print("\n🎉 모든 과거 데이터 복원 완료! (티커 매핑 + 날짜 보정 적용됨)")

if __name__ == "__main__":
    # 1. 마스터 맵 생성 (강력한 매핑)
    master_map = create_master_map()
    
    # 2. 데이터 로드
    stock_db = load_all_stocks()
    
    # 3. 과거 생성 실행
    if stock_db:
        generate_history(stock_db, master_map)