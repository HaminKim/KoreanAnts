"""
processed/all_data_clean.csv 에 아직 없는 'Seibro 데이터가 있는 날'을 찾아서
YYYYMMDD 형식으로 오래된 날짜부터 한 줄씩 출력한다.

사용:
    python find_missing_days.py [LOOKBACK_DAYS] [MAX_OUTPUT]

    LOOKBACK_DAYS : 오늘로부터 며칠 전까지 볼지 (기본 12)
    MAX_OUTPUT    : 최대 몇 개까지 출력할지 (기본 8) — 스케줄 실행이 과도하게 길어지지 않게 상한

이 스크립트는 stdout 에 날짜만 출력한다. 진단 메시지는 stderr 로.
"""
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

BASE = Path(__file__).resolve().parent
CSV = BASE / "processed" / "all_data_clean.csv"

# 받을 날짜 판단은 scripts/us_calendar.py (Seibro 실측 규칙) 를 따른다:
#   - 한국 공휴일에도 Seibro 데이터가 있음 → 건너뛰지 않음 (예전엔 건너뛰어 2026-09-24·09-25·10-05·10-09 가 빠졌음, 2026-11-11 보충)
#   - 미국 결제 휴일 다음 평일은 Seibro '데이터 없음' → 받지 않음 (예: 재향군인의 날 다음 날)
sys.path.insert(0, str(BASE.parent / "scripts"))
from us_calendar import has_seibro_data  # noqa: E402


def log(*a):
    print(*a, file=sys.stderr)


def main():
    lookback = int(sys.argv[1]) if len(sys.argv) >= 2 and sys.argv[1] else 12
    max_out = int(sys.argv[2]) if len(sys.argv) >= 3 and sys.argv[2] else 8

    # 이보다 오래된 '빠진/부분' 날짜는 Seibro 가 끝내 제대로 안 올린 것으로 보고
    # 더는 자동 재시도하지 않는다(스케줄 빨간불 방지). 정말 필요하면 ymd= 수동 지정.
    GIVEUP_DAYS = 25

    # Seibro 해외주식 보고서는 상위 ~50종목. 이보다 훨씬 적으면
    # 렌더링이 덜 된 상태에서 긁힌 '부분 스크랩'으로 보고 다시 받는다.
    MIN_ROWS = 10

    if not CSV.exists():
        log(f"⚠️ {CSV} 없음 — 최근 {lookback}일 전부 후보로 출력")
        counts = {}
    else:
        df = pd.read_csv(CSV, dtype=str, encoding="utf-8-sig")
        col = "날짜" if "날짜" in df.columns else df.columns[0]
        dates = pd.to_datetime(df[col], errors="coerce").dt.date.dropna()
        counts = dates.value_counts().to_dict()

    today = date.today()

    missing = []
    for i in range(lookback, 0, -1):
        d = today - timedelta(days=i)
        if not has_seibro_data(d):      # 토/일, 미국 결제 없던 날 다음 날
            continue
        n = counts.get(d, 0)
        if n >= MIN_ROWS:
            continue
        if i > GIVEUP_DAYS:
            log(f"  ⏭️ {d}: {n}행 — {GIVEUP_DAYS}일 초과라 자동 재시도 제외")
            continue
        if 0 < n < MIN_ROWS:
            log(f"  ⚠️ {d}: {n}행뿐 — 부분 스크랩으로 보고 재수집")
        missing.append(d)

    missing = missing[:max_out]

    if not missing:
        log("✅ 누락 영업일 없음")
        return

    log(f"🔎 누락 영업일 {len(missing)}개: {[str(d) for d in missing]}")
    for d in missing:
        print(d.strftime("%Y%m%d"))


if __name__ == "__main__":
    main()
