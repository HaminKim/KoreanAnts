"""FRED_API_KEY 동작 확인 — 키 값은 절대 출력하지 않는다. 결과는 GitHub Actions 주석(::notice/::error)으로 남김."""
import os
import sys

import requests

key = os.environ.get("FRED_API_KEY", "").strip()
if not key:
    print("::error::FRED_API_KEY 시크릿이 비어 있음 (Settings → Secrets and variables → Actions 확인)")
    sys.exit(1)

try:
    r = requests.get(
        "https://api.stlouisfed.org/fred/series",
        params={"series_id": "GDPC1", "api_key": key, "file_type": "json"},
        timeout=30,
    )
except Exception as e:  # noqa: BLE001
    print(f"::error::FRED API 접속 실패 ({type(e).__name__})")
    sys.exit(1)

if r.status_code == 200 and r.json().get("seriess"):
    s = r.json()["seriess"][0]
    print(f"::notice::FRED API 정상 — 키 길이 {len(key)}자, GDPC1 last_updated={s.get('last_updated')}")
else:
    msg = ""
    try:
        msg = r.json().get("error_message", "")[:120]
    except Exception:  # noqa: BLE001
        pass
    print(f"::error::FRED API 거부 HTTP {r.status_code} — {msg}")
    sys.exit(1)
