"""야후 일봉 보정 공용 함수

장 마감 직후 야후 일봉은 마지막 날 행은 있는데 Close 가 비어 있을 때가 있음.
이걸 ffill 하면 전일 종가가 그날 종가로 둔갑하고(2026-10-29 전 종목 하루 지연 사고),
dropna 만 하면 그 종목만 하루 늦은 값이 됨.
→ 마지막 날 빈 종가는 현재가(fast_info.lastPrice)로 채우고, 못 채우면 그 날은 뺀다.
"""
from concurrent.futures import ThreadPoolExecutor

import pandas as pd
import yfinance as yf


def last_price(symbol):
    try:
        v = yf.Ticker(symbol).fast_info['lastPrice']
        return float(v) if v and v > 0 else None
    except Exception:
        return None


def fix_last_close(close, symbol):
    """한 종목 종가 Series. 마지막 값이 비면 현재가로 채우고, 못 채우면 빈 꼬리를 잘라냄"""
    if close.empty or pd.notna(close.iloc[-1]):
        return close
    close = close.copy()
    p = last_price(symbol)
    if p is not None:
        close.iloc[-1] = p
        return close
    lv = close.last_valid_index()
    return close.loc[:lv] if lv is not None else close.iloc[0:0]


def fix_last_row(prices, max_workers=8):
    """여러 종목 종가 DataFrame(열=티커). 마지막 행에서 빈 종목만 현재가로 채움.
    못 채운 종목은 그대로 NaN (각 스크립트가 dropna 로 처리)"""
    if prices.empty:
        return prices
    last = prices.index[-1]
    missing = list(prices.columns[prices.loc[last].isna()])
    if not missing:
        return prices
    prices = prices.copy()
    with ThreadPoolExecutor(max_workers=max_workers) as ex:
        filled = dict(zip(missing, ex.map(last_price, missing)))
    n = 0
    for sym, p in filled.items():
        if p is not None:
            prices.loc[last, sym] = p
            n += 1
    print(f"🩹 마지막 거래일({str(last)[:10]}) 빈 종가 {len(missing)}개 중 {n}개 현재가로 보정")
    return prices
