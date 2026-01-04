# scripts/update_ticker_map.py

import json
import re
import requests
import time
import os

# 현재 스크립트 파일 위치 기준 (scripts 폴더)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# scripts 폴더에서 -> 한 단계 위(..) -> public -> data 폴더로 진입
ALIAS_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'name_alias.json')
OUTPUT_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'ticker_map.json')

def clean_name_for_search(raw_name):
    """
    검색 정확도를 높이기 위해 지저분한 꼬리표(SPLR, MRGR, ISIN 등)를 제거합니다.
    """
    # 1. 괄호 안의 내용 제거
    name = re.sub(r'\([^)]*\)', '', raw_name)
    
    # 2. 불필요한 금융 용어 제거 패턴
    garbage = [
        " INC", " CORP", " LTD", " PLC", " AG", " CO", " SA", " S.A.",
        " SPLR", " MRGR", " CHAN", " EXOF", " USD", " ORD", " WI", " ADR", 
        " CL A", " CL B", " COM", " NPV", " P/S", " SHS"
    ]
    
    upper_name = name.upper()
    cut_index = len(name)
    
    # 가장 먼저 등장하는 쓰레기 단어 앞에서 자름
    for kw in garbage:
        idx = upper_name.find(kw)
        if idx != -1 and idx < cut_index:
            cut_index = idx
            
    clean = name[:cut_index].strip()
    
    # 예외: 이름이 너무 짧아지면(2글자 미만) 그냥 원본 첫 단어 사용
    if len(clean) < 2:
        return raw_name.split()[0]
        
    return clean

def fetch_ticker_from_yahoo(query):
    """
    야후 파이낸스 API에 이름을 던져서 티커(Symbol)를 받아옵니다.
    """
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    params = {'q': query, 'quotesCount': 1, 'newsCount': 0}
    
    try:
        res = requests.get(url, params=params, headers=headers, timeout=5)
        data = res.json()
        if 'quotes' in data and len(data['quotes']) > 0:
            return data['quotes'][0]['symbol']
    except Exception as e:
        print(f"   Error: {e}")
    return ""

def main():
    print("📂 데이터 로딩 중...")
    
    # 1. 대상 종목 리스트 로드
    with open(ALIAS_FILE, 'r', encoding='utf-8') as f:
        alias_data = json.load(f)
    
    raw_names = list(alias_data.keys())
    new_map = {}
    
    print(f"🚀 총 {len(raw_names)}개 종목의 티커 변환을 시작합니다.")
    print("-" * 50)

    for i, raw_name in enumerate(raw_names):
        # 검색어 정제
        search_query = clean_name_for_search(raw_name)
        
        # ETF/ETN은 명시해주는 게 검색이 잘 됨
        if ("ETF" in raw_name or "ETN" in raw_name) and "ETF" not in search_query:
            search_query += " ETF"
            
        # 야후 검색
        ticker = fetch_ticker_from_yahoo(search_query)
        
        # 결과 매핑
        if ticker:
            new_map[raw_name] = ticker
            print(f"[{i+1}/{len(raw_names)}] ✅ {raw_name[:20]}... -> {ticker}")
        else:
            new_map[raw_name] = "" # 못 찾음
            print(f"[{i+1}/{len(raw_names)}] ⚠️ 실패: {raw_name[:20]}... (검색어: {search_query})")
            
        time.sleep(0.2) # 차단 방지용 딜레이

    # 2. 결과 저장
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_map, f, indent=2, ensure_ascii=False)
        
    print("-" * 50)
    print(f"💾 {OUTPUT_FILE} 저장 완료!")

if __name__ == "__main__":
    main()