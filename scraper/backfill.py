"""
누락된 날짜 데이터를 Seibro에서 일괄 다운로드합니다.
"""
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import subprocess
from datetime import date, timedelta
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA_DIR = BASE / "data"

# 백필할 날짜 범위
START = date(2026, 7, 21)
END   = date(2026, 8, 4)

# 이미 있는 파일 확인
existing = {f.stem.replace("re", "") for f in DATA_DIR.glob("re*.xls")}

# 영업일만 (토/일 제외)
targets = []
d = START
while d <= END:
    if d.weekday() < 5:  # 월~금
        ymd = d.strftime("%Y%m%d")
        if ymd not in existing:
            targets.append(ymd)
    d += timedelta(days=1)

print(f"다운로드 대상: {len(targets)}개 날짜")
print(targets)
print()

ok, fail = [], []
for ymd in targets:
    print(f">>> {ymd} 다운로드 중...")
    result = subprocess.run(
        [sys.executable, str(BASE / "downloader.py"), ymd],
        capture_output=True, text=True, encoding='utf-8', errors='replace'
    )
    print(result.stdout.strip())
    if result.returncode == 0:
        ok.append(ymd)
        print(f"  ✅ 성공")
    else:
        fail.append(ymd)
        print(f"  ❌ 실패 (휴장일 또는 미게시)")
    print()

print(f"완료: 성공 {len(ok)}개, 실패 {len(fail)}개")
if fail:
    print(f"실패 날짜: {fail}")
