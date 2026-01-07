import json
import os

# ... (상단 설정 부분은 그대로 유지) ...
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'public', 'data')
TOP10_DIR = os.path.join(DATA_DIR, 'top10')
FLOW_DIR = os.path.join(DATA_DIR, 'flow')
MAP_FILE = os.path.join(DATA_DIR, 'ticker_map.json')
TARGET_RANKS = ['netBuy_5.json', 'netBuy_10.json', 'netSell_5.json', 'netSell_10.json']

def load_json(path):
    try:
        if not os.path.exists(path): return None
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return None

def find_stock_file(name_or_ticker):
    """주어진 이름으로 파일 경로 찾기"""
    if not name_or_ticker: return None
    safe_name = "".join([c if c.isalnum() else "_" for c in name_or_ticker.upper()])
    path = os.path.join(FLOW_DIR, f"{safe_name}_all.json")
    if os.path.exists(path): return path
    return None

# ✨ [수정] file_ticker 인자 추가
def analyze_stock(file_path, file_ticker_name):
    """개별 종목 데이터 분석"""
    data = load_json(file_path)
    if not data or 'data' not in data or len(data['data']) < 5: return None

    daily = data['data']
    meta = data.get('meta', {})
    
    last = daily[-1]
    prev_5 = daily[-5]
    
    current_price = last.get('price', 0)
    prev_price = prev_5.get('price', 0)
    
    if current_price == 0 or prev_price == 0: return None

    # 등락률 및 수급 합계
    price_change_pct = (current_price - prev_price) / prev_price
    recent_5_days = daily[-5:]
    net_buy_sum = sum(d.get('netBuy', 0) for d in recent_5_days)
    
    return {
        "name": meta.get('name', ''),
        "ticker": meta.get('ticker', ''),
        "file_ticker": file_ticker_name,  # 👈 [핵심] 로고/파일 찾기용 긴 이름 저장
        "close": current_price,
        "price_change": price_change_pct,
        "net_buy_sum": net_buy_sum,
        "ma5": last.get('ma5', 0),
        "ma20": last.get('ma20', 0)
    }

def main():
    print("🚀 놈놈놈 분석 시작 (로고 매칭 강화판)...")
    
    # 1. 티커 매핑 로드
    ticker_map = load_json(MAP_FILE) or {}
    normalized_map = {k.upper().strip(): v for k, v in ticker_map.items()}

    # 2. 후보군 수집
    candidate_paths = {} # 경로 중복 방지를 위해 dict 사용 {path: raw_name}

    for rank_file in TARGET_RANKS:
        path = os.path.join(TOP10_DIR, rank_file)
        rank_data = load_json(path)
        
        if rank_data and 'items' in rank_data:
            for item in rank_data['items'][:20]:
                raw_name = item.get('ticker') or item.get('name') # 이게 긴 이름(MICRON...)
                if not raw_name: continue
                
                # 파일 찾기
                file_path = find_stock_file(raw_name)
                
                # 못 찾으면 매핑 시도
                if not file_path:
                    short_ticker = normalized_map.get(raw_name.upper().strip())
                    if short_ticker:
                        file_path = find_stock_file(short_ticker)
                
                if file_path:
                    # ✨ 여기서 raw_name(긴 이름)을 기억해둡니다!
                    candidate_paths[file_path] = raw_name

    print(f"📋 매칭 성공: {len(candidate_paths)}개 종목 분석 시작")

    # 3. 데이터 분석
    analyzed_pool = []
    for file_path, raw_name in candidate_paths.items():
        # ✨ raw_name을 같이 넘김
        info = analyze_stock(file_path, raw_name) 
        if info:
            analyzed_pool.append(info)

    # 4. 4사분면 분류
    candidates = {"fire": [], "top": [], "bottom": [], "knife": []}

    for stock in analyzed_pool:
        pct = stock['price_change']
        net = stock['net_buy_sum']
        
        if pct > 0.03 and net < 0: candidates['fire'].append(stock)
        elif pct > 0.05 and net > 0: candidates['top'].append(stock)
        elif pct < -0.05 and net < 0: candidates['bottom'].append(stock)
        elif pct < -0.03 and net > 0: candidates['knife'].append(stock)

    # 5. 대장 선발
    final_result = {}
    if candidates['fire']: final_result['fire'] = sorted(candidates['fire'], key=lambda x: x['price_change'], reverse=True)[0]
    if candidates['top']: final_result['top'] = sorted(candidates['top'], key=lambda x: x['net_buy_sum'], reverse=True)[0]
    if candidates['bottom']: final_result['bottom'] = sorted(candidates['bottom'], key=lambda x: x['net_buy_sum'])[0]
    if candidates['knife']: final_result['knife'] = sorted(candidates['knife'], key=lambda x: x['net_buy_sum'], reverse=True)[0]

    # 6. 저장
    if not os.path.exists(FLOW_DIR): os.makedirs(FLOW_DIR)
    output_path = os.path.join(FLOW_DIR, 'nom_nom_data.json')
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_result, f, ensure_ascii=False, indent=2)

    print(f"✅ 최종 완료! 저장 경로: {output_path}")

if __name__ == "__main__":
    main()