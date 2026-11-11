"""미국 거래·결제 달력 + Seibro 날짜 → 미국 거래일 변환 (표준 라이브러리만 사용)

Seibro '해외주식 결제 상위 50종목' 의 날짜 D 는 미국 결제일 S 의 다음 평일이다.
2026-11-11 Seibro 직접 조회 + 2024-10 이후 전체 데이터로 확인한 규칙:
  - 미국 거래일 T 의 결제일 S = T 다음 '결제일' (T+1, 2024-05-28 부터)
  - D = S 다음 평일. 한국 공휴일에도 데이터가 있다 (예: 2026-10-09 50종목)
  - S 가 미국 결제 휴일이면 다음 평일 D 는 Seibro '데이터 없음' (예: 2025-11-12, 2025-04-21, 2026-07-06)
    (예전에 받은 파일 중엔 이런 날에 몇 종목·거의 0 인 값이 남은 경우가 있음 → 버린다)
  - 결제 휴일 = 뉴욕증시 휴장일(성금요일 포함, 토요일 휴일은 금요일·일요일은 월요일)
                + 콜럼버스·재향군인의 날(채권시장 휴장, 주식은 거래)
    → 콜럼버스·재향군인의 날 거래분은 그 전 거래일분과 같은 날 결제 → Seibro 한 날짜에 이틀치
  - 증시만 쉰 특별 휴장(2025-01-09 카터 장례)은 결제는 됨 → 그 다음 결제일엔 거래분이 없음
  - 오늘 날짜는 조회 불가 (Seibro: 당일 기준 1일 전(주말 제외)까지)

예) 2026-11-10(화) 파일 → 결제 11-09(월) → 거래 11-06(금)
"""
from __future__ import annotations

from datetime import date, timedelta
from functools import lru_cache

# 증시만 쉬고 결제는 된 특별 휴장일
NYSE_SPECIAL_CLOSED = {date(2025, 1, 9)}


def _nth_weekday(y, m, wd, n):
    """n 번째 요일 (n=-1 이면 마지막)"""
    if n > 0:
        d = date(y, m, 1)
        d += timedelta(days=(wd - d.weekday()) % 7)
        return d + timedelta(weeks=n - 1)
    d = date(y, m + 1, 1) - timedelta(days=1) if m < 12 else date(y, 12, 31)
    return d - timedelta(days=(d.weekday() - wd) % 7)


def _easter(y):
    a, b, c = y % 19, y // 100, y % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mo = (h + l - 7 * m + 114) // 31
    return date(y, mo, (h + l - 7 * m + 114) % 31 + 1)


def _observed(d):
    """토요일 → 금요일, 일요일 → 월요일"""
    if d.weekday() == 5:
        return d - timedelta(days=1)
    if d.weekday() == 6:
        return d + timedelta(days=1)
    return d


@lru_cache(maxsize=None)
def nyse_holidays(y: int) -> frozenset:
    """뉴욕증시 정규 휴장일 (특별 휴장 제외)"""
    h = {
        _nth_weekday(y, 1, 0, 3),                # 마틴 루터 킹
        _nth_weekday(y, 2, 0, 3),                # 대통령의 날
        _easter(y) - timedelta(days=2),          # 성금요일
        _nth_weekday(y, 5, 0, -1),               # 메모리얼 데이
        _observed(date(y, 7, 4)),                # 독립기념일
        _nth_weekday(y, 9, 0, 1),                # 노동절
        _nth_weekday(y, 11, 3, 4),               # 추수감사절
        _observed(date(y, 12, 25)),              # 크리스마스
    }
    nd = date(y, 1, 1)                           # 신정: 토요일이면 전날(12/31) 쉬지 않음
    if nd.weekday() == 6:
        h.add(nd + timedelta(days=1))
    elif nd.weekday() < 5:
        h.add(nd)
    if y >= 2022:
        h.add(_observed(date(y, 6, 19)))         # 준틴스
    return frozenset(h)


@lru_cache(maxsize=None)
def settlement_holidays(y: int) -> frozenset:
    """미국 주식 결제가 없는 평일 = 증시 휴장일 + 콜럼버스·재향군인의 날"""
    h = set(nyse_holidays(y))
    h.add(_nth_weekday(y, 10, 0, 2))             # 콜럼버스 데이
    v = date(y, 11, 11)                          # 재향군인의 날: 일요일 → 월요일, 토요일은 대체 없음
    if v.weekday() == 6:
        h.add(v + timedelta(days=1))
    elif v.weekday() < 5:
        h.add(v)
    return frozenset(h)


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d not in nyse_holidays(d.year) and d not in NYSE_SPECIAL_CLOSED


def is_settlement_day(d: date) -> bool:
    return d.weekday() < 5 and d not in settlement_holidays(d.year)


def settle_date(t: date) -> date:
    """거래일 t 의 결제일 (T+1 결제일)"""
    d = t + timedelta(days=1)
    while not is_settlement_day(d):
        d += timedelta(days=1)
    return d


def _next_weekday(d: date) -> date:
    d += timedelta(days=1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def seibro_date(t: date) -> date:
    """미국 거래일 t 의 매매가 실리는 Seibro 날짜"""
    return _next_weekday(settle_date(t))


def trade_dates(d: date) -> list[date]:
    """Seibro 날짜 d 에 실린 미국 거래일들 (보통 1개, 콜럼버스·재향군인의 날 뒤엔 2개, 결제 없는 날은 [])"""
    out = []
    t = d - timedelta(days=1)
    for _ in range(12):
        if is_trading_day(t) and seibro_date(t) == d:
            out.append(t)
        t -= timedelta(days=1)
    return sorted(out)


def trade_date(d: date) -> date | None:
    """Seibro 날짜 d → 표시할 미국 거래일 (여러 날이 합쳐졌으면 마지막 날). 결제 없는 날이면 None"""
    ts = trade_dates(d)
    return ts[-1] if ts else None


def has_seibro_data(d: date) -> bool:
    """Seibro 에 그 날짜 데이터가 생기는지 (평일 + 그날 실린 거래일이 있음)"""
    return d.weekday() < 5 and bool(trade_dates(d))


def to_trade_dates(dates):
    """pandas 날짜 Series/Index → 거래일 Timestamp (결제 없는 날은 NaT)"""
    import pandas as pd
    m = {}
    out = []
    for x in pd.to_datetime(dates):
        k = x.date()
        if k not in m:
            t = trade_date(k)
            m[k] = pd.Timestamp(t) if t else pd.NaT
        out.append(m[k])
    return pd.DatetimeIndex(out) if isinstance(dates, pd.Index) else pd.Series(out, index=getattr(dates, "index", None))
