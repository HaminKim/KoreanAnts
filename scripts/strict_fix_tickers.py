import json
import re
import requests
import time
import os
from difflib import SequenceMatcher

# 경로 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ALIAS_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'name_alias.json')
OUTPUT_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'ticker_map.json')

def get_yahoo_data(query):
    """야후에서 티커와 종목명을 함께 가져옴"""
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    headers = {'User-Agent': 'Mozilla/5.0'}
    params = {'q': query, 'quotesCount': 1, 'newsCount': 0}
    try:
        res = requests.get(url, params=params, headers=headers, timeout=3)
        data = res.json()
        if 'quotes' in data and len(data['quotes']) > 0:
            quote = data['quotes'][0]
            return quote['symbol'], quote.get('longname', '') or quote.get('shortname', '')
    except:
        pass
    return None, None

def extract_isin(text):
    """
    이름 뒤에 숨어있는 ISIN 코드(US..., KY... 등)를 추출
    예: "... SPLR 966129938 KYG5223X1429" -> "KYG5223X1429"
    """
    # 1. 일반적인 ISIN 패턴 (알파벳2자리 + 숫자/알파벳 9자리 + 숫자1자리)
    # 님 데이터 특성에 맞춰서 US, KY, CA 등으로 시작하는 긴 코드를 잡음
    match = re.search(r'\b([A-Z]{2}[A-Z0-9]{9,11})\b', text)
    if match:
        return match.group(1)
    return None

def clean_name_strict(name):
    """최소한의 정제만 수행 (억지로 자르지 않음)"""
    # 괄호 제거
    name = re.sub(r'\([^)]*\)', '', name)
    # 뒤에 붙은 쓰레기 코드들 제거
    garbage = [" SPLR", " MRGR", " CHAN", " EXOF", " USD", " ORD", " WI", " ADR", " CL A", " CL B", " COM", " NPV"]
    upper = name.upper()
    for g in garbage:
        if g in upper:
            idx = upper.find(g)
            upper = upper[:idx]
    
    # INC, CORP 등은 검색 정확도를 위해 제거하되, ETF/ETN 등 핵심 키워드는 유지
    suffix = [" INC", " CORP", " LTD", " PLC", " AG", " CO"]
    for s in suffix:
        if upper.endswith(s) or (s + " ") in upper:
            upper = upper.replace(s, "")
            
    return upper.strip()

def check_similarity(name1, name2):
    """두 이름이 얼마나 비슷한지 0~1 점수로 반환"""
    if not name1 or not name2: return 0
    # 소문자로 통일하고 띄어쓰기 제거 후 비교
    s1 = name1.lower().replace(" ", "")
    s2 = name2.lower().replace(" ", "")
    return SequenceMatcher(None, s1, s2).ratio()

def main():
    print("🎯 정밀(Strict) 티커 복구 작업을 시작합니다...")
    
    # 원본 데이터(Raw Name) 로드
    with open(ALIAS_FILE, 'r', encoding='utf-8') as f:
        raw_data = json.load(f)
    
    raw_names = list(raw_data.keys())
    new_map = {}
    
    success_count = 0
    
    print(f"총 {len(raw_names)}개 종목 검증 시작.\n")

    for i, raw_name in enumerate(raw_names):
        ticker = ""
        method = ""
        
        # 전략 1: ISIN 코드 추출 (가장 강력함)
        isin_code = extract_isin(raw_name)
        if isin_code:
            found_ticker, found_name = get_yahoo_data(isin_code)
            # ISIN 검색은 이름 비교 없이도 거의 100% 신뢰 가능
            if found_ticker:
                ticker = found_ticker
                method = f"ISIN({isin_code})"

        # 전략 2: 이름 검색 (ISIN 실패 시)
        if not ticker:
            clean_query = clean_name_strict(raw_name)
            # 이름이 너무 짧아졌으면 원본 사용 (예: Apple Inc -> Apple)
            if len(clean_query) < 2: clean_query = raw_name.split()[0]
            
            # ETF 키워드 보강
            if "ETF" in raw_name and "ETF" not in clean_query:
                clean_query += " ETF"

            found_ticker, found_name = get_yahoo_data(clean_query)
            
            if found_ticker:
                # 🛡️ 검증 단계 (중요): 찾은 종목 이름이 원본과 비슷한가?
                # 핵심 단어가 포함되어 있는지 확인
                query_parts = clean_query.split()
                match_score = 0
                for part in query_parts:
                    if len(part) > 2 and part.lower() in found_name.lower():
                        match_score += 1
                
                # 원본 단어의 50% 이상이 포함되거나, 전체 유사도가 높아야 인정
                if match_score >= len(query_parts) * 0.5 or check_similarity(clean_query, found_name) > 0.4:
                    ticker = found_ticker
                    method = f"NameMatch"
                else:
                    # 너무 다르면 버림
                    method = "Mismatch(Rejected)"

        # 결과 저장
        new_map[raw_name] = ticker
        
        if ticker:
            success_count += 1
            print(f"[{i+1}] ✅ {ticker} : {raw_name[:20]}... ({method})")
        else:
            print(f"[{i+1}] ❌ 실패 : {raw_name[:20]}...")
            
        time.sleep(0.2) 

    # 저장
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_map, f, indent=2, ensure_ascii=False)
        
    print(f"\n💾 저장 완료! {success_count}/{len(raw_names)}개 매핑 성공.")
    print("⚠️ 실패한 종목은 빈칸으로 남겨두었습니다. (엉뚱한 데이터 방지)")

if __name__ == "__main__":
    main()