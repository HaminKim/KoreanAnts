"""
ticker_map.json 의 티커들 중 public/logos/{TICKER}.png 가 없는 것들의
로고를 자동 다운로드한다.  (소스 우선순위: Parqet CDN → Financial Modeling Prep)

- 파일명은 티커로 저장한다. 프론트(Top10Grid 등)가 `/logos/{TICKER}.png` 를
  1순위로 조회하므로 가장 안정적이고, 회사명 표기가 여러 개여도 파일 하나로 커버된다.
- 정상 티커 형식(AAPL, BRK-B ...)만 시도한다.
- 응답이 진짜 PNG 인지(매직바이트) 확인해 HTML 오류페이지를 저장하지 않는다.
- 한 번 실패한 티커는 logo_skip.json 에 기록하고 COOLDOWN_DAYS 동안 재시도하지 않는다
  → 로고가 원래 없는 종목을 매일 수백 번 조회하는 낭비 방지.
- 이 단계는 '데이터 보강'이므로 실패해도 exit 0 으로 끝낸다.
"""
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)

import json
import os
import re
import time
from datetime import date, datetime

import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MAP_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'ticker_map.json')
SKIP_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'logo_skip.json')
LOGOS_DIR = os.path.join(BASE_DIR, '..', 'public', 'logos')

MIN_BYTES = 350                       # 이보다 작으면 placeholder 로 간주
PNG_MAGIC = b'\x89PNG\r\n\x1a\n'
MAX_DOWNLOADS_PER_RUN = 60            # 첫 실행에서 시간 예산을 넘기지 않도록
COOLDOWN_DAYS = 21                    # 실패한 티커 재시도까지의 간격
TIMEOUT = (4, 8)                      # (connect, read) 초

TICKER_RE = re.compile(r'^[A-Z]{1,6}(-[A-Z])?$')
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

SOURCES = [
    ("parqet", lambda t: f"https://assets.parqet.com/logos/symbol/{t}?format=png"),
    ("fmp", lambda t: f"https://financialmodelingprep.com/image-stock/{t}.png"),
]


def safe_filename(raw_name: str) -> str:
    """프론트의 회사명-키 로고 파일명 규칙 (기존 로고 존재 여부 확인용)."""
    return re.sub(r'[/\\:*?"<>|]', '_', raw_name)


def load_skip() -> dict:
    if os.path.exists(SKIP_FILE):
        try:
            with open(SKIP_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def in_cooldown(last_iso: str) -> bool:
    try:
        return (date.today() - datetime.fromisoformat(last_iso).date()).days < COOLDOWN_DAYS
    except Exception:
        return False


def download_png(url: str, path: str) -> bool:
    try:
        r = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
    except Exception:
        return False
    if r.status_code != 200:
        return False
    body = r.content
    if len(body) < MIN_BYTES or not body.startswith(PNG_MAGIC):
        return False
    with open(path, 'wb') as f:
        f.write(body)
    return True


def fetch_logo(ticker: str) -> str | None:
    save_path = os.path.join(LOGOS_DIR, ticker + ".png")
    for label, url_fn in SOURCES:
        if download_png(url_fn(ticker), save_path):
            return label
    return None


def logo_exists(ticker: str) -> bool:
    return os.path.exists(os.path.join(LOGOS_DIR, ticker + ".png"))


def main():
    os.makedirs(LOGOS_DIR, exist_ok=True)

    if not os.path.exists(MAP_FILE):
        print("⚠️ ticker_map.json 없음 → 종료")
        return

    with open(MAP_FILE, 'r', encoding='utf-8') as f:
        ticker_map = json.load(f)

    skip = load_skip()

    # 티커 → 그 티커로 매핑된 회사명들 (기존 회사명-키 로고 확인용)
    names_by_ticker: dict = {}
    for raw, t in ticker_map.items():
        if t and TICKER_RE.match(t):
            names_by_ticker.setdefault(t, []).append(raw)

    def has_any_logo(ticker: str) -> bool:
        if logo_exists(ticker):
            return True
        return any(
            os.path.exists(os.path.join(LOGOS_DIR, safe_filename(n) + ".png"))
            for n in names_by_ticker.get(ticker, [])
        )

    todo, skipped_cool = [], 0
    for t in sorted(names_by_ticker):
        if has_any_logo(t):
            continue
        if t in skip and in_cooldown(skip[t]):
            skipped_cool += 1
            continue
        todo.append(t)

    if not todo:
        print(f"✅ 받을 로고 없음 (티커 {len(names_by_ticker)}개 · 쿨다운 {skipped_cool}개 건너뜀)")
        return

    capped = todo[:MAX_DOWNLOADS_PER_RUN]
    print(f"🖼️  로고 없는 티커 {len(todo)}개"
          + (f" → 이번 실행 {len(capped)}개만" if len(capped) < len(todo) else "")
          + f" (쿨다운 {skipped_cool}개 건너뜀)")

    today = date.today().isoformat()
    ok = fail = 0
    for i, ticker in enumerate(capped, 1):
        source = fetch_logo(ticker)
        if source:
            ok += 1
            skip.pop(ticker, None)
            print(f"[{i}/{len(capped)}] ✅ {ticker:<8} ← {source}")
        else:
            fail += 1
            skip[ticker] = today
            print(f"[{i}/{len(capped)}] ❌ {ticker:<8} 실패 → {COOLDOWN_DAYS}일 쿨다운")
        time.sleep(0.1)

    # 이미 로고가 생긴 티커의 쿨다운 기록은 정리 (파일 무한 증식 방지)
    skip = {t: d for t, d in skip.items() if not has_any_logo(t)}
    tmp = SKIP_FILE + ".tmp"
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(skip, f, indent=2, ensure_ascii=False, sort_keys=True)
    os.replace(tmp, SKIP_FILE)

    remain = len(todo) - len(capped)
    print(f"\n🎉 완료: {ok}개 성공, {fail}개 실패"
          + (f", {remain}개는 다음 실행에서" if remain else ""))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ 예기치 못한 오류(무시하고 계속): {e}")
