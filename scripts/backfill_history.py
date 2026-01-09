import json
import os
import datetime
import glob

# -----------------------------------------------------------
# 1. 설정 및 경로
# -----------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'public', 'data')

FLOW_DIR = os.path.join(DATA_DIR, 'flow')     # 👈 여기서 주가 데이터 가져옴
HISTORY_DIR = os.path.join(DATA_DIR, 'history')

MAP_FILE = os.path.join(DATA_DIR, 'ticker_map.json')
NAME_ALIAS_FILE = os.path.join(DATA_DIR, 'name_alias.json')

# ✨ V5 기준: 최소 4일 이상 수급 지속되어야 합격
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
# 3. 모든 데이터 메모리에 로드 (JSON 읽기)
# -----------------------------------------------------------
def load_all_stocks():
    print("📂 모든 종목 데이터(JSON) 로딩 중...")
    
    stock_db = [] # [{meta:..., data:[...]}, ...]
    
    # flow 폴더의 모든 json 파일 탐색
    files = glob.glob(os.path.join(FLOW_DIR, "*_all.json"))
    
    for path in files:
        data = load_json(path)
        if data and 'data' in data and len(data['data']) > 10:
            # 파일명에서 file_ticker 추출 (경로 제외, 확장자 제외)
            filename = os.path.basename(path).replace('_all.json', '')
            data['file_ticker'] = filename # 나중에 링크용으로 저장
            stock_db.append(data)
            
    print(f"📊 총 {len(stock_db)}개 종목 로드 완료.")
    return stock_db

# -----------------------------------------------------------
# 4. 과거 시점 생성 엔진
# -----------------------------------------------------------
def generate_history(stock_db, alias_map):
    
    # 분석할 날짜 범위 설정 (오늘 기준 과거 60일)
    today = datetime.datetime.now()
    target_dates = []
    for i in range(60):
        d = today - datetime.timedelta(days=i)
        target_dates.append(d.strftime('%Y-%m-%d')) # JSON 내부 날짜 포맷 가정 (YYYY-MM-DD)
    
    target_dates.reverse() # 과거 -> 현재 순서로

    if not os.path.exists(HISTORY_DIR):
        os.makedirs(HISTORY_DIR)

    print(f"🚀 과거 {len(target_dates)}일치 데이터 생성을 시작합니다...")

    for target_date_str in target_dates:
        # 파일명용 날짜 (YYYYMMDD)
        file_date_str = target_date_str.replace('-', '')
        
        analyzed_pool = []

        # 모든 종목을 순회하며 "그 당시" 데이터 계산
        for stock in stock_db:
            daily_list = stock['data']
            meta = stock.get('meta', {})
            ticker = meta.get('ticker', '')
            
            # target_date 이전 데이터만 자르기
            # (날짜 문자열 비교: "2024-01-01" <= "2024-01-05")
            past_data = [d for d in daily_list if d.get('date', '') <= target_date_str]
            
            if len(past_data) < 10: continue # 데이터 부족하면 패스

            # 기준 시점 데이터
            curr = past_data[-1]      # 타겟 날짜 당일
            prev_5 = past_data[-5]    # 5일 전
            
            # 해당 날짜가 타겟 날짜와 너무 차이나면 (거래정지 등) 패스
            # (예: 타겟은 1월 5일인데, 마지막 데이터가 작년 12월이면 제외)
            # 여기서는 간단히 날짜 문자열 일치 여부까진 안 따지고 진행 (휴일일 수도 있으니)

            current_price = curr.get('price', 0)
            prev_price = prev_5.get('price', 0)
            
            if current_price == 0 or prev_price == 0: continue

            # 지표 계산
            price_change = (current_price - prev_price) / prev_price
            
            recent_5_days = past_data[-5:]
            net_buy_sum = sum(d.get('netBuy', 0) for d in recent_5_days)
            
            # 빈도 점수 (10일)
            recent_10_days = past_data[-10:]
            buy_score = sum(1 for d in recent_10_days if d.get('netBuy', 0) > 0)
            sell_score = sum(1 for d in recent_10_days if d.get('netBuy', 0) < 0)
            
            # 한글 이름
            korean_name = alias_map.get(ticker.upper()) or alias_map.get(meta.get('name', '').upper()) or ""

            analyzed_pool.append({
                "name": meta.get('name', ''),
                "name_kr": korean_name,
                "ticker": ticker,
                "file_ticker": stock.get('file_ticker', ''),
                "close": current_price,
                "price_change": price_change,
                "net_buy_sum": net_buy_sum,
                "buy_score": buy_score,
                "sell_score": sell_score
            })

        # -------------------------------------------------------
        # 4사분면 분류 & 대장 선발 (V5 로직)
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
            
            # 과락 체크 (V5)
            if best_pick[score_key] < MIN_SCORE_CUTLINE:
                return None
            return best_pick

        # Fire
        pick = pick_qualified_best(pools['fire'], 'sell_score', lambda x: (x['sell_score'], x['price_change']))
        if pick:
            pick['comment'] = get_comment('fire')
            final_result['fire'] = pick

        # Top
        pick = pick_qualified_best(pools['top'], 'buy_score', lambda x: (x['buy_score'], x['net_buy_sum']))
        if pick:
            pick['comment'] = get_comment('top')
            final_result['top'] = pick

        # Bottom
        pick = pick_qualified_best(pools['bottom'], 'sell_score', lambda x: (x['sell_score'], -x['net_buy_sum']))
        if pick:
            pick['comment'] = get_comment('bottom')
            final_result['bottom'] = pick

        # Knife
        pick = pick_qualified_best(pools['knife'], 'buy_score', lambda x: (x['buy_score'], x['net_buy_sum']))
        if pick:
            pick['comment'] = get_comment('knife')
            final_result['knife'] = pick

        # 결과가 하나라도 있으면 저장
        if final_result:
            save_path = os.path.join(HISTORY_DIR, f"history_{file_date_str}.json")
            with open(save_path, 'w', encoding='utf-8') as f:
                json.dump(final_result, f, ensure_ascii=False, indent=2)
            # print(f"✅ {target_date_str} 기록 저장 완료") # 로그 너무 많으면 주석 처리

    print("\n🎉 모든 과거 데이터 복원 완료! (JSON 기반)")

if __name__ == "__main__":
    # 매핑 파일 로드
    try:
        with open(NAME_ALIAS_FILE, 'r', encoding='utf-8') as f:
            name_alias = json.load(f)
            alias_map = {k.upper(): v for k, v in name_alias.items()}
    except:
        alias_map = {}

    # 실행
    stock_db = load_all_stocks()
    if stock_db:
        generate_history(stock_db, alias_map)