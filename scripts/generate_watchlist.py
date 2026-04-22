"""
generate_watchlist.py

스탠 와인스타인 스테이지 전환 감지 스크립트 v5

▶ 방향별 강도 점수 시스템 (0-105점):

  bull_strength = RS 가중(0-30) + MA 위치(0-20) + MA 기울기(0-13) + 섹터 60d(0-25) + 시장(0-12)
  bear_strength = 동일 구조, 반대 방향

  RS 가중 = 단기(20d) 20% + 중기(60d) 30% + 장기(252d) 50%
  MA 기울기 = 신선도 + 속도(기울기 크기) 복합 점수

▶ 3단계 시그널 결정:
  1단계: classify_signal(bull, bear)
    net >= +50 → long / net >= +30 → long_watch
    net <= -50 → short / net <= -30 → short_watch
  2단계: apply_signal_gate (2단계 게이트)
    long 게이트: price>MA100 AND slope_bullish AND market≠bear → 실패 시 long→long_watch
    short 게이트: price<MA100 AND slope_bearish AND market≠bull → 실패 시 short→short_watch
    시장 bear 시: long_watch→neutral
  3단계: 모순 패널티 (calc_conflicts)
    갈등 쌍마다 시그널 1단계 다운그레이드 (최대 neutral까지)

섹터 정렬: 섹터 RS(60일) 내림차순 (강한 섹터 위)
종목 정렬: net_direction 내림차순
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
# 파라미터
# ─────────────────────────────────────────

BENCHMARK        = "SPY"
MA_PERIOD        = 100
MA_PERIOD_150    = 150
RS_WINDOW_STOCK  = 252    # 52주 = 1년 (종목 RS 장기)
RS_WINDOW_60     = 60     # 중기 3개월
RS_WINDOW_20     = 20     # 단기 1개월
RS_WINDOW_SECTOR = 60     # 중기 3개월 (섹터 강도)
RS_MA_PERIOD     = 20     # RS 방향성 MA (4주)
RS_WEIGHTS       = (0.2, 0.3, 0.5)  # 20d : 60d : 252d 가중치

# ─────────────────────────────────────────
# 섹터 정의
# ─────────────────────────────────────────

SECTORS = [
    {"id":  1, "name": "반도체",     "etf": "SOXX", "emoji": "💾",
     "tickers": ["NVDA","AVGO","TSM","AMD","INTC","QCOM","MU","AMAT","LRCX","KLAC","ASML","MRVL","ON","TER","WOLF"]},
    {"id":  2, "name": "기술",       "etf": "XLK",  "emoji": "💻",
     "tickers": ["AAPL","MSFT","ORCL","ADBE","CSCO","IBM","NOW","INTU","PANW","CRM","FTNT","SNOW","PLTR","MDB","ZS"]},
    {"id":  3, "name": "커뮤니케이션","etf": "XLC",  "emoji": "📡",
     "tickers": ["META","GOOGL","NFLX","DIS","TMUS","VZ","T","CHTR","EA","TTWO","SNAP","PINS","SPOT","WBD","LYV"]},
    {"id":  4, "name": "소비재(임의)","etf": "XLY",  "emoji": "🛍️",
     "tickers": ["AMZN","TSLA","HD","MCD","NKE","LOW","SBUX","TJX","BKNG","CMG","ABNB","ROST","YUM","MAR","EXPE"]},
    {"id":  5, "name": "소비재(필수)","etf": "XLP",  "emoji": "🛒",
     "tickers": ["PG","KO","PEP","COST","WMT","PM","MO","CL","MDLZ","STZ","KR","SYY","HSY","CHD","CLX"]},
    {"id":  6, "name": "헬스케어",   "etf": "XLV",  "emoji": "🏥",
     "tickers": ["UNH","LLY","ABT","TMO","MRK","AMGN","ISRG","SYK","BSX","MDT","ELV","HCA","CI","MCK","HIMS"]},
    {"id":  7, "name": "바이오테크", "etf": "XBI",  "emoji": "🧬",
     "tickers": ["MRNA","REGN","VRTX","BIIB","BMRN","ALNY","IONS","INCY","SRPT","EXAS","ROIV","CRSP","NTLA","BEAM","RXRX"]},
    {"id":  8, "name": "금융",       "etf": "XLF",  "emoji": "🏦",
     "tickers": ["JPM","BRK-B","V","MA","BAC","WFC","GS","MS","BLK","SPGI","AXP","CB","PGR","MET","TRV"]},
    {"id":  9, "name": "에너지",     "etf": "XLE",  "emoji": "🛢️",
     "tickers": ["XOM","CVX","EOG","SLB","COP","MPC","OXY","WMB","PSX","VLO","LNG","KMI","DVN","HAL","BKR"]},
    {"id": 10, "name": "산업재",     "etf": "XLI",  "emoji": "⚙️",
     "tickers": ["GE","CAT","ETN","HON","UNP","MMM","DE","EMR","PH","ROK","ITW","GWW","FDX","UPS","CARR"]},
    {"id": 11, "name": "방산",       "etf": "ITA",  "emoji": "🚀",
     "tickers": ["RTX","LMT","NOC","GD","BA","HEI","TDG","CACI","LDOS","SAIC","LHX","CW","DRS","KTOS","AXON"]},
    {"id": 12, "name": "소재",       "etf": "XLB",  "emoji": "⛏️",
     "tickers": ["LIN","APD","SHW","FCX","ECL","NEM","NUE","VMC","DOW","ALB","PPG","IP","PKG","CF","MOS"]},
    {"id": 13, "name": "유틸리티",   "etf": "XLU",  "emoji": "⚡",
     "tickers": ["NEE","DUK","SO","D","EXC","AEP","XEL","ED","ETR","ES","SRE","AWK","WEC","CMS","AES"]},
    {
        "id": 14, "name": "크립토", "etf": "IBIT", "emoji": "₿",
        "tickers": [
            "IBIT","MSTR","COIN","CRCL","MARA","RIOT","CLSK","HUT","IREN","BMNR","BTBT",
            "CORZ","WULF","CIFR","BITF","GBTC",
        ]
    },
    {
        "id": 15, "name": "양자컴퓨터", "etf": "QTUM", "emoji": "⚛️",
        "tickers": [
            "QTUM","IONQ","RGTI","QUBT","QBTS","ARQQ",
            "IBM","GOOGL","MSFT","NVDA","INTC",
        ]
    },
    {
        "id": 16, "name": "QQQ (나스닥100)", "etf": "QQQ", "emoji": "🔷",
        "tickers": [
            "MSFT","AAPL","NVDA","AMZN","META","TSLA","GOOGL","AVGO","COST","NFLX",
            "ADBE","PEP","CSCO","INTU","TMUS",
        ]
    },
    {
        "id": 17, "name": "핀테크(ARKF)", "etf": "ARKF", "emoji": "💳",
        "tickers": [
            "COIN","XYZ","HOOD","SOFI","PYPL",
            "AFRM","BILL","UPST","NU","TOST",
            "GPN","V","MA","INTU","FIS",
        ]
    },
    {
        "id": 18, "name": "2차전지", "etf": "LIT", "emoji": "🔋",
        "tickers": [
            "ALB","SQM","MP","LAC","SGML",
            "QS","SLDP","RIVN","CHPT","EVGO",
            "BLNK","STEM","PLUG","BE","FCEL",
        ]
    },
    {
        "id": 19, "name": "로봇/자동화", "etf": "ROBO", "emoji": "🤖",
        "tickers": [
            "ISRG","CGNX","ZBRA","TDY","PATH",
            "ONTO","AZTA","RRX","NOVT","ROK",
            "TER","TRMB","KEYS","BRKR","NNDM",
        ]
    },
    {
        "id": 20, "name": "귀금속", "etf": "GDX", "emoji": "🥇",
        "tickers": [
            "NEM","GOLD","AEM","KGC","WPM",
            "FNV","RGLD","AU","PAAS","AGI",
            "HL","EXK","CDE","HMY","GFI",
        ]
    },
    {
        "id": 21, "name": "클린에너지", "etf": "TAN", "emoji": "☀️",
        "tickers": [
            "FSLR","ENPH","SEDG","ARRY","RUN",
            "FLNC","HASI","BEP","CWEN","MAXN",
            "SHLS","CSIQ","JKS","ORA","AES",
        ]
    },
    {
        "id": 22, "name": "부동산(REIT)", "etf": "XLRE", "emoji": "🏢",
        "tickers": [
            "AMT","PLD","EQIX","CCI","PSA",
            "WELL","DLR","O","SPG","AVB",
            "EQR","VICI","VTR","NNN","IRM",
        ]
    },
    {
        "id": 23, "name": "원자력", "etf": "URA", "emoji": "☢️",
        "tickers": [
            "CCJ","LEU","UEC","DNN","NXE",
            "UUUU","BWXT","CEG","VST","SMR",
            "OKLO","NNE","GEV","TLN","ETN",
        ]
    },
    {
        "id": 24, "name": "우주", "etf": "ARKX", "emoji": "🛸",
        "tickers": [
            "RKLB","LUNR","ASTS","PL","RDW",
            "SPIR","GSAT","IRDM","VSAT","SATL",
            "MNTS","HON","BA","HEI","TDG",
        ]
    },
    {
        "id": 25, "name": "사이버보안", "etf": "HACK", "emoji": "🔐",
        "tickers": [
            "CRWD","ZS","S","CYBR","TENB",
            "QLYS","VRNS","NET","OKTA","RPD",
            "PANW","FTNT","CSCO","IBM","SAIL",
        ]
    },
    {
        "id": 26, "name": "시장(SPY)", "etf": "SPY", "emoji": "🇺🇸",
        "tickers": [
            "AAPL","MSFT","NVDA","AMZN","META",
            "GOOGL","TSLA","AVGO","BRK-B","JPM",
            "LLY","UNH","V","XOM","MA",
        ]
    },
]

# ─────────────────────────────────────────
# MA 기울기 신선도 점수
# ─────────────────────────────────────────

def calc_ma_slope_score(ma_series, max_score=13):
    """
    MA100 기울기 강도: 신선도(방향 전환 후 경과일) + 속도(기울기 크기) = 복합 점수 (0-13)
    반환: (score, direction, days_since_turn)
    direction = "bullish" | "bearish" | "flat"
    """
    if len(ma_series) < 30:
        return 0.0, "flat", None

    slope_now = float(ma_series.iloc[-1] - ma_series.iloc[-6])
    cur_dir   = 1 if slope_now > 0 else (-1 if slope_now < 0 else 0)
    direction = "bullish" if cur_dir > 0 else ("bearish" if cur_dir < 0 else "flat")

    if cur_dir == 0:
        return 2.0, "flat", None

    # 속도 보너스: 5일 기울기를 MA 값으로 정규화 (상대 속도 %)
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

    # 신선도 점수 (max_score 공간 확보를 위해 상한 낮춤)
    if   days_since_turn <= 5:  freshness = 11
    elif days_since_turn <= 10: freshness = 9
    elif days_since_turn <= 20: freshness = 6
    elif days_since_turn <= 40: freshness = 3
    else:                       freshness = 1

    score = min(max_score, freshness + velocity_bonus)
    return float(score), direction, days_since_turn


# ─────────────────────────────────────────
# 다기간 RS 가중 평균
# ─────────────────────────────────────────

def calc_weighted_rs(rs_20d, rs_60d, rs_252d):
    """
    단기(20d) 20% + 중기(60d) 30% + 장기(252d) 50% 가중 RS
    None 값은 건너뛰고 가중치 재정규화
    """
    pairs = list(zip(RS_WEIGHTS, (rs_20d, rs_60d, rs_252d)))
    available = [(w, v) for w, v in pairs if v is not None]
    if not available:
        return 0.0
    total_w = sum(w for w, _ in available)
    return round(sum(w * v for w, v in available) / total_w, 2)


# ─────────────────────────────────────────
# 2단계 게이트 + 갈등 패널티
# ─────────────────────────────────────────

def apply_signal_gate(signal, ma_distance_pct, slope_dir, market_regime):
    """
    2단계 구조: 강한 시그널은 게이트 조건을 통과해야 함.

    Long 게이트 (모두 충족 시 "long" 가능):
      - price > MA100 (ma_distance_pct > 0)
      - MA slope bullish
      - market != risk_off (bear)

    Short 게이트 (모두 충족 시 "short" 가능):
      - price < MA100 (ma_distance_pct < 0)
      - MA slope bearish
      - market != risk_on (bull)

    게이트 통과 실패 시: long → long_watch, short → short_watch
    시장 리스크오프 시: 롱계열 신호 전체를 한 단계 낮춤
    """
    if signal == "long":
        gate_ok = (ma_distance_pct > 0
                   and slope_dir == "bullish"
                   and market_regime != "bear")
        if not gate_ok:
            return "long_watch"
    elif signal == "short":
        gate_ok = (ma_distance_pct < 0
                   and slope_dir == "bearish"
                   and market_regime != "bull")
        if not gate_ok:
            return "short_watch"
    # 시장 리스크오프 → 롱 시그널 추가 억제
    if market_regime == "bear" and signal == "long_watch":
        return "neutral"
    return signal


def calc_conflicts(signal, rs_weighted, ma_distance_pct, slope_dir,
                   sector_rs_60d, market_regime):
    """
    모순 쌍 카운트. 각 모순마다 시그널 1단계 다운그레이드.
    롱계열 모순:
      1. RS 강함(>+10%) but 섹터 RS 음수(<-5%) → 섹터 역풍 속 개별 강세
      2. 가격 MA 위 but MA 기울기 하락 → 이미 꺾이는 중
      3. 시장 베어 but 롱 신호 → 시장 역풍
    숏계열 모순:
      1. RS 약함(<-10%) but 섹터 RS 양수(>+5%) → 개별 약세지만 섹터 강함
      2. 가격 MA 아래 but MA 기울기 상승 → 반등 가능성
      3. 시장 불 but 숏 신호 → 시장 역풍
    """
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
    """갈등 횟수만큼 시그널 다운그레이드 (롱계열→중립 방향, 숏계열→중립 방향)"""
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


# ─────────────────────────────────────────
# 방향별 강도 점수 (bull / bear 완전 분리)
# ─────────────────────────────────────────

def _ma_bull_pos(d):
    """
    MA 위치 → 롱 점수 (0-20, 곡선)
    스위트스팟: MA 0~+15% = 15→20점
    과연장:     MA +30% 초과 = 5점 고정 (평균회귀 위험)
    MA 아래:    MA -5~0% = 6→15점 (회복 직전 진입 타이밍)
    """
    if   d < -15: return 0.0
    elif d <  -5: return (d + 15) / 10 * 6          # -15%→0, -5%→6
    elif d <   0: return 6.0 + (d + 5) / 5 * 9      # -5%→6, 0%→15
    elif d <  15: return 15.0 + d / 15 * 5           # 0%→15, +15%→20
    elif d <  30: return 20.0 - (d - 15) / 15 * 8   # +15%→20, +30%→12
    else:         return 5.0                          # 과연장 고정


def _ma_bear_pos(d):
    """
    MA 위치 → 숏 점수 (0-20, 곡선)
    스위트스팟: MA 0~-15% = 15→20점
    과연장:     MA -30% 미만 = 5점 고정 (반등 위험)
    MA 위:      MA +5~0% = 6→15점 (하락 초입)
    """
    if   d >  15: return 0.0
    elif d >   5: return (15 - d) / 10 * 6           # +15%→0, +5%→6
    elif d >   0: return 6.0 + (5 - d) / 5 * 9      # +5%→6, 0%→15
    elif d > -15: return 15.0 + (-d) / 15 * 5        # 0%→15, -15%→20
    elif d > -30: return 20.0 - (-d - 15) / 15 * 8  # -15%→20, -30%→12
    else:         return 5.0                          # 과연장 고정


def calc_bull_strength(rs_excess_52w, ma_distance_pct, ma_slope_val, slope_dir,
                       sector_rs_60d, spy_ma_distance, spy_slope_dir):
    """
    롱(불리시) 신호 강도 (0-105점, RS신선도 보너스 포함 시)

    RS 52w   (0-30): 초과수익 50% = 30점, 음수 = 0점
    MA 위치   (0-20): 곡선 구조 — 스위트스팟(0~+15%) 고점, 과연장(+30%↑) = 5점
    MA 기울기  (0-13): bullish일 때만 신선도 점수
    섹터 60d  (0-25): 초과수익 25% = 25점, 음수 = 0점
    시장      (0-12): SPY MA100 위 +6 / 기울기 상승 +6
    """
    rs_score  = min(30.0, max(0.0,  rs_excess_52w * 0.6))
    ma_score  = _ma_bull_pos(ma_distance_pct)
    slp_score = float(ma_slope_val) if slope_dir == "bullish" else 0.0
    sec_val   = sector_rs_60d if sector_rs_60d is not None else 0.0
    sec_score = min(25.0, max(0.0,  sec_val))
    mkt_score = (6.0 if spy_ma_distance > 0        else 0.0) \
              + (6.0 if spy_slope_dir == "bullish"  else 0.0)
    return round(rs_score + ma_score + slp_score + sec_score + mkt_score, 1)


def calc_bear_strength(rs_excess_52w, ma_distance_pct, ma_slope_val, slope_dir,
                       sector_rs_60d, spy_ma_distance, spy_slope_dir):
    """
    숏(베어리시) 신호 강도 (0-105점, RS신선도 보너스 포함 시)

    RS 52w   (0-30): 초과수익 -50% = 30점, 양수 = 0점
    MA 위치   (0-20): 곡선 구조 — 스위트스팟(0~-15%) 고점, 과연장(-30%↓) = 5점
    MA 기울기  (0-13): bearish일 때만 신선도 점수
    섹터 60d  (0-25): 초과수익 -25% = 25점, 양수 = 0점
    시장      (0-12): SPY MA100 아래 +6 / 기울기 하락 +6
    """
    rs_score  = min(30.0, max(0.0, -rs_excess_52w * 0.6))
    ma_score  = _ma_bear_pos(ma_distance_pct)
    slp_score = float(ma_slope_val) if slope_dir == "bearish" else 0.0
    sec_val   = sector_rs_60d if sector_rs_60d is not None else 0.0
    sec_score = min(25.0, max(0.0, -sec_val))
    mkt_score = (6.0 if spy_ma_distance < 0        else 0.0) \
              + (6.0 if spy_slope_dir == "bearish"  else 0.0)
    return round(rs_score + ma_score + slp_score + sec_score + mkt_score, 1)


def classify_signal(bull_strength, bear_strength):
    """
    net = bull - bear 기준 시그널 분류 (강화된 기준)
      net >= +50 → long        (강한 확신)
      net >= +30 → long_watch  (후보군)
      net <= -50 → short
      net <= -30 → short_watch
      else       → neutral
    """
    net = bull_strength - bear_strength
    if   net >=  50: return "long"
    elif net >=  30: return "long_watch"
    elif net <= -50: return "short"
    elif net <= -30: return "short_watch"
    return "neutral"


# ─────────────────────────────────────────
# 스테이지 힌트 (참고용)
# ─────────────────────────────────────────

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


# ─────────────────────────────────────────
# 신고가/신저가 N일 추적
# ─────────────────────────────────────────

def get_high_days(prices, window, lookback=90):
    """최근 lookback일 내에서 window 신고가 달성 후 며칠이 지났는지 반환 (0=오늘, None=없음)"""
    prev_max = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).max()
    is_new_high = prices >= prev_max
    recent = is_new_high.iloc[-lookback:]
    if recent.any():
        pos = len(recent) - 1 - recent.values[::-1].argmax()
        return int(len(recent) - 1 - pos)
    return None


def get_low_days(prices, window, lookback=90):
    """최근 lookback일 내에서 window 신저가 달성 후 며칠이 지났는지 반환 (0=오늘, None=없음)"""
    prev_min = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).min()
    is_new_low = prices <= prev_min
    recent = is_new_low.iloc[-lookback:]
    if recent.any():
        pos = len(recent) - 1 - recent.values[::-1].argmax()
        return int(len(recent) - 1 - pos)
    return None


def get_breakout_onset_days(prices, window, lookback=90, gap_min=10):
    """
    현재 신고가 스트릭(클러스터)의 '시작일'이 며칠 전인지 반환.

    - 고공행진 중 종목 (NVDA 등): onset이 수개월 전 → 큰 값 반환
    - 진짜 신선한 돌파 종목: 최근 gap_min일+ 공백 후 처음 신고가 → 작은 값 반환
    - None: lookback 내 신고가 없음
    """
    prev_max = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).max()
    is_new_high = (prices >= prev_max).fillna(False)
    recent = is_new_high.iloc[-lookback:]
    arr = recent.values
    n   = len(arr)

    if not arr.any():
        return None

    # 가장 최근 신고가 인덱스 (arr 기준)
    latest = n - 1 - arr[::-1].argmax()

    # latest에서 거꾸로 걸으며 클러스터 시작점 탐색
    # gap_min일 이상 신고가 없으면 → 클러스터 경계
    gap_count = 0
    onset = latest
    for i in range(latest - 1, -1, -1):
        if arr[i]:
            onset = i
            gap_count = 0
        else:
            gap_count += 1
            if gap_count >= gap_min:
                break

    return int(n - 1 - onset)


def get_near_high_pct(prices, window):
    """현재가가 window 거래일 고점 대비 몇 % 아래인지 반환 (0.0=신고가, 양수=아래, None=데이터 부족)"""
    rolling_high = prices.rolling(window, min_periods=max(window // 2, 10)).max()
    if len(rolling_high.dropna()) == 0:
        return None
    current = float(prices.iloc[-1])
    high = float(rolling_high.iloc[-1])
    if high <= 0:
        return None
    return round((high - current) / high * 100, 2)


# ─────────────────────────────────────────
# EPS 서프라이즈 수집 & 추세 분석
# ─────────────────────────────────────────

def fetch_eps_data(ticker):
    """
    yfinance earnings_dates 로 EPS 서프라이즈 히스토리 조회
    반환: (ticker, history) 또는 (ticker, None)
    history = [{"d": "2024-11-15", "actual": 1.23, "estimate": 1.10, "surp": 11.8}, ...]
              오래된 → 최신 순 (왼쪽→오른쪽)
    """
    time.sleep(random.uniform(0.05, 0.35))   # rate limit 방지 jitter
    try:
        t  = yf.Ticker(ticker)
        ed = t.get_earnings_dates(limit=12)
        if ed is None or ed.empty:
            return ticker, None

        now  = pd.Timestamp.now(tz="UTC")
        past = ed[ed.index <= now].dropna(subset=["Reported EPS"])
        past = past.head(12).iloc[::-1]   # 최신 12분기, 오래된 것부터

        # 분기별 매출 (quarterly income statement)
        revenue_map: dict = {}
        try:
            qf = t.quarterly_income_stmt
            if qf is not None and not qf.empty:
                for key in ["Total Revenue", "TotalRevenue"]:
                    if key in qf.index:
                        rev_row = qf.loc[key]
                        for col_date, val in rev_row.items():
                            if pd.notna(val):
                                ts = pd.Timestamp(col_date)
                                revenue_map[ts.tz_localize(None)] = float(val)
                        break
        except Exception:
            pass

        history = []
        for date, row in past.iterrows():
            actual   = row.get("Reported EPS")
            estimate = row.get("EPS Estimate")
            surp     = row.get("Surprise(%)")

            # 매출: 가장 가까운 분기 날짜 (90일 이내)
            rev_val = None
            if revenue_map:
                date_naive = date.tz_localize(None) if date.tzinfo else date
                closest = min(revenue_map.keys(), key=lambda d: abs((d - date_naive).days))
                if abs((closest - date_naive).days) <= 90:
                    rev_val = revenue_map[closest] / 1e9  # 단위: 십억 달러(B)

            history.append({
                "d":        str(date.date()),
                "actual":   round(float(actual),   3) if pd.notna(actual)   else None,
                "estimate": round(float(estimate), 3) if pd.notna(estimate) else None,
                "surp":     round(float(surp),     2) if pd.notna(surp)     else None,
                "revenue":  round(rev_val, 3) if rev_val is not None else None,
            })

        return ticker, (history if history else None)
    except Exception:
        return ticker, None


def calc_eps_trend(history):
    """EPS actual 선형회귀 기울기 → 'improving' / 'declining' / 'stable' / None"""
    actuals = [q["actual"] for q in history if q.get("actual") is not None]
    if len(actuals) < 3:
        return None
    n  = len(actuals)
    x  = list(range(n))
    mx, my = sum(x) / n, sum(actuals) / n
    num = sum((xi - mx) * (yi - my) for xi, yi in zip(x, actuals))
    den = sum((xi - mx) ** 2 for xi in x)
    if den == 0:
        return "stable"
    slope = num / den
    if   slope >  0.02: return "improving"
    elif slope < -0.02: return "declining"
    return "stable"


# ─────────────────────────────────────────
# 메인
# ─────────────────────────────────────────

def main():
    today_str = datetime.now().strftime("%Y-%m-%d")
    print(f"\n{'='*65}")
    print(f"  워치리스트 v4 (방향별 강도)  |  {today_str}")
    print(f"{'='*65}\n")

    all_tickers   = list({t for s in SECTORS for t in s["tickers"]})
    sector_etfs   = list({s["etf"] for s in SECTORS})
    download_list = list(set(all_tickers + sector_etfs + [BENCHMARK]))

    print(f"📥 {len(all_tickers)}개 종목 + {len(sector_etfs)}개 섹터 ETF + {BENCHMARK} 수집 중...")
    raw = yf.download(
        download_list,
        period="2y",
        auto_adjust=True,
        progress=False,
        group_by="column"
    )

    prices = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw

    if BENCHMARK not in prices.columns:
        print(f"❌ {BENCHMARK} 데이터 없음. 종료.")
        return

    spy_prices         = prices[BENCHMARK].dropna()
    spy_returns_stock  = spy_prices.pct_change(RS_WINDOW_STOCK)  * 100   # 252일 (종목 장기 RS)
    spy_returns_sector = spy_prices.pct_change(RS_WINDOW_SECTOR) * 100   # 60일 (섹터용)
    spy_returns_60d    = spy_prices.pct_change(RS_WINDOW_60)     * 100   # 60일 (종목 중기 RS)
    spy_returns_20d    = spy_prices.pct_change(RS_WINDOW_20)     * 100   # 20일 (종목 단기 RS)

    # ── SPY 시장 강도 ──
    spy_ma100_series = spy_prices.rolling(MA_PERIOD).mean().dropna()
    spy_ma100        = float(spy_ma100_series.iloc[-1])
    spy_price_now    = float(spy_prices.iloc[-1])
    spy_ma_distance  = round((spy_price_now - spy_ma100) / spy_ma100 * 100, 2)
    spy_slope_now    = float(spy_ma100_series.iloc[-1] - spy_ma100_series.iloc[-6])
    spy_slope_dir    = "bullish" if spy_slope_now > 0 else "bearish"

    market_regime = ("bull"  if spy_ma_distance > 0 and spy_slope_dir == "bullish"
                     else "bear" if spy_ma_distance < 0 and spy_slope_dir == "bearish"
                     else "mixed")
    market_context = {
        "spy_price":    round(spy_price_now, 2),
        "spy_ma100":    round(spy_ma100, 2),
        "spy_ma_dist":  spy_ma_distance,
        "spy_slope":    spy_slope_dir,
        "market_state": market_regime,
    }
    print(f"📊 시장 상태: {market_context['market_state'].upper()}  "
          f"(SPY MA100 대비 {spy_ma_distance:+.1f}%, 기울기 {spy_slope_dir})")

    # ── 섹터 ETF 강도 (vs SPY, 60일) ──
    sector_rs_dict              = {}
    sector_rs_history_dict      = {}
    sector_rs_days_dict         = {}   # 현재 방향(+/-)으로 연속한 거래일 수
    sector_rs_slope_dir_dict    = {}   # RS Line EMA 기울기 방향 ("up"/"down"/"flat")
    sector_rs_slope_days_dict   = {}   # 해당 기울기 방향으로 연속한 거래일 수
    for etf in sector_etfs:
        if etf not in prices.columns:
            sector_rs_dict[etf]           = None
            sector_rs_history_dict[etf]   = []
            sector_rs_days_dict[etf]      = 0
            sector_rs_slope_dir_dict[etf]  = "flat"
            sector_rs_slope_days_dict[etf] = 0
            continue
        etf_ret = prices[etf].dropna().pct_change(RS_WINDOW_SECTOR) * 100
        aligned = etf_ret.reindex(spy_returns_sector.index)
        diff    = (aligned - spy_returns_sector).dropna()
        sector_rs_dict[etf] = round(float(diff.iloc[-1]), 3)
        sector_rs_history_dict[etf] = [
            {"d": str(idx.date()), "v": round(float(val), 3)}
            for idx, val in diff.tail(60).items()
            if not np.isnan(float(val))
        ]
        # 현재 방향으로 연속 거래일 계산
        cur_sign   = 1 if float(diff.iloc[-1]) >= 0 else -1
        days_in_dir = 0
        for val in reversed(diff.values):
            if np.isnan(float(val)):
                continue
            if (1 if float(val) >= 0 else -1) == cur_sign:
                days_in_dir += 1
            else:
                break
        sector_rs_days_dict[etf] = days_in_dir

        # RS Line (ETF/SPY 실제 가격 비율) → 10일 EMA → 10일 기울기 추적
        etf_daily  = prices[etf].dropna()
        common_idx = etf_daily.index.intersection(spy_prices.index)
        rs_line    = (etf_daily.loc[common_idx] / spy_prices.loc[common_idx]).dropna()
        rs_line_ema = rs_line.ewm(span=10, adjust=False).mean().dropna()

        sector_rs_slope_dir  = "flat"
        sector_rs_slope_days = 0
        if len(rs_line_ema) >= 11:
            slope_now      = float(rs_line_ema.iloc[-1] - rs_line_ema.iloc[-11])
            cur_slope_sign = 1 if slope_now >= 0 else -1
            sector_rs_slope_dir = "up" if cur_slope_sign > 0 else "down"
            for i in range(1, min(200, len(rs_line_ema) - 10)):
                past_slope = float(rs_line_ema.iloc[-i] - rs_line_ema.iloc[-(i + 10)])
                if (1 if past_slope >= 0 else -1) == cur_slope_sign:
                    sector_rs_slope_days += 1
                else:
                    break
        sector_rs_slope_dir_dict[etf]  = sector_rs_slope_dir
        sector_rs_slope_days_dict[etf] = sector_rs_slope_days

    # 섹터 강도 출력 (내림차순)
    print(f"\n섹터 강도 (vs SPY, {RS_WINDOW_SECTOR}일 초과수익률) ─ 강한 순:")
    sorted_for_print = sorted(
        SECTORS,
        key=lambda s: sector_rs_dict.get(s["etf"]) or -999,
        reverse=True
    )
    for s in sorted_for_print:
        v = sector_rs_dict.get(s["etf"])
        bar = "▲" if v and v > 0 else "▼"
        print(f"  {bar} {s['name']:10s} ({s['etf']:4s}): {v:+.2f}%" if v is not None
              else f"  ? {s['name']:10s} ({s['etf']:4s}): N/A")

    # ── EPS 캐시 로드 ──
    eps_cache_path = "public/data/eps_cache.json"
    eps_cache: dict = {}
    if os.path.exists(eps_cache_path):
        try:
            with open(eps_cache_path, "r", encoding="utf-8") as f:
                eps_cache = json.load(f)
            print(f"📦 EPS 캐시 로드: {len(eps_cache)}개 종목")
        except Exception:
            print("  ⚠️  EPS 캐시 로드 실패 — 빈 캐시로 시작")

    # ── EPS 병렬 수집 ──
    print(f"\n📊 EPS 서프라이즈 수집 중... ({len(all_tickers)}개 종목, 병렬)")
    fresh_eps: dict = {}
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(fetch_eps_data, t): t for t in all_tickers}
            for future in concurrent.futures.as_completed(futures, timeout=180):
                try:
                    ticker_eps, hist = future.result(timeout=10)
                    fresh_eps[ticker_eps] = hist
                except Exception:
                    fresh_eps[futures[future]] = None
    except concurrent.futures.TimeoutError:
        print("  ⚠️  EPS 수집 타임아웃 — 일부 데이터 누락될 수 있음")

    # ── 캐시 병합: 새 데이터 있으면 업데이트, 없으면 캐시 유지 ──
    eps_dict: dict = {}
    new_count  = 0
    cache_used = 0
    for ticker in all_tickers:
        fresh = fresh_eps.get(ticker)
        if fresh:
            eps_dict[ticker] = fresh
            eps_cache[ticker] = fresh   # 캐시 갱신
            new_count += 1
        elif ticker in eps_cache:
            eps_dict[ticker] = eps_cache[ticker]  # 캐시 폴백
            cache_used += 1
        else:
            eps_dict[ticker] = None

    eps_ok = sum(1 for v in eps_dict.values() if v)
    print(f"   EPS 수집 완료: {eps_ok}/{len(all_tickers)}개 (신규 {new_count}개 | 캐시 {cache_used}개)")

    # ── 종목별 분석 ──
    print(f"\n📈 종목 분석 중...")
    result_sectors  = []
    total_processed = 0

    for sector in SECTORS:
        sector_rs_excess = sector_rs_dict.get(sector["etf"])
        sector_stocks    = []

        for ticker in sector["tickers"]:
            if ticker not in prices.columns:
                continue

            stock_prices = prices[ticker].dropna()
            if len(stock_prices) < MA_PERIOD + 20:   # 최소 120 거래일 (신규 IPO 대응)
                continue

            try:
                current_price   = float(stock_prices.iloc[-1])
                ma100_series    = stock_prices.rolling(MA_PERIOD).mean().dropna()
                ma100           = float(ma100_series.iloc[-1])
                ma_distance_pct = round((current_price - ma100) / ma100 * 100, 2)

                # MA150
                ma150_series = stock_prices.rolling(MA_PERIOD_150).mean().dropna()
                if len(ma150_series) > 0:
                    ma150              = float(ma150_series.iloc[-1])
                    ma150_distance_pct = round((current_price - ma150) / ma150 * 100, 2)
                else:
                    ma150              = None
                    ma150_distance_pct = None

                # RS 다기간 (252d / 60d / 20d)
                stock_ret_52w = stock_prices.pct_change(RS_WINDOW_STOCK) * 100
                rs_series     = (stock_ret_52w - spy_returns_stock).dropna()
                rs_current    = float(rs_series.iloc[-1]) if len(rs_series) > 0 else None

                stock_ret_60d  = stock_prices.pct_change(RS_WINDOW_60) * 100
                rs_60d_series  = (stock_ret_60d - spy_returns_60d).dropna()
                rs_60d_val     = float(rs_60d_series.iloc[-1]) if len(rs_60d_series) > 0 else None

                stock_ret_20d  = stock_prices.pct_change(RS_WINDOW_20) * 100
                rs_20d_series  = (stock_ret_20d - spy_returns_20d).dropna()
                rs_20d_val     = float(rs_20d_series.iloc[-1]) if len(rs_20d_series) > 0 else None

                # 가중 RS (단기 20% + 중기 30% + 장기 50%)
                rs_weighted    = calc_weighted_rs(rs_20d_val, rs_60d_val, rs_current)

                # RS 기울기 추적 (20일 MA → 10일 룩백)
                rs_ma20 = rs_series.rolling(20).mean().dropna()
                rs_slope_dir  = "flat"
                rs_slope_days = 0
                if len(rs_ma20) >= 11:
                    rs_slope_now = float(rs_ma20.iloc[-1] - rs_ma20.iloc[-11])
                    cur_rs_slope = 1 if rs_slope_now >= 0 else -1
                    rs_slope_dir = "up" if cur_rs_slope > 0 else "down"
                    for i in range(1, min(120, len(rs_ma20) - 10)):
                        past = float(rs_ma20.iloc[-i] - rs_ma20.iloc[-(i + 10)])
                        if (1 if past >= 0 else -1) == cur_rs_slope:
                            rs_slope_days += 1
                        else:
                            break

                # RS LINE vs SPY (정규화: 1년 전=100)
                common_spy = stock_prices.index.intersection(spy_prices.index)
                rs_spy_line = []
                if len(common_spy) >= 10:
                    ratio_spy = stock_prices.loc[common_spy] / spy_prices.loc[common_spy]
                    last252_spy = ratio_spy.iloc[-252:]
                    base_spy = float(last252_spy.iloc[0])
                    if base_spy != 0:
                        rs_spy_line = [
                            {"d": str(i.date()), "v": round(float(v / base_spy * 100), 3)}
                            for i, v in last252_spy.items()
                            if not np.isnan(float(v))
                        ]

                # RS LINE vs 섹터 ETF (정규화: 1년 전=100)
                rs_sector_line = []
                if sector["etf"] in prices.columns:
                    etf_p = prices[sector["etf"]].dropna()
                    common_etf = stock_prices.index.intersection(etf_p.index)
                    if len(common_etf) >= 10:
                        ratio_etf = stock_prices.loc[common_etf] / etf_p.loc[common_etf]
                        last252_etf = ratio_etf.iloc[-252:]
                        base_etf = float(last252_etf.iloc[0])
                        if base_etf != 0:
                            rs_sector_line = [
                                {"d": str(i.date()), "v": round(float(v / base_etf * 100), 3)}
                                for i, v in last252_etf.items()
                                if not np.isnan(float(v))
                            ]

                # 신고가/신저가 N일
                highs = {
                    "w52": get_high_days(stock_prices, 252),
                    "w26": get_high_days(stock_prices, 126),
                    "w13": get_high_days(stock_prices, 63),
                }
                lows = {
                    "w52": get_low_days(stock_prices, 252),
                    "w26": get_low_days(stock_prices, 126),
                    "w13": get_low_days(stock_prices, 63),
                }
                # 신고가 근접 % (0=신고가, 양수=아래 — 후보군 필터용)
                near_highs = {
                    "w52": get_near_high_pct(stock_prices, 252),
                    "w26": get_near_high_pct(stock_prices, 126),
                    "w13": get_near_high_pct(stock_prices, 63),
                }
                # 돌파 스트릭 시작일 (진짜 신선한 돌파 감지용)
                # 고공행진 종목은 큰 값 반환, 방금 첫 돌파한 종목은 작은 값 반환
                breakout_onsets = {
                    "w52": get_breakout_onset_days(stock_prices, 252),
                    "w26": get_breakout_onset_days(stock_prices, 126),
                    "w13": get_breakout_onset_days(stock_prices, 63),
                }

                # EPS
                eps_hist  = eps_dict.get(ticker)
                eps_trend = calc_eps_trend(eps_hist) if eps_hist else None
                eps_data  = {"history": eps_hist, "trend": eps_trend} if eps_hist else None

                # MA 기울기
                ma_slope, slope_dir, days_turn = calc_ma_slope_score(ma100_series)

                # RS 52w 0선 신선도 보너스
                # 최근 30일 내 0선 교차 여부 탐지 (+5점)
                rs_fresh_bull, rs_fresh_bear = 0.0, 0.0
                if len(rs_series) >= 2:
                    cur_sign = 1 if float(rs_series.iloc[-1]) >= 0 else -1
                    for i in range(1, min(31, len(rs_series))):
                        prev_val = float(rs_series.iloc[-(i + 1)])
                        if np.isnan(prev_val):
                            continue
                        prev_sign = 1 if prev_val >= 0 else -1
                        if prev_sign != cur_sign:
                            if cur_sign == 1:
                                rs_fresh_bull = 5.0   # 0선 상향 돌파 → 롱 보너스
                            else:
                                rs_fresh_bear = 5.0   # 0선 하향 돌파 → 숏 보너스
                            break

                # 방향별 강도 (다기간 가중 RS 사용)
                bull   = calc_bull_strength(
                    rs_weighted, ma_distance_pct, ma_slope, slope_dir,
                    sector_rs_excess, spy_ma_distance, spy_slope_dir
                ) + rs_fresh_bull
                bear   = calc_bear_strength(
                    rs_weighted, ma_distance_pct, ma_slope, slope_dir,
                    sector_rs_excess, spy_ma_distance, spy_slope_dir
                ) + rs_fresh_bear
                net    = round(bull - bear, 1)

                # 1차: 순강도 기반 분류
                raw_signal = classify_signal(bull, bear)
                # 2차: 2단계 게이트 (가격 위치·기울기·시장 레짐 조건)
                gated_signal = apply_signal_gate(raw_signal, ma_distance_pct, slope_dir, market_regime)
                # 3차: 모순 패널티 (갈등 쌍 수만큼 다운그레이드)
                conflicts = calc_conflicts(gated_signal, rs_weighted, ma_distance_pct, slope_dir,
                                           sector_rs_excess, market_regime)
                signal = downgrade_signal(gated_signal, conflicts)

                # 표시 점수: 롱계열→bull, 숏계열→bear
                display_score = (bull if signal in ("long", "long_watch")
                                 else bear if signal in ("short", "short_watch")
                                 else round(abs(net), 1))

                stage   = hint_stage(ma_distance_pct, slope_dir, days_turn)
                rs_ma_val = (float(rs_series.rolling(RS_MA_PERIOD).mean().iloc[-1])
                             if len(rs_series) >= RS_MA_PERIOD else None)

                sector_stocks.append({
                    "ticker":          ticker,
                    "score":           display_score,
                    "signal":          signal,
                    "stage":           stage,
                    "rs_spy_line":     rs_spy_line,
                    "rs_sector_line":  rs_sector_line,
                    "highs":           highs,
                    "lows":            lows,
                    "near_highs":      near_highs,
                    "breakout_onsets": breakout_onsets,
                    "eps":             eps_data,
                    "breakdown": {
                        "bull_strength":  bull,
                        "bear_strength":  bear,
                        "net_direction":  net,
                        "raw_signal":     raw_signal,
                        "gated_signal":   gated_signal,
                        "conflicts":      conflicts,
                        "ma_slope":       ma_slope,
                        "sector_rs_60d":  sector_rs_excess,
                        "rs_fresh_bull":  rs_fresh_bull,
                        "rs_fresh_bear":  rs_fresh_bear,
                    },
                    "data": {
                        "price":                 round(current_price, 2),
                        "ma100":                 round(ma100, 2),
                        "ma_distance_pct":       ma_distance_pct,
                        "ma150":                 round(ma150, 2) if ma150 is not None else None,
                        "ma150_distance_pct":    ma150_distance_pct,
                        "slope_dir":             slope_dir,
                        "days_since_slope_turn": days_turn,
                        "rs_excess_pct":         round(rs_current, 2)   if rs_current is not None else None,
                        "rs_60d_pct":            round(rs_60d_val, 2)   if rs_60d_val  is not None else None,
                        "rs_20d_pct":            round(rs_20d_val, 2)   if rs_20d_val  is not None else None,
                        "rs_weighted":           rs_weighted,
                        "rs_20d_ma":             round(rs_ma_val, 2)    if rs_ma_val   is not None else None,
                        "sector_rs_excess":      sector_rs_excess,
                        "rs_slope_dir":          rs_slope_dir,
                        "rs_slope_days":         rs_slope_days,
                    }
                })
                total_processed += 1

            except Exception as e:
                print(f"  ⚠️  {ticker}: {e}")
                continue

        # 종목: net_direction 내림차순 (강한 불리시 → 중립 → 강한 베어리시)
        sector_stocks.sort(key=lambda x: x["breakdown"]["net_direction"], reverse=True)

        result_sectors.append({
            "id":                sector["id"],
            "name":              sector["name"],
            "etf":               sector["etf"],
            "emoji":             sector["emoji"],
            "sector_rs_excess":      sector_rs_excess,
            "sector_rs_days":        sector_rs_days_dict.get(sector["etf"], 0),
            "sector_rs_slope_dir":   sector_rs_slope_dir_dict.get(sector["etf"], "flat"),
            "sector_rs_slope_days":  sector_rs_slope_days_dict.get(sector["etf"], 0),
            "sector_rs_history":     sector_rs_history_dict.get(sector["etf"], []),
            "stocks":                sector_stocks,
        })

    # 섹터: 섹터 RS 내림차순 (강한 섹터 위)
    result_sectors.sort(
        key=lambda s: (s["sector_rs_excess"] if s["sector_rs_excess"] is not None else -999),
        reverse=True
    )

    # ── JSON 저장 ──
    output = {
        "asOf":             today_str,
        "benchmark":        BENCHMARK,
        "ma_period":        MA_PERIOD,
        "rs_window_stock":  RS_WINDOW_STOCK,
        "rs_window_sector": RS_WINDOW_SECTOR,
        "total":            total_processed,
        "market_context":   market_context,
        "sector_rs":        sector_rs_dict,
        "sectors":          result_sectors,
    }

    os.makedirs("public/data", exist_ok=True)
    out_path = "public/data/watchlist.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    # ── EPS 캐시 저장 ──
    with open(eps_cache_path, "w", encoding="utf-8") as f:
        json.dump(eps_cache, f, ensure_ascii=False, indent=2)
    print(f"💾 EPS 캐시 저장: {len(eps_cache)}개 종목 → {eps_cache_path}")

    # ── 결과 요약 ──
    all_stocks = [
        {**s, "sector_name": sec["name"]}
        for sec in result_sectors for s in sec["stocks"]
    ]

    long_list        = sorted([s for s in all_stocks if s["signal"] == "long"],
                               key=lambda x: x["breakdown"]["bull_strength"], reverse=True)
    long_watch_list  = sorted([s for s in all_stocks if s["signal"] == "long_watch"],
                               key=lambda x: x["breakdown"]["bull_strength"], reverse=True)
    short_list       = sorted([s for s in all_stocks if s["signal"] == "short"],
                               key=lambda x: x["breakdown"]["bear_strength"], reverse=True)
    short_watch_list = sorted([s for s in all_stocks if s["signal"] == "short_watch"],
                               key=lambda x: x["breakdown"]["bear_strength"], reverse=True)

    def _row(s):
        b  = s["breakdown"]
        d  = s["data"]
        sr = f"{d['sector_rs_excess']:+.1f}%" if d["sector_rs_excess"] is not None else " N/A "
        ticker = s["ticker"] or "N/A"
        return (f"  {ticker:6s} "
                f"bull={b['bull_strength']:5.1f} bear={b['bear_strength']:5.1f} net={b['net_direction']:+5.1f}  "
                f"[{s['stage']:18s}]  "
                f"MA{d['ma_distance_pct']:+.1f}%  "
                f"RS{d['rs_excess_pct']:+.1f}%  "
                f"섹터{sr}  {s['sector_name']}")

    print(f"\n{'─'*65}")
    print(f"💾 {out_path}  |  총 {total_processed}개")
    print(f"   롱 {len(long_list)}개 | 롱관심 {len(long_watch_list)}개 | "
          f"숏 {len(short_list)}개 | 숏관심 {len(short_watch_list)}개")

    if long_list:
        print(f"\n🚀 롱 후보 (bull_strength 상위):")
        for s in long_list[:10]:
            print(_row(s))

    if long_watch_list:
        print(f"\n👀 롱 관심:")
        for s in long_watch_list[:8]:
            print(_row(s))

    if short_list:
        print(f"\n📉 숏 후보 (bear_strength 상위):")
        for s in short_list[:5]:
            print(_row(s))

    if short_watch_list:
        print(f"\n⚠️  숏 관심:")
        for s in short_watch_list[:5]:
            print(_row(s))

    print(f"{'='*65}\n")


if __name__ == "__main__":
    main()
