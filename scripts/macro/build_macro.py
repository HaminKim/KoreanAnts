"""
매크로 데이터 빌더

  python scripts/macro/build_macro.py            # 전체
  python scripts/macro/build_macro.py CPIAUCSL   # 특정 시리즈만 다시 받기 (catalog 는 항상 재생성)

산출물
  processed/macro/raw/{KEY}.csv          원천 RAW (원본 주기 그대로, 덮어쓰기 = 최신 빈티지)
  public/data/macro/series/{KEY}.json    1970~ 월/분기 단위 + 변환값 (화면용)
  public/data/macro/catalog.json         카테고리·지표·설명·최신값·미니차트
  public/data/market/landing.json        랜딩용 S&P500 / Nasdaq-100 일별 종가 (최근 5년)

FRED_API_KEY 환경변수가 있으면 공식 API 를, 없으면 fredgraph CSV 를 사용한다.
어떤 시리즈를 받다 실패하면 그 시리즈의 기존 JSON 을 그대로 둔다 (빈 화면 방지).
"""
import io
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from registry import CATEGORIES, INDICATORS, RELATIONS, S as SERIES  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = ROOT / "processed" / "macro" / "raw"
OUT_DIR = ROOT / "public" / "data" / "macro"
SERIES_DIR = OUT_DIR / "series"
LANDING = ROOT / "public" / "data" / "market" / "landing.json"

START = "1970-01-01"          # 화면용 출력 시작 (변환 계산은 그 이전 데이터까지 사용)
LANDING_YEARS = 5
SPARK_YEARS = 10
FRED_KEY = os.environ.get("FRED_API_KEY", "").strip()
UA = {"User-Agent": "Mozilla/5.0 (REANT macro builder; +https://www.reant.kr)"}

TF_LABEL = {
    "level": "원본", "yoy": "YoY %", "mom": "MoM %", "qoq": "QoQ %", "qoq_saar": "QoQ 연율 %",
    "chg": "전기 대비 변화", "chg_3ma": "변화 3개월 평균", "avg_3m": "3개월 평균",
}


def log(*a):
    print(*a, flush=True)


def get(url, **kw):
    last = None
    for attempt in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=60, **kw)
            r.raise_for_status()
            return r
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(2 * (attempt + 1))
    raise last


# ─────────────────────────────────────────────────────────────
# 원천별 다운로드 → pd.Series(index=DatetimeIndex, float)
# ─────────────────────────────────────────────────────────────
def _fred_api(sid):
    base = "https://api.stlouisfed.org/fred"
    obs = get(f"{base}/series/observations",
              params={"series_id": sid, "api_key": FRED_KEY, "file_type": "json"}).json()["observations"]
    s = pd.Series({o["date"]: o["value"] for o in obs})
    meta = {}
    info = get(f"{base}/series", params={"series_id": sid, "api_key": FRED_KEY, "file_type": "json"}).json()
    if info.get("seriess"):
        meta["updated"] = info["seriess"][0].get("last_updated")
    return s, meta


def _fred_csv(sid):
    txt = get("https://fred.stlouisfed.org/graph/fredgraph.csv", params={"id": sid}).text
    df = pd.read_csv(io.StringIO(txt))
    return pd.Series(df.iloc[:, 1].values, index=df.iloc[:, 0].values), {}


def fetch_fred(sid):
    # API 키가 있으면 공식 API(원천 갱신일 포함), 실패하면(키 오류·일시 장애) CSV 로 폴백
    if FRED_KEY:
        try:
            s, meta = _fred_api(sid)
        except Exception as e:  # noqa: BLE001
            log(f"  ⚠️ {sid}: FRED API 실패 → CSV 폴백 ({type(e).__name__})")
            s, meta = _fred_csv(sid)
    else:
        s, meta = _fred_csv(sid)
    s.index = pd.to_datetime(s.index)
    s = pd.to_numeric(s.replace(".", None), errors="coerce").dropna()
    return s.sort_index(), meta


SHILLER_PAGE = "https://shillerdata.com/"
SHILLER_FALLBACK = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"


def fetch_shiller(_sid):
    import re
    import xlrd  # requirements: xlrd

    url = SHILLER_FALLBACK
    try:
        html = get(SHILLER_PAGE).text
        m = re.search(r'//img1\.wsimg\.com/blobby/go/[^"\']+/ie_data\.xls[^"\']*', html)
        if m:
            url = "https:" + m.group(0)
    except Exception as e:  # noqa: BLE001
        log(f"  ⚠️ shillerdata.com 페이지 실패 → Yale 구버전 사용 ({e})")
    book = xlrd.open_workbook(file_contents=get(url).content)
    sh = book.sheet_by_name("Data")
    out = {}
    for i in range(8, sh.nrows):
        d, cape = sh.cell_value(i, 0), sh.cell_value(i, 12)
        if not isinstance(d, float) or not isinstance(cape, float):
            continue
        y = int(d)
        m = int(round((d - y) * 100))
        if 1 <= m <= 12:
            out[pd.Timestamp(year=y, month=m, day=1)] = cape
    return pd.Series(out).sort_index(), {"url": url}


def fetch_yahoo(sid):
    import yfinance as yf

    h = yf.Ticker(sid).history(start="1968-01-01", auto_adjust=False)
    s = h["Close"].dropna()
    s.index = pd.to_datetime(s.index.date)
    return s.sort_index(), {}


FETCH = {"fred": fetch_fred, "shiller": fetch_shiller, "yahoo": fetch_yahoo}


def source_url(sp):
    if sp["src"] == "fred":
        return f"https://fred.stlouisfed.org/series/{sp['srcId']}"
    if sp["src"] == "shiller":
        return "https://shillerdata.com/"
    return f"https://finance.yahoo.com/quote/{sp['srcId']}"


# ─────────────────────────────────────────────────────────────
# 월/분기 변환 + 파생값
# ─────────────────────────────────────────────────────────────
def to_period(raw, sp):
    """D/W → 월(avg|last). M/Q 는 그대로. 반환: (series, obs_freq, partial_last)"""
    if sp["freq"] in ("M", "Q"):
        s = raw.copy()
        s.index = s.index.to_period("M" if sp["freq"] == "M" else "Q").to_timestamp()
        return s[~s.index.duplicated(keep="last")], sp["freq"], False
    g = raw.groupby(raw.index.to_period("M"))
    s = g.mean() if sp["agg"] == "avg" else g.last()
    s.index = s.index.to_timestamp()
    # 마지막 관측이 그 달 마지막 영업일(주간이면 마지막 주)에 못 미치면 마지막 월값은 '부분'
    last_native = raw.index[-1].normalize()
    gap = ((last_native + pd.offsets.BMonthEnd(0)) - last_native).days
    partial = gap > (6 if sp["freq"] == "W" else 0)
    return s, "M", bool(partial)


def derive(s, obs_freq, tf):
    per_year = 12 if obs_freq == "M" else 4
    # 시간 기준 시프트 (결측 구간이 있어도 '같은 달/분기'끼리 비교)
    def lag(n):
        off = pd.DateOffset(months=n * (1 if obs_freq == "M" else 3))
        shifted = s.copy()
        shifted.index = shifted.index + off
        return shifted.reindex(s.index)

    if tf == "level":
        return s
    if tf == "yoy":
        return (s / lag(per_year) - 1) * 100
    if tf in ("mom", "qoq"):
        return (s / lag(1) - 1) * 100
    if tf == "qoq_saar":
        return ((s / lag(1)) ** per_year - 1) * 100
    if tf == "chg":
        return s - lag(1)
    if tf == "chg_3ma":
        return (s - lag(1)).rolling(3).mean()
    if tf == "avg_3m":
        return s.rolling(3).mean()
    raise ValueError(tf)


def rnd(x, nd):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), nd)


def build_series(key):
    sp = SERIES[key]
    raw, meta = FETCH[sp["src"]](sp["srcId"])
    if len(raw) < 10:
        raise RuntimeError(f"데이터가 너무 적음 ({len(raw)}행)")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw.rename("value").to_csv(RAW_DIR / f"{key}.csv", index_label="date")

    per, obs_freq, partial = to_period(raw, sp)
    frame = {tf: derive(per, obs_freq, tf) for tf in sp["tf"]}
    df = pd.DataFrame(frame)
    df = df[df.index >= START]
    df = df.dropna(how="all")

    nd_level = max(sp["dec"] + 2, 2) if per.abs().max() < 1e5 else 1
    out = {
        "key": key, "label": sp["label"], "units": sp["units"],
        "freq": sp["freq"], "obsFreq": obs_freq, "agg": sp["agg"],
        "src": sp["src"], "srcId": sp["srcId"], "url": meta.get("url") or source_url(sp),
        "note": sp["note"], "dec": sp["dec"], "tf": sp["tf"],
        "rawFirst": raw.index[0].strftime("%Y-%m-%d"),
        "rawLast": raw.index[-1].strftime("%Y-%m-%d"),
        "partialLast": partial,
        "updated": meta.get("updated"),
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "d": [d.strftime("%Y-%m-%d") for d in df.index],
    }
    for tf in sp["tf"]:
        nd = nd_level if tf in ("level", "chg", "chg_3ma", "avg_3m") else 3
        out[tf] = [rnd(v, nd) for v in df[tf].tolist()]

    SERIES_DIR.mkdir(parents=True, exist_ok=True)
    (SERIES_DIR / f"{key}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    if key in ("SPX", "NDX"):
        return raw  # 랜딩용 일별 원본
    return None


# ─────────────────────────────────────────────────────────────
# catalog.json
# ─────────────────────────────────────────────────────────────
def last_two(d, v):
    pts = [(dd, vv) for dd, vv in zip(d, v) if vv is not None]
    if not pts:
        return None, None, None
    cur = pts[-1]
    prev = pts[-2] if len(pts) > 1 else (None, None)
    return cur[0], cur[1], prev[1]


def series_summary(key):
    p = SERIES_DIR / f"{key}.json"
    if not p.exists():
        return None
    js = json.loads(p.read_text(encoding="utf-8"))
    tf0 = js["tf"][0]
    date, val, prev = last_two(js["d"], js[tf0])
    cutoff = (pd.Timestamp.today() - pd.DateOffset(years=SPARK_YEARS)).strftime("%Y-%m-%d")
    spark = [[d, v] for d, v in zip(js["d"], js[tf0]) if d >= cutoff and v is not None]
    if len(spark) > 130:  # 월 단위 10년 ≈ 120점
        step = math.ceil(len(spark) / 120)
        spark = spark[::step] + ([spark[-1]] if spark[-1] != spark[::step][-1] else [])
    return {
        "key": key, "label": js["label"], "units": js["units"], "freq": js["freq"], "obsFreq": js["obsFreq"],
        "agg": js["agg"], "tf": js["tf"], "dec": js["dec"], "note": js["note"], "url": js["url"],
        "first": js["d"][0] if js["d"] else None, "rawLast": js["rawLast"], "partialLast": js["partialLast"],
        "updated": js["updated"], "fetchedAt": js["fetchedAt"],
        "latest": {"tf": tf0, "date": date, "value": val, "prev": prev},
        "spark": spark,
    }


def build_catalog():
    by_id = {i["id"]: i for i in INDICATORS}
    used = []
    for ind in INDICATORS:
        used += ind["main"] + ind["subs"]
    summaries = {k: series_summary(k) for k in dict.fromkeys(used)}

    inds = []
    for ind in INDICATORS:
        status = ind.get("status", "live")
        if status == "live" and not all(summaries.get(k) for k in ind["main"]):
            status = "error"
        rel = []
        for a, t, b in RELATIONS:
            if a == ind["id"] and b in by_id:
                rel.append({"dir": "out", "type": t, "id": b})
            elif b == ind["id"] and a in by_id:
                rel.append({"dir": "in", "type": t, "id": a})
        inds.append({
            "no": ind["no"], "id": ind["id"], "cat": ind["cat"], "name": ind["name"], "ko": ind["ko"],
            "pri": ind["pri"], "status": status, "main": ind["main"], "subs": ind["subs"],
            "what": ind["what"], "read": ind["read"], "caution": ind.get("caution"),
            "relations": rel,
        })

    catalog = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "start": START,
        "tfLabel": TF_LABEL,
        "categories": CATEGORIES,
        "indicators": inds,
        "series": {k: v for k, v in summaries.items() if v},
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return catalog


# ─────────────────────────────────────────────────────────────
# landing.json
# ─────────────────────────────────────────────────────────────
def build_landing(daily):
    cutoff = pd.Timestamp.today() - pd.DateOffset(years=LANDING_YEARS)
    out = {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "index": {}}
    for key, label in (("SPX", "S&P 500"), ("NDX", "Nasdaq-100")):
        s = daily.get(key)
        if s is None:
            continue
        s = s[s.index >= cutoff]
        out["index"][key] = {
            "label": label,
            "d": [d.strftime("%Y-%m-%d") for d in s.index],
            "v": [round(float(v), 2) for v in s.values],
        }
    if not out["index"]:
        return
    if LANDING.exists():  # 일부만 받았으면 나머지는 기존 값 유지
        try:
            prev = json.loads(LANDING.read_text(encoding="utf-8"))
            for k, v in prev.get("index", {}).items():
                out["index"].setdefault(k, v)
        except Exception:  # noqa: BLE001
            pass
    LANDING.parent.mkdir(parents=True, exist_ok=True)
    LANDING.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    only = set(sys.argv[1:])
    keys = [k for k in SERIES if not only or k in only]
    daily, failed = {}, []
    for k in keys:
        try:
            r = build_series(k)
            if r is not None:
                daily[k] = r
            log(f"  ✅ {k}")
        except Exception as e:  # noqa: BLE001
            failed.append(k)
            log(f"  ✗ {k}: {e} — 기존 파일 유지")
    build_landing(daily)
    cat = build_catalog()
    live = sum(1 for i in cat["indicators"] if i["status"] == "live")
    log(f"\n요약: 시리즈 {len(keys) - len(failed)}/{len(keys)} 성공, 지표 live {live}/{len(cat['indicators'])}")
    if failed:
        log("실패: " + ", ".join(failed))
        # 실패가 과반이면 원천/네트워크 문제로 보고 빨간불
        if len(failed) > len(keys) / 2:
            sys.exit(1)


if __name__ == "__main__":
    main()
