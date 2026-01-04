import json
import re
import requests
import time
import os

# 1. 경로 설정 (public/data 폴더 자동 인식)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MAP_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'ticker_map.json')

def fetch_ticker(query):
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    headers = {'User-Agent': 'Mozilla/5.0'}
    # quoteCount를 1로 하면 가장 정확한 1개만 가져옴
    params = {'q': query, 'quotesCount': 1, 'newsCount': 0}
    try:
        res = requests.get(url, params=params, headers=headers, timeout=3)
        data = res.json()
        if 'quotes' in data and len(data['quotes']) > 0:
            symbol = data['quotes'][0]['symbol']
            # 데이터 품질 체크 (티커에 이상한 문자 포함 여부 확인)
            if re.match(r'^[A-Z\.-]+$', symbol): 
                return symbol
    except:
        pass
    return None

def clean_garbage(name):
    # 기본적인 쓰레기 값 제거
    name = re.sub(r'\([^)]*\)', '', name) # 괄호 제거
    garbage = [" INC", " CORP", " LTD", " PLC", " AG", " CO", " ETF", " ETN", " SPLR", " MRGR", " CHAN", " EXOF", " USD"]
    upper = name.upper()
    for g in garbage:
        if g in upper:
            upper = upper.replace(g, "")
    return upper.strip()

def aggressive_search(raw_name):
    """
    이름을 토막내서 여러 번 검색을 시도하는 함수
    """
    clean_name = clean_garbage(raw_name)
    words = clean_name.split()
    
    # 시도할 검색어 리스트 생성
    candidates = []
    
    # 전략 1: 핵심 단어 3~4개만 조합 (가장 적중률 높음)
    if len(words) >= 2:
        candidates.append(" ".join(words[:4])) # 앞 4단어
        candidates.append(" ".join(words[:3])) # 앞 3단어
        candidates.append(" ".join(words[:2])) # 앞 2단어
    
    # 전략 2: 만약 '2X', '3X' 같은 레버리지 키워드가 있다면 반드시 포함해서 검색
    leverage = [w for w in words if '2X' in w or '3X' in w or '1.5X' in w]
    if leverage:
        # 예: T-REX 2X ... -> "T-REX 2X"
        candidates.insert(0, f"{words[0]} {leverage[0]}") 

    # 실제 검색 수행
    for query in candidates:
        if len(query) < 3: continue # 너무 짧으면 패스
        
        found = fetch_ticker(query)
        if found:
            return found, query # 찾은 티커와 당시 검색어 반환
            
    return None, None

def main():
    print("🚑 빈칸(Missing Ticker) 복구 작업을 시작합니다...")
    
    if not os.path.exists(MAP_FILE):
        print("❌ ticker_map.json 파일이 없습니다. make_ticker_map.py를 먼저 실행하세요.")
        return

    with open(MAP_FILE, 'r', encoding='utf-8') as f:
        ticker_map = json.load(f)

    # 빈칸인 것만 추출
    missing_keys = [k for k, v in ticker_map.items() if not v]
    total_missing = len(missing_keys)
    
    print(f"🧐 총 {total_missing}개의 빈칸을 발견했습니다. 정밀 검색 시작!\n")

    filled_count = 0
    
    for i, raw_name in enumerate(missing_keys):
        ticker, used_query = aggressive_search(raw_name)
        
        if ticker:
            ticker_map[raw_name] = ticker
            filled_count += 1
            print(f"[{i+1}/{total_missing}] ✅ 복구 성공: {used_query} -> {ticker}")
        else:
            print(f"[{i+1}/{total_missing}] 😓 복구 실패: {raw_name[:30]}...")
            
        # 너무 빠르면 차단당하므로 딜레이
        time.sleep(0.3)

    # 저장
    if filled_count > 0:
        with open(MAP_FILE, 'w', encoding='utf-8') as f:
            json.dump(ticker_map, f, indent=2, ensure_ascii=False)
        print(f"\n💾 저장 완료! {filled_count}개를 추가로 찾아냈습니다.")
    else:
        print("\n💨 추가로 찾아낸 것이 없습니다.")

if __name__ == "__main__":
    main()