"""
CSV(processed/all_data_clean.csv)의 종목명(raw name) 중
ticker_map.json 에 티커가 없는 것들을 Yahoo Finance 검색으로 자동 매핑한다.

조회 대상: 맵에 '키가 아예 없는' 새 종목만.

원칙:
  - 값이 이미 있으면(정상 티커든, 빈 값이든, 과거의 잘못된 값이든) 절대 건드리지 않는다.
    → 자동으로 덮어쓰다 더 틀리는 사고 방지. 기존 값 정리는 별도 작업.
  - 조회에 실패한 새 종목은 빈 값("")으로 기록해 다음 실행에서 반복 조회되지 않게 한다.
    (일시적 실패로 빈 값이 된 종목을 다시 시도하려면 그 키를 지우고 재실행)
  - Yahoo 결과가 '주요 미국 거래소 + 보통주/ETF'로 확신될 때만 채택한다.
  - '데이터 보강' 단계이므로 어떤 이유로 실패해도 exit 0 으로 끝낸다.
    (일일 파이프라인을 막지 않기 위함)
"""
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

import json
import os
import re
import time

import pandas as pd
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_FILE = os.path.join(BASE_DIR, '..', 'processed', 'all_data_clean.csv')
MAP_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'ticker_map.json')

# 한 번 실행에 새로 조회할 최대 종목 수 (CSV 오염으로 쓰레기 이름이 대량 유입되는 것 방어).
# 초과분은 다음 실행에서 이어서 처리된다.
MAX_LOOKUPS_PER_RUN = 300

# 검색어에서 잘라낼 금융 꼬리표
GARBAGE_KEYWORDS = [
    " INC", " CORP", " LTD", " PLC", " AG", " CO", " SA", " S.A.",
    " SPLR", " MRGR", " CHAN", " EXOF", " USD", " ORD", " WI", " ADR",
    " CL A", " CL B", " COM", " NPV", " P/S", " SHS",
]

# Yahoo 검색 결과를 '자동 채택'할지 판단하는 기준.
# 주요 미국 거래소 상장 + 보통주/ETF + 해외 접미사('.') 없음 → 이 3개를 모두
# 만족할 때만 자동 매핑한다. 애매하면 빈 값으로 두고 다음 실행/수동 검토에 맡긴다.
# (독일·멕시코 상장 등 엉뚱한 티커가 맵에 섞이는 것을 원천 차단)
US_EXCHANGES = {
    "NMS", "NGM", "NCM", "NYQ", "NYS", "ASE", "PCX", "BTS", "BATS",
}
GOOD_QUOTE_TYPES = {"EQUITY", "ETF"}

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}


def write_json_atomic(path: str, obj) -> None:
    """임시 파일에 쓰고 교체 → 도중에 죽어도 원본이 깨지지 않게."""
    tmp = path + ".tmp"
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def clean_name(raw_name: str) -> str:
    """검색 정확도를 높이려고 괄호/ISIN/꼬리표를 제거한 짧은 이름을 만든다."""
    name = re.sub(r'\([^)]*\)', '', raw_name)
    upper = name.upper()
    cut = len(name)
    for kw in GARBAGE_KEYWORDS:
        idx = upper.find(kw)
        if idx != -1 and idx < cut:
            cut = idx
    clean = name[:cut].strip()
    return clean if len(clean) >= 2 else raw_name.split()[0]


def pick_symbol(quotes: list) -> str:
    """Yahoo 검색 결과에서 '확신할 수 있는 미국 티커'만 채택한다. 없으면 ''.

    Yahoo 검색은 이름 관련도 순으로 정렬돼 오므로, 위에서부터
    '주요 미국 거래소 + 보통주/ETF + 해외 접미사 없음'을 처음 만족하는
    심볼을 고른다. 하나도 없으면 빈 값(→ 다음 실행 재시도 / 수동 검토).
    """
    for q in quotes:
        sym = (q.get('symbol') or '').strip()
        if not sym or '.' in sym:
            continue
        if q.get('quoteType') not in GOOD_QUOTE_TYPES:
            continue
        if q.get('exchange') not in US_EXCHANGES:
            continue
        return sym
    return ""


def fetch_ticker(query: str) -> str:
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    params = {'q': query, 'quotesCount': 6, 'newsCount': 0}
    for attempt in range(3):
        try:
            r = requests.get(url, params=params, headers=HEADERS, timeout=8)
            if r.status_code == 200:
                return pick_symbol(r.json().get('quotes', []))
            # 429/5xx 는 잠깐 쉬고 재시도
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:
            print(f"    조회 오류({attempt + 1}/3): {e}")
            time.sleep(1.0 * (attempt + 1))
    return ""


def load_csv_names() -> list:
    try:
        try:
            df = pd.read_csv(CSV_FILE, sep='\t')
            if len(df.columns) < 2:
                df = pd.read_csv(CSV_FILE, sep=',')
        except Exception:
            df = pd.read_csv(CSV_FILE)

        df.columns = [c.strip().lstrip('﻿') for c in df.columns]
        name_col = next(
            (c for c in df.columns if '종목' in c or c.lower() == 'name'),
            df.columns[1],
        )
        return df[name_col].dropna().astype(str).str.strip().unique().tolist()
    except Exception as e:
        print(f"❌ CSV 로드 실패: {e}")
        return []


def main():
    all_names = load_csv_names()
    if not all_names:
        print("⚠️ CSV 종목명을 읽지 못해 종료 (파이프라인은 계속 진행)")
        return

    if os.path.exists(MAP_FILE):
        with open(MAP_FILE, 'r', encoding='utf-8') as f:
            ticker_map = json.load(f)
    else:
        ticker_map = {}

    # '키가 없는' 새 종목만 대상 (기존 값은 빈 값이라도 건드리지 않음)
    pending = [n for n in all_names if n not in ticker_map]
    if not pending:
        print(f"✅ 새 종목 없음 (전체 {len(ticker_map)}개 매핑 유지)")
        return

    capped = pending[:MAX_LOOKUPS_PER_RUN]
    print(f"🆕 새 종목 {len(pending)}개"
          + (f" → 이번 실행 {len(capped)}개만 처리" if len(capped) < len(pending) else ""))

    resolved = 0
    for i, raw_name in enumerate(capped, 1):
        query = clean_name(raw_name)
        if ("ETF" in raw_name or "ETN" in raw_name) and "ETF" not in query.upper():
            query += " ETF"

        ticker = fetch_ticker(query)
        ticker_map[raw_name] = ticker   # 실패 시 "" 로 기록 → 다음 실행에서 반복 조회 안 함
        if ticker:
            resolved += 1

        mark = "✅" if ticker else "⚠️"
        print(f"[{i}/{len(capped)}] {mark} {raw_name[:42]:<42} → {ticker or '실패(빈 값 기록)'}")
        time.sleep(0.25)

    write_json_atomic(MAP_FILE, ticker_map)
    print(f"\n💾 ticker_map.json 갱신: 새 키 {len(capped)}개 (티커 확인 {resolved} · 미확인 {len(capped) - resolved})")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        # 어떤 예외가 나도 일일 파이프라인을 막지 않는다
        print(f"❌ 예기치 못한 오류(무시하고 계속): {e}")
