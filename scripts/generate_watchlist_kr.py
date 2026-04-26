"""
generate_watchlist_kr.py

한국 주식 워치리스트 생성 스크립트 (코스피 기준)

▶ 미국 버전(generate_watchlist.py)과 완전히 동일한 계산식
  - BENCHMARK: ^KS11 (코스피 지수)
  - 종목 티커: yfinance 형식 (예: 005930.KS, 086520.KQ)
  - 출력: public/data/watchlist_kr.json

▶ 미국 버전과의 차이점
  - EPS 데이터 미수집 (yfinance 한국 지원 불량)
  - market_context 필드명: kospi_* (spy_* 대신)
  - KOSPI 섹터는 RS = 0 고정 (시장 기준)
"""

import io
import json
import os
import sys
import time
import random
import concurrent.futures
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ─────────────────────────────────────────
# 파라미터 (미국 버전과 동일)
# ─────────────────────────────────────────

BENCHMARK        = "^KS11"   # 코스피 지수
MA_PERIOD        = 100
MA_PERIOD_150    = 150
RS_WINDOW_STOCK  = 252
RS_WINDOW_60     = 60
RS_WINDOW_20     = 20
RS_WINDOW_SECTOR = 60
RS_MA_PERIOD     = 20
RS_WEIGHTS       = (0.2, 0.3, 0.5)  # 20d : 60d : 252d

# ─────────────────────────────────────────
# 한국 26개 섹터 정의
# ─────────────────────────────────────────

SECTORS_KR = [
    {
        "id": 1, "name": "반도체", "etf": "091160.KS", "emoji": "💾",
        "tickers": [
            "005930.KS", "000660.KS", "042700.KS", "058470.KS", "357780.KS",
            "084370.KS", "089030.KS", "240810.KS", "067310.KS", "099320.KS",
            "003160.KS", "232140.KS", "036830.KS", "054620.KS", "178600.KS",
        ]
    },
    {
        "id": 2, "name": "이차전지", "etf": "305720.KS", "emoji": "🔋",
        "tickers": [
            "373220.KS", "006400.KS", "086520.KQ", "247540.KS", "066970.KS",
            "003670.KS", "278280.KS", "121600.KQ", "025900.KS", "005070.KS",
            "336370.KS", "222080.KQ", "089980.KS", "438260.KS", "017370.KS",
        ]
    },
    {
        "id": 3, "name": "자동차", "etf": "091180.KS", "emoji": "🚗",
        "tickers": [
            "005380.KS", "000270.KS", "012330.KS", "011210.KS", "204320.KS",
            "015750.KS", "005850.KS", "000040.KS", "161390.KS", "073240.KS",
            "123700.KS", "195870.KS", "006620.KS", "092780.KS", "178320.KS",
        ]
    },
    {
        "id": 4, "name": "조선", "etf": "139230.KS", "emoji": "⚓",
        "tickers": [
            "009540.KS", "010140.KS", "010620.KS", "329180.KS", "042660.KS",
            "267250.KS", "100090.KS", "014620.KS", "071970.KS", "288620.KS",
            "170790.KS", "241560.KS", "014160.KS", "009180.KS", "091810.KS",
        ]
    },
    {
        "id": 5, "name": "바이오/제약", "etf": "143460.KS", "emoji": "🧬",
        "tickers": [
            "207940.KS", "068270.KS", "128940.KS", "000100.KS", "185750.KS",
            "069620.KS", "003850.KS", "006280.KS", "170900.KS", "237690.KS",
            "214450.KQ", "243070.KS", "145720.KS", "086900.KQ", "019210.KS",
        ]
    },
    {
        "id": 6, "name": "금융/보험", "etf": "091170.KS", "emoji": "🏦",
        "tickers": [
            "105560.KS", "055550.KS", "086790.KS", "316140.KS", "024110.KS",
            "138040.KS", "071050.KS", "000810.KS", "005830.KS", "001450.KS",
            "088350.KS", "003540.KS", "032830.KS", "000060.KS", "006800.KS",
        ]
    },
    {
        "id": 7, "name": "증권", "etf": "016360.KS", "emoji": "📈",
        "tickers": [
            "016360.KS", "006800.KS", "071050.KS", "078020.KS", "001500.KS",
            "001720.KS", "039490.KS", "025540.KS", "003490.KS", "001510.KS",
            "007070.KS", "003490.KS", "001620.KS", "004490.KS", "023530.KS",
        ]
    },
    {
        "id": 8, "name": "인터넷/플랫폼", "etf": "035420.KS", "emoji": "🌐",
        "tickers": [
            "035420.KS", "035720.KS", "323410.KS", "377300.KS", "018280.KS",
            "053800.KS", "032500.KQ", "041510.KS", "035900.KS", "122870.KS",
            "253450.KS", "036420.KS", "160550.KS", "298000.KS", "413380.KS",
        ]
    },
    {
        "id": 9, "name": "게임", "etf": "117700.KS", "emoji": "🎮",
        "tickers": [
            "036570.KS", "251270.KS", "259960.KS", "293490.KS", "112040.KQ",
            "078340.KQ", "263750.KQ", "069080.KQ", "192080.KQ", "194480.KQ",
            "181710.KS", "067000.KQ", "110790.KQ", "225570.KQ", "041140.KQ",
        ]
    },
    {
        "id": 10, "name": "엔터/미디어", "etf": "352820.KS", "emoji": "🎤",
        "tickers": [
            "352820.KS", "041510.KS", "035900.KS", "122870.KS", "035760.KS",
            "253450.KS", "036420.KS", "160550.KS", "298000.KS", "241840.KQ",
            "054780.KQ", "413380.KS", "314130.KS", "043910.KQ", "145210.KS",
        ]
    },
    {
        "id": 11, "name": "건설", "etf": "139220.KS", "emoji": "🏗️",
        "tickers": [
            "028260.KS", "000720.KS", "006360.KS", "047040.KS", "375500.KS",
            "294870.KS", "009410.KS", "002990.KS", "004960.KS", "097230.KS",
            "003410.KS", "005960.KS", "001440.KS", "034300.KS", "000210.KS",
        ]
    },
    {
        "id": 12, "name": "화학", "etf": "098530.KS", "emoji": "⚗️",
        "tickers": [
            "051910.KS", "011170.KS", "009830.KS", "011790.KS", "298050.KS",
            "120110.KS", "011780.KS", "010060.KS", "285130.KS", "000990.KS",
            "024090.KS", "003720.KS", "004000.KS", "009200.KS", "003830.KS",
        ]
    },
    {
        "id": 13, "name": "철강/소재", "etf": "117680.KS", "emoji": "⛏️",
        "tickers": [
            "005490.KS", "004020.KS", "001230.KS", "010130.KS", "000670.KS",
            "103140.KS", "006260.KS", "001430.KS", "047050.KS", "004140.KS",
            "002220.KS", "005210.KS", "016580.KS", "008970.KS", "002440.KS",
        ]
    },
    {
        "id": 14, "name": "유통/소비재", "etf": "023530.KS", "emoji": "🛒",
        "tickers": [
            "023530.KS", "139480.KS", "004170.KS", "069960.KS", "007070.KS",
            "005300.KS", "180640.KS", "271560.KS", "028150.KS", "001680.KS",
            "005110.KS", "000250.KS", "010120.KS", "002360.KS", "007310.KS",
        ]
    },
    {
        "id": 15, "name": "통신", "etf": "017670.KS", "emoji": "📡",
        "tickers": [
            "017670.KS", "030200.KS", "032640.KS", "032350.KS", "036460.KS",
            "053800.KS", "033630.KS", "010660.KS", "052690.KS", "078600.KS",
            "115160.KS", "018280.KS", "034020.KS", "042700.KS", "031430.KS",
        ]
    },
    {
        "id": 16, "name": "에너지", "etf": "096770.KS", "emoji": "🛢️",
        "tickers": [
            "096770.KS", "010950.KS", "078930.KS", "036460.KS", "015760.KS",
            "010120.KS", "002240.KS", "006090.KS", "042670.KS", "007570.KS",
            "101060.KS", "117580.KS", "267250.KS", "001830.KS", "006090.KS",
        ]
    },
    {
        "id": 17, "name": "방산", "etf": "012450.KS", "emoji": "🚀",
        "tickers": [
            "012450.KS", "079550.KS", "047810.KS", "064350.KS", "272210.KS",
            "065620.KS", "000880.KS", "007860.KS", "071970.KS", "004490.KS",
            "023150.KS", "032250.KS", "079850.KS", "241560.KS", "337840.KS",
        ]
    },
    {
        "id": 18, "name": "디스플레이", "etf": "034220.KS", "emoji": "🖥️",
        "tickers": [
            "034220.KS", "213420.KS", "357780.KS", "138360.KS", "067160.KS",
            "036540.KS", "011070.KS", "178920.KS", "080160.KS", "038290.KS",
            "078890.KS", "039030.KS", "011155.KS", "016730.KS", "032350.KS",
        ]
    },
    {
        "id": 19, "name": "의료기기", "etf": "041830.KS", "emoji": "🏥",
        "tickers": [
            "041830.KS", "100120.KQ", "214450.KQ", "228850.KQ", "214150.KQ",
            "039200.KQ", "091700.KQ", "286940.KS", "196170.KQ", "237690.KQ",
            "298060.KQ", "145720.KQ", "068060.KQ", "141080.KQ", "092190.KQ",
        ]
    },
    {
        "id": 20, "name": "물류/운송", "etf": "086280.KS", "emoji": "🚢",
        "tickers": [
            "086280.KS", "000120.KS", "002320.KS", "003490.KS", "020560.KS",
            "089590.KS", "035250.KS", "006490.KS", "048410.KS", "001250.KS",
            "009530.KS", "007110.KS", "012700.KS", "001560.KS", "044380.KS",
        ]
    },
    {
        "id": 21, "name": "부동산/리츠", "etf": "088980.KS", "emoji": "🏢",
        "tickers": [
            "088980.KS", "330590.KS", "395400.KS", "432320.KS", "357120.KS",
            "448730.KS", "451800.KS", "293940.KS", "377190.KS", "348950.KS",
            "404990.KS", "409570.KS", "365550.KS", "432115.KS", "294090.KS",
        ]
    },
    {
        "id": 22, "name": "클린에너지", "etf": "112610.KS", "emoji": "☀️",
        "tickers": [
            "112610.KS", "009830.KS", "010060.KS", "038870.KS", "006090.KS",
            "078130.KS", "389260.KS", "298260.KS", "175330.KS", "077970.KS",
            "298040.KS", "014620.KS", "004200.KS", "263920.KS", "003030.KS",
        ]
    },
    {
        "id": 23, "name": "IT서비스", "etf": "018260.KS", "emoji": "💻",
        "tickers": [
            "018260.KS", "034730.KS", "012510.KS", "030520.KS", "032500.KQ",
            "047310.KQ", "093520.KQ", "079000.KQ", "023350.KS", "099430.KQ",
            "040910.KQ", "043260.KQ", "053290.KQ", "260780.KS", "065770.KQ",
        ]
    },
    {
        "id": 24, "name": "화장품/뷰티", "etf": "051900.KS", "emoji": "💄",
        "tickers": [
            "051900.KS", "090430.KS", "161890.KS", "044820.KS", "237880.KQ",
            "018290.KQ", "257720.KQ", "214420.KQ", "192820.KQ", "024720.KS",
            "104460.KQ", "241710.KQ", "078520.KQ", "189980.KQ", "003650.KS",
        ]
    },
    {
        "id": 25, "name": "음식료", "etf": "097950.KS", "emoji": "🍜",
        "tickers": [
            "097950.KS", "007310.KS", "004370.KS", "000080.KS", "271560.KS",
            "005300.KS", "003230.KS", "049770.KS", "005180.KS", "002150.KS",
            "280360.KS", "008350.KS", "145990.KS", "007340.KS", "004020.KS",
        ]
    },
    {
        "id": 26, "name": "시장(코스피)", "etf": "KOSPI", "emoji": "🇰🇷",
        "tickers": [
            "005930.KS", "000660.KS", "373220.KS", "207940.KS", "005380.KS",
            "000270.KS", "005490.KS", "051910.KS", "068270.KS", "006400.KS",
            "035720.KS", "035420.KS", "017670.KS", "105560.KS", "055550.KS",
        ]
    },
]

# ─────────────────────────────────────────
# MA 기울기 신선도 점수 (미국 버전과 동일)
# ─────────────────────────────────────────

def calc_ma_slope_score(ma_series, max_score=13):
    if len(ma_series) < 30:
        return 0.0, "flat", None
    slope_now = float(ma_series.iloc[-1] - ma_series.iloc[-6])
    cur_dir   = 1 if slope_now > 0 else (-1 if slope_now < 0 else 0)
    direction = "bullish" if cur_dir > 0 else ("bearish" if cur_dir < 0 else "flat")
    if cur_dir == 0:
        return 2.0, "flat", None
    ma_ref = abs(float(ma_series.iloc[-1]))
    slope_pct = abs(slope_now) / ma_ref * 100 if ma_ref > 0 else 0.0
    if   slope_pct >= 3.0: velocity_bonus = 5.0
    elif slope_pct >= 1.5: velocity_bonus = 4.0
    elif slope_pct >= 0.8: velocity_bonus = 2.5
    elif slope_pct >= 0.4: velocity_bonus = 1.0
    else:                  velocity_bonus = 0.0
    days_since_turn = None
    for i in range(6, min(80, len(ma_series) - 6)):
        past_slope = float(ma_series.iloc[-i] - ma_series.iloc[-(i + 5)])
        past_dir   = 1 if past_slope > 0 else (-1 if past_slope < 0 else 0)
        if past_dir != 0 and past_dir != cur_dir:
            days_since_turn = i
            break
    if days_since_turn is None:
        return float(min(max_score, 1.0 + velocity_bonus)), direction, None
    if   days_since_turn <= 5:  freshness = 11
    elif days_since_turn <= 10: freshness = 9
    elif days_since_turn <= 20: freshness = 6
    elif days_since_turn <= 40: freshness = 3
    else:                       freshness = 1
    score = min(max_score, freshness + velocity_bonus)
    return float(score), direction, days_since_turn


def calc_weighted_rs(rs_20d, rs_60d, rs_252d):
    pairs     = list(zip(RS_WEIGHTS, (rs_20d, rs_60d, rs_252d)))
    available = [(w, v) for w, v in pairs if v is not None]
    if not available:
        return 0.0
    total_w = sum(w for w, _ in available)
    return round(sum(w * v for w, v in available) / total_w, 2)


def apply_signal_gate(signal, ma_distance_pct, slope_dir, market_regime):
    if signal == "long":
        gate_ok = (ma_distance_pct > 0 and slope_dir == "bullish" and market_regime != "bear")
        if not gate_ok:
            return "long_watch"
    elif signal == "short":
        gate_ok = (ma_distance_pct < 0 and slope_dir == "bearish" and market_regime != "bull")
        if not gate_ok:
            return "short_watch"
    if market_regime == "bear" and signal == "long_watch":
        return "neutral"
    return signal


def calc_conflicts(signal, rs_weighted, ma_distance_pct, slope_dir, sector_rs_60d, market_regime):
    conflicts = 0
    if signal in ("long", "long_watch"):
        if rs_weighted > 10 and sector_rs_60d is not None and sector_rs_60d < -5:
            conflicts += 1
        if ma_distance_pct > 0 and slope_dir == "bearish":
            conflicts += 1
        if market_regime == "bear":
            conflicts += 1
    elif signal in ("short", "short_watch"):
        if rs_weighted < -10 and sector_rs_60d is not None and sector_rs_60d > 5:
            conflicts += 1
        if ma_distance_pct < 0 and slope_dir == "bullish":
            conflicts += 1
        if market_regime == "bull":
            conflicts += 1
    return conflicts


def downgrade_signal(signal, conflicts):
    if conflicts == 0 or signal == "neutral":
        return signal
    order = ["long", "long_watch", "neutral", "short_watch", "short"]
    if signal not in order:
        return signal
    idx = order.index(signal)
    if signal in ("long", "long_watch"):
        idx = min(order.index("neutral"), idx + conflicts)
    elif signal in ("short", "short_watch"):
        idx = max(order.index("neutral"), idx - conflicts)
    return order[idx]


def _ma_bull_pos(d):
    if   d < -15: return 0.0
    elif d <  -5: return (d + 15) / 10 * 6
    elif d <   0: return 6.0 + (d + 5) / 5 * 9
    elif d <  15: return 15.0 + d / 15 * 5
    elif d <  30: return 20.0 - (d - 15) / 15 * 8
    else:         return 5.0


def _ma_bear_pos(d):
    if   d >  15: return 0.0
    elif d >   5: return (15 - d) / 10 * 6
    elif d >   0: return 6.0 + (5 - d) / 5 * 9
    elif d > -15: return 15.0 + (-d) / 15 * 5
    elif d > -30: return 20.0 - (-d - 15) / 15 * 8
    else:         return 5.0


def calc_bull_strength(rs_excess_52w, ma_distance_pct, ma_slope_val, slope_dir,
                       sector_rs_60d, benchmark_ma_distance, benchmark_slope_dir):
    rs_score  = min(30.0, max(0.0,  rs_excess_52w * 0.6))
    ma_score  = _ma_bull_pos(ma_distance_pct)
    slp_score = float(ma_slope_val) if slope_dir == "bullish" else 0.0
    sec_val   = sector_rs_60d if sector_rs_60d is not None else 0.0
    sec_score = min(25.0, max(0.0,  sec_val))
    mkt_score = (6.0 if benchmark_ma_distance > 0       else 0.0) \
              + (6.0 if benchmark_slope_dir == "bullish" else 0.0)
    return round(rs_score + ma_score + slp_score + sec_score + mkt_score, 1)


def calc_bear_strength(rs_excess_52w, ma_distance_pct, ma_slope_val, slope_dir,
                       sector_rs_60d, benchmark_ma_distance, benchmark_slope_dir):
    rs_score  = min(30.0, max(0.0, -rs_excess_52w * 0.6))
    ma_score  = _ma_bear_pos(ma_distance_pct)
    slp_score = float(ma_slope_val) if slope_dir == "bearish" else 0.0
    sec_val   = sector_rs_60d if sector_rs_60d is not None else 0.0
    sec_score = min(25.0, max(0.0, -sec_val))
    mkt_score = (6.0 if benchmark_ma_distance < 0       else 0.0) \
              + (6.0 if benchmark_slope_dir == "bearish" else 0.0)
    return round(rs_score + ma_score + slp_score + sec_score + mkt_score, 1)


def classify_signal(bull_strength, bear_strength):
    net = bull_strength - bear_strength
    if   net >=  50: return "long"
    elif net >=  30: return "long_watch"
    elif net <= -50: return "short"
    elif net <= -30: return "short_watch"
    return "neutral"


def hint_stage(ma_distance_pct, slope_dir, days_since_slope_turn):
    above = ma_distance_pct > 0
    fresh = days_since_slope_turn is not None and days_since_slope_turn <= 20
    if slope_dir == "bullish":
        if not above and ma_distance_pct > -8:
            return "stage1_late"
        elif above and ma_distance_pct <= 15:
            return "stage2_early" if fresh else "stage2"
        else:
            return "stage2_extended"
    else:
        if above and ma_distance_pct < 8:
            return "stage3_late"
        elif not above and ma_distance_pct >= -15:
            return "stage4_early" if fresh else "stage4"
        else:
            return "stage4_extended"


def get_high_days(prices, window, lookback=90):
    prev_max = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).max()
    is_new_high = prices >= prev_max
    recent = is_new_high.iloc[-lookback:]
    if recent.any():
        pos = len(recent) - 1 - recent.values[::-1].argmax()
        return int(len(recent) - 1 - pos)
    return None


def get_low_days(prices, window, lookback=90):
    prev_min = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).min()
    is_new_low = prices <= prev_min
    recent = is_new_low.iloc[-lookback:]
    if recent.any():
        pos = len(recent) - 1 - recent.values[::-1].argmax()
        return int(len(recent) - 1 - pos)
    return None


def get_breakout_onset_days(prices, window, lookback=90, gap_min=10):
    prev_max    = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).max()
    is_new_high = (prices >= prev_max).fillna(False)
    recent      = is_new_high.iloc[-lookback:]
    arr         = recent.values
    n           = len(arr)
    if not arr.any():
        return None
    latest    = n - 1 - arr[::-1].argmax()
    gap_count = 0
    onset     = latest
    for i in range(latest - 1, -1, -1):
        if arr[i]:
            onset     = i
            gap_count = 0
        else:
            gap_count += 1
            if gap_count >= gap_min:
                break
    return int(n - 1 - onset)


def get_near_high_pct(prices, window):
    rolling_high = prices.rolling(window, min_periods=max(window // 2, 10)).max()
    if len(rolling_high.dropna()) == 0:
        return None
    current = float(prices.iloc[-1])
    high    = float(rolling_high.iloc[-1])
    if high <= 0:
        return None
    return round((high - current) / high * 100, 2)


# ─────────────────────────────────────────
# RS 라인 (정규화, 1년=100)
# ─────────────────────────────────────────

def calc_rs_line(stock_prices, benchmark_prices, window=252):
    """코스피(benchmark) 대비 종목 상대강도 라인 (1년 전 = 100 기준)"""
    aligned = benchmark_prices.reindex(stock_prices.index).dropna()
    common  = stock_prices.reindex(aligned.index).dropna()
    aligned = aligned.reindex(common.index)

    if len(common) < window // 2:
        return []

    base_stock = common.iloc[max(0, len(common) - window)]
    base_bench = aligned.iloc[max(0, len(aligned) - window)]
    if base_stock == 0 or base_bench == 0:
        return []

    rs_line = (common / base_stock) / (aligned / base_bench) * 100
    result  = rs_line.tail(window)
    return [{"d": str(idx.date()), "v": round(float(v), 3)} for idx, v in result.items() if not np.isnan(v)]


def calc_rs_line_sector(stock_prices, sector_prices, window=252):
    """섹터 ETF 대비 종목 상대강도 라인"""
    aligned = sector_prices.reindex(stock_prices.index).dropna()
    common  = stock_prices.reindex(aligned.index).dropna()
    aligned = aligned.reindex(common.index)

    if len(common) < window // 2:
        return []

    base_stock  = common.iloc[max(0, len(common) - window)]
    base_sector = aligned.iloc[max(0, len(aligned) - window)]
    if base_stock == 0 or base_sector == 0:
        return []

    rs_line = (common / base_stock) / (aligned / base_sector) * 100
    result  = rs_line.tail(window)
    return [{"d": str(idx.date()), "v": round(float(v), 3)} for idx, v in result.items() if not np.isnan(v)]


# ─────────────────────────────────────────
# 메인
# ─────────────────────────────────────────

def main():
    today_str = datetime.now().strftime("%Y-%m-%d")
    print(f"\n{'='*65}")
    print(f"  한국 워치리스트 (코스피 기준)  |  {today_str}")
    print(f"{'='*65}\n")

    all_tickers  = list({t for s in SECTORS_KR for t in s["tickers"]})
    sector_etfs  = list({s["etf"] for s in SECTORS_KR if s["etf"] != "KOSPI"})
    download_list = list(set(all_tickers + sector_etfs + [BENCHMARK]))

    print(f"📥 {len(all_tickers)}개 종목 + {len(sector_etfs)}개 섹터 ETF + 코스피 수집 중...")
    raw = yf.download(
        download_list,
        period="2y",
        auto_adjust=True,
        progress=False,
        group_by="column"
    )

    prices = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw

    if BENCHMARK not in prices.columns:
        print(f"❌ {BENCHMARK} (코스피) 데이터 없음. 종료.")
        return

    benchmark_prices = prices[BENCHMARK].dropna()

    # ── 벤치마크 수익률 시리즈
    bench_returns_stock  = benchmark_prices.pct_change(RS_WINDOW_STOCK)  * 100
    bench_returns_sector = benchmark_prices.pct_change(RS_WINDOW_SECTOR) * 100
    bench_returns_60d    = benchmark_prices.pct_change(RS_WINDOW_60)     * 100
    bench_returns_20d    = benchmark_prices.pct_change(RS_WINDOW_20)     * 100

    # ── 코스피 시장 강도
    bench_ma100_series  = benchmark_prices.rolling(MA_PERIOD).mean().dropna()
    bench_ma100         = float(bench_ma100_series.iloc[-1])
    bench_price_now     = float(benchmark_prices.iloc[-1])
    kospi_ma_distance   = round((bench_price_now - bench_ma100) / bench_ma100 * 100, 2)
    kospi_slope_now     = float(bench_ma100_series.iloc[-1] - bench_ma100_series.iloc[-6])
    kospi_slope_dir     = "bullish" if kospi_slope_now > 0 else "bearish"

    market_regime = ("bull"  if kospi_ma_distance > 0 and kospi_slope_dir == "bullish"
                     else "bear" if kospi_ma_distance < 0 and kospi_slope_dir == "bearish"
                     else "mixed")
    market_context = {
        "kospi_price":    round(bench_price_now, 2),
        "kospi_ma100":    round(bench_ma100, 2),
        "kospi_ma_dist":  kospi_ma_distance,
        "kospi_slope":    kospi_slope_dir,
        "market_state":   market_regime,
    }
    print(f"📊 코스피 상태: {market_regime.upper()}  (MA100 대비 {kospi_ma_distance:+.1f}%, 기울기 {kospi_slope_dir})")

    # ── 섹터 ETF 강도 (vs 코스피, 60일)
    sector_rs_dict            = {}
    sector_rs_history_dict    = {}
    sector_rs_days_dict       = {}
    sector_rs_slope_dir_dict  = {}
    sector_rs_slope_days_dict = {}

    # KOSPI 자체 섹터: RS = 0 고정
    sector_rs_dict["KOSPI"]            = 0.0
    sector_rs_history_dict["KOSPI"]    = [
        {"d": str(idx.date()), "v": 0.0}
        for idx in bench_returns_sector.dropna().index[-60:]
    ]
    sector_rs_days_dict["KOSPI"]       = 0
    sector_rs_slope_dir_dict["KOSPI"]  = "flat"
    sector_rs_slope_days_dict["KOSPI"] = 0

    for etf in sector_etfs:
        if etf not in prices.columns:
            sector_rs_dict[etf]            = None
            sector_rs_history_dict[etf]    = []
            sector_rs_days_dict[etf]       = 0
            sector_rs_slope_dir_dict[etf]  = "flat"
            sector_rs_slope_days_dict[etf] = 0
            continue

        etf_ret = prices[etf].dropna().pct_change(RS_WINDOW_SECTOR) * 100
        aligned = etf_ret.reindex(bench_returns_sector.index)
        diff    = (aligned - bench_returns_sector).dropna()

        if len(diff) == 0:
            sector_rs_dict[etf] = None
            sector_rs_history_dict[etf]    = []
            sector_rs_days_dict[etf]       = 0
            sector_rs_slope_dir_dict[etf]  = "flat"
            sector_rs_slope_days_dict[etf] = 0
            continue

        sector_rs_dict[etf] = round(float(diff.iloc[-1]), 3)
        sector_rs_history_dict[etf] = [
            {"d": str(idx.date()), "v": round(float(val), 3)}
            for idx, val in diff.tail(60).items()
            if not np.isnan(float(val))
        ]

        # 현재 방향 연속 일수
        cur_sign = 1 if float(diff.iloc[-1]) >= 0 else -1
        days_in_dir = 0
        for v in reversed(diff.values):
            if (1 if v >= 0 else -1) == cur_sign:
                days_in_dir += 1
            else:
                break
        sector_rs_days_dict[etf] = days_in_dir

        # RS 기울기 방향
        if len(diff) >= RS_MA_PERIOD + 5:
            ema_now  = diff.ewm(span=RS_MA_PERIOD).mean()
            slope_rs = float(ema_now.iloc[-1] - ema_now.iloc[-6])
            rs_dir   = "up" if slope_rs > 0 else ("down" if slope_rs < 0 else "flat")
        else:
            rs_dir = "flat"
        sector_rs_slope_dir_dict[etf] = rs_dir

        days_in_slope = 0
        if rs_dir != "flat" and len(diff) >= RS_MA_PERIOD:
            ema_series = diff.ewm(span=RS_MA_PERIOD).mean()
            target_dir = 1 if rs_dir == "up" else -1
            for i in range(6, len(ema_series)):
                slope_i = float(ema_series.iloc[-i] - ema_series.iloc[-(i + 5)])
                if (1 if slope_i > 0 else (-1 if slope_i < 0 else 0)) != target_dir:
                    days_in_slope = i
                    break
            if days_in_slope == 0:
                days_in_slope = min(len(ema_series) - 6, 999)
        sector_rs_slope_days_dict[etf] = days_in_slope

    print(f"✅ 섹터 ETF {len(sector_etfs)}개 RS 계산 완료")

    # ── 종목별 처리
    sectors_out = []
    total_count = 0

    for sector in SECTORS_KR:
        s_name      = sector["name"]
        s_etf       = sector["etf"]
        s_emoji     = sector["emoji"]
        s_id        = sector["id"]
        s_tickers   = sector["tickers"]

        sector_rs_60d_val = sector_rs_dict.get(s_etf)
        sector_prices_col = prices[s_etf] if s_etf in prices.columns else None

        stocks_out = []
        for ticker in s_tickers:
            if ticker not in prices.columns:
                continue

            stock_prices = prices[ticker].dropna()
            if len(stock_prices) < MA_PERIOD:
                continue

            # ── 기본 MA
            ma100_series = stock_prices.rolling(MA_PERIOD).mean().dropna()
            if len(ma100_series) < 6:
                continue
            ma100         = float(ma100_series.iloc[-1])
            price_now     = float(stock_prices.iloc[-1])
            ma_distance   = round((price_now - ma100) / ma100 * 100, 2)

            ma150_series = stock_prices.rolling(MA_PERIOD_150).mean().dropna()
            ma150 = float(ma150_series.iloc[-1]) if len(ma150_series) >= 1 else None
            ma150_dist = round((price_now - ma150) / ma150 * 100, 2) if ma150 and ma150 > 0 else None

            ma_slope_val, slope_dir, days_since_slope_turn = calc_ma_slope_score(ma100_series)

            # ── RS (vs 코스피)
            try:
                stock_ret_252 = stock_prices.pct_change(RS_WINDOW_STOCK)
                stock_ret_60  = stock_prices.pct_change(RS_WINDOW_60)
                stock_ret_20  = stock_prices.pct_change(RS_WINDOW_20)

                bench_252 = bench_returns_stock.reindex(stock_ret_252.index)
                bench_60  = bench_returns_60d.reindex(stock_ret_60.index)
                bench_20  = bench_returns_20d.reindex(stock_ret_20.index)

                rs_252 = float(stock_ret_252.iloc[-1] - bench_252.iloc[-1]) if not np.isnan(stock_ret_252.iloc[-1]) and not np.isnan(bench_252.iloc[-1]) else None
                rs_60  = float(stock_ret_60.iloc[-1]  - bench_60.iloc[-1])  if not np.isnan(stock_ret_60.iloc[-1])  and not np.isnan(bench_60.iloc[-1])  else None
                rs_20  = float(stock_ret_20.iloc[-1]  - bench_20.iloc[-1])  if not np.isnan(stock_ret_20.iloc[-1])  and not np.isnan(bench_20.iloc[-1])  else None
            except Exception:
                rs_252 = rs_60 = rs_20 = None

            rs_weighted = calc_weighted_rs(rs_20, rs_60, rs_252)

            # RS 기울기
            try:
                bench_aligned = benchmark_prices.reindex(stock_prices.index)
                rs_ratio = (stock_prices / bench_aligned).dropna()
                if len(rs_ratio) >= RS_MA_PERIOD + 6:
                    rs_ema     = rs_ratio.ewm(span=RS_MA_PERIOD).mean()
                    rs_slope_n = float(rs_ema.iloc[-1] - rs_ema.iloc[-6])
                    rs_slope_d = "up" if rs_slope_n > 0 else ("down" if rs_slope_n < 0 else "flat")
                    rs_slope_days = 0
                    target = 1 if rs_slope_d == "up" else (-1 if rs_slope_d == "down" else 0)
                    for i in range(6, min(80, len(rs_ema))):
                        s_i = float(rs_ema.iloc[-i] - rs_ema.iloc[-(i + 5)])
                        if (1 if s_i > 0 else (-1 if s_i < 0 else 0)) != target:
                            rs_slope_days = i
                            break
                    if rs_slope_days == 0:
                        rs_slope_days = min(len(rs_ema) - 6, 999)
                else:
                    rs_slope_d    = "flat"
                    rs_slope_days = 0
            except Exception:
                rs_slope_d    = "flat"
                rs_slope_days = 0

            # ── 신고가/신저가
            try:
                highs         = {"w52": get_high_days(stock_prices, 252), "w26": get_high_days(stock_prices, 130), "w13": get_high_days(stock_prices, 65)}
                lows          = {"w52": get_low_days(stock_prices, 252),  "w26": get_low_days(stock_prices, 130),  "w13": get_low_days(stock_prices, 65)}
                near_highs    = {"w52": get_near_high_pct(stock_prices, 252), "w26": get_near_high_pct(stock_prices, 130), "w13": get_near_high_pct(stock_prices, 65)}
                breakout_onsets = {"w52": get_breakout_onset_days(stock_prices, 252), "w26": get_breakout_onset_days(stock_prices, 130), "w13": get_breakout_onset_days(stock_prices, 65)}
            except Exception:
                highs = lows = near_highs = breakout_onsets = {"w52": None, "w26": None, "w13": None}

            # ── RS 라인 (1년, 정규화)
            try:
                rs_bench_line  = calc_rs_line(stock_prices, benchmark_prices, window=252)
                rs_sector_line = calc_rs_line_sector(stock_prices, sector_prices_col, window=252) if sector_prices_col is not None else []
            except Exception:
                rs_bench_line  = []
                rs_sector_line = []

            # ── 시그널
            bull = calc_bull_strength(rs_weighted, ma_distance, ma_slope_val, slope_dir, sector_rs_60d_val, kospi_ma_distance, kospi_slope_dir)
            bear = calc_bear_strength(rs_weighted, ma_distance, ma_slope_val, slope_dir, sector_rs_60d_val, kospi_ma_distance, kospi_slope_dir)
            net  = round(bull - bear, 1)

            signal    = classify_signal(bull, bear)
            signal    = apply_signal_gate(signal, ma_distance, slope_dir, market_regime)
            conflicts = calc_conflicts(signal, rs_weighted, ma_distance, slope_dir, sector_rs_60d_val, market_regime)
            signal    = downgrade_signal(signal, conflicts)

            stage = hint_stage(ma_distance, slope_dir, days_since_slope_turn)

            rs_20_ma = round(float(stock_prices.pct_change(RS_MA_PERIOD).iloc[-1] - benchmark_prices.pct_change(RS_MA_PERIOD).reindex(stock_prices.index).iloc[-1]), 3) if not np.isnan(stock_prices.pct_change(RS_MA_PERIOD).iloc[-1]) else None

            stocks_out.append({
                "ticker":          ticker,
                "score":           net,
                "signal":          signal,
                "stage":           stage,
                "rs_spy_line":     rs_bench_line,   # 필드명 유지 (프론트 호환)
                "rs_sector_line":  rs_sector_line,
                "highs":           highs,
                "lows":            lows,
                "near_highs":      near_highs,
                "breakout_onsets": breakout_onsets,
                "eps":             None,             # 한국판: EPS 없음
                "breakdown": {
                    "bull_strength": bull,
                    "bear_strength": bear,
                    "net_direction": net,
                    "ma_slope":      round(ma_slope_val, 2),
                    "sector_rs_60d": round(sector_rs_60d_val, 3) if sector_rs_60d_val is not None else None,
                    "rs_fresh_bull": 0.0,
                    "rs_fresh_bear": 0.0,
                },
                "data": {
                    "price":                 round(price_now, 2),
                    "ma100":                 round(ma100, 2),
                    "ma_distance_pct":       ma_distance,
                    "ma150":                 round(ma150, 2) if ma150 else None,
                    "ma150_distance_pct":    ma150_dist,
                    "slope_dir":             slope_dir,
                    "days_since_slope_turn": days_since_slope_turn,
                    "rs_excess_pct":         round(rs_weighted, 3),
                    "rs_20d_ma":             rs_20_ma,
                    "sector_rs_excess":      round(sector_rs_60d_val, 3) if sector_rs_60d_val is not None else None,
                    "rs_slope_dir":          rs_slope_d,
                    "rs_slope_days":         rs_slope_days,
                },
            })

        # 섹터 내 종목 정렬 (net_direction 내림차순)
        stocks_out.sort(key=lambda x: x["breakdown"]["net_direction"], reverse=True)
        stocks_out = stocks_out[:15]
        total_count += len(stocks_out)

        sectors_out.append({
            "id":                   s_id,
            "name":                 s_name,
            "etf":                  s_etf,
            "emoji":                s_emoji,
            "sector_rs_excess":     round(sector_rs_dict.get(s_etf, 0) or 0, 3),
            "sector_rs_days":       sector_rs_days_dict.get(s_etf, 0),
            "sector_rs_slope_dir":  sector_rs_slope_dir_dict.get(s_etf, "flat"),
            "sector_rs_slope_days": sector_rs_slope_days_dict.get(s_etf, 0),
            "sector_rs_history":    sector_rs_history_dict.get(s_etf, []),
            "stocks":               stocks_out,
        })
        print(f"  ✓ {s_name:16s}  종목 {len(stocks_out):2d}개")

    # 섹터 정렬 (섹터 RS 내림차순, KOSPI는 마지막)
    non_market = [s for s in sectors_out if s["etf"] != "KOSPI"]
    market_sec = [s for s in sectors_out if s["etf"] == "KOSPI"]
    non_market.sort(key=lambda x: x["sector_rs_excess"] or 0, reverse=True)
    sectors_out = non_market + market_sec

    result = {
        "asOf":           today_str,
        "benchmark":      BENCHMARK,
        "ma_period":      MA_PERIOD,
        "rs_window_stock": RS_WINDOW_STOCK,
        "rs_window_sector": RS_WINDOW_SECTOR,
        "total":          total_count,
        "market_context": market_context,
        "sectors":        sectors_out,
    }

    # ── 저장
    out_path = os.path.join(os.path.dirname(__file__), "..", "public", "data", "watchlist_kr.json")
    out_path = os.path.normpath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"\n✅ 완료!  총 {total_count}개 종목  →  {out_path}")
    print(f"   코스피 상태: {market_regime.upper()}  |  날짜: {today_str}\n")


if __name__ == "__main__":
    main()
