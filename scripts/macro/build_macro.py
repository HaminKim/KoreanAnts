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
from zoneinfo import ZoneInfo

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from registry import CATEGORIES, EVENTS, INDICATORS, RELATIONS, S as SERIES  # noqa: E402
from explain import EXPLAIN, SERIES_EXPLAIN  # noqa: E402

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


_SHILLER_BOOK = None


def _shiller_sheet():
    """ie_data.xls 를 한 번만 받아 재사용 (CAPE·P/E 공용)"""
    global _SHILLER_BOOK
    import re
    import xlrd  # requirements: xlrd

    if _SHILLER_BOOK is None:
        url = SHILLER_FALLBACK
        try:
            html = get(SHILLER_PAGE).text
            m = re.search(r"//img1\.wsimg\.com/blobby/go/[^\"']+/ie_data\.xls[^\"']*", html)
            if m:
                url = "https:" + m.group(0)
        except Exception as e:  # noqa: BLE001
            log(f"  ⚠️ shillerdata.com 페이지 실패 → Yale 구버전 사용 ({e})")
        book = xlrd.open_workbook(file_contents=get(url).content)
        _SHILLER_BOOK = (book.sheet_by_name("Data"), url)
    return _SHILLER_BOOK


def fetch_shiller(sid):
    """sid: CAPE (P/E10, 12열) | PE_TTM (가격 P 1열 ÷ 최근 12개월 이익 E 3열)"""
    sh, url = _shiller_sheet()
    out = {}
    for i in range(8, sh.nrows):
        d = sh.cell_value(i, 0)
        if not isinstance(d, float):
            continue
        if sid == "CAPE":
            v = sh.cell_value(i, 12)
        else:
            p, e = sh.cell_value(i, 1), sh.cell_value(i, 3)
            v = p / e if isinstance(p, float) and isinstance(e, float) and e > 0 else None
        if not isinstance(v, float):
            continue
        y = int(d)
        m = int(round((d - y) * 100))   # 2026.1 = 10월, 2026.01 = 1월
        if 1 <= m <= 12:
            out[pd.Timestamp(year=y, month=m, day=1)] = v
    return pd.Series(out).sort_index(), {"url": url}


def fetch_yahoo(sid):
    import yfinance as yf

    h = yf.Ticker(sid).history(start="1968-01-01", auto_adjust=False)
    s = h["Close"].dropna()
    s.index = pd.to_datetime(s.index.date)
    return s.sort_index(), {}


def _monthly_fred(sid):
    """월별 FRED. 'ID:bey' 면 할인율 기준 T-bill 금리를 채권환산수익률(BEY)로 변환
    (TB3MS 는 할인율 기준이라 현행 3개월 CMT 금리와 고금리기에 0.5%p 이상 차이남)"""
    base, _, opt = sid.partition(":")
    s, _ = fetch_fred(base)
    s.index = s.index.to_period("M").to_timestamp()
    s = s.groupby(level=0).mean()
    if opt == "bey":
        d = s / 100
        s = 365 * d / (360 - 91 * d) * 100
    return s


def fetch_derived(sid):
    """계산 시리즈. REAL10Y_EST = 월평균 10년물(GS10) − CPI YoY
                   HHDEBT_DPI  = 가계부채(CMDEBT, 백만 $) ÷ 명목 가처분소득(DPI, 십억 $ 연율) × 100"""
    # 공개일(updated)은 새 값이 생기는 시점을 정하는 원천(DERIVED_RELEASE)을 따름
    if sid == "HHDEBT_DPI":
        debt, meta = fetch_fred("CMDEBT")
        dpi, _ = fetch_fred("DPI")
        return (debt / 1000 / dpi * 100).dropna(), {"url": "https://fred.stlouisfed.org/series/CMDEBT", "updated": meta.get("updated")}
    if sid == "REAL10Y_EST":
        gs10 = _monthly_fred("GS10")
        cpi, meta = fetch_fred("CPIAUCSL")   # 이미 월초 날짜의 월별 시리즈
        yoy = (cpi / cpi.shift(12) - 1) * 100
        return (gs10 - yoy).dropna(), {"url": "https://fred.stlouisfed.org/series/GS10", "updated": meta.get("updated")}
    raise ValueError(sid)


FETCH = {"fred": fetch_fred, "shiller": fetch_shiller, "yahoo": fetch_yahoo, "derived": fetch_derived}

# 계산 시리즈의 새 값이 생기는 시점을 정하는 FRED 원천 (발표 일정 조회용)
DERIVED_RELEASE = {"HHDEBT_DPI": "CMDEBT", "REAL10Y_EST": "CPIAUCSL"}


# ─────────────────────────────────────────────────────────────
# 발표 일정 (FRED release calendar) — 키가 있을 때만. 없거나 실패하면 None
# ─────────────────────────────────────────────────────────────
_RELEASE_OF, _RELEASE_DATES = {}, {}


def fred_next_releases(sid, n=6):
    if not FRED_KEY:
        return None
    base = "https://api.stlouisfed.org/fred"
    today = datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
    try:
        if sid not in _RELEASE_OF:
            rel = get(f"{base}/series/release",
                      params={"series_id": sid, "api_key": FRED_KEY, "file_type": "json"}).json()["releases"]
            _RELEASE_OF[sid] = rel[0]["id"] if rel else None
        rid = _RELEASE_OF[sid]
        if rid is None:
            return None
        if rid not in _RELEASE_DATES:
            # 미래 발표일은 'no data' 날짜로만 나옴. 내림차순으로 넉넉히 받아 오늘 이후만 남긴다
            js = get(f"{base}/release/dates",
                     params={"release_id": rid, "api_key": FRED_KEY, "file_type": "json",
                             "realtime_start": today, "include_release_dates_with_no_data": "true",
                             "sort_order": "desc", "limit": 1000}).json()
            _RELEASE_DATES[rid] = sorted(d["date"] for d in js.get("release_dates", []) if d["date"] >= today)
        return _RELEASE_DATES[rid][:n]
    except Exception as e:  # noqa: BLE001
        log(f"  ⚠️ {sid}: 발표 일정 조회 실패 ({type(e).__name__})")
        return None


def release_sid(key, sp):
    if sp["src"] == "fred":
        return sp["srcId"].split(":")[0]
    return DERIVED_RELEASE.get(key)


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

    # 원 시리즈 시작 이전 구간을 월별 A − B 로 이어붙임 (예: 10Y-3M = GS10 − TB3MS)
    spliced_before = None
    if sp.get("backfill"):
        a, b = sp["backfill"]
        try:
            bf = (_monthly_fred(a) - _monthly_fred(b)).dropna()
            bf = bf[bf.index < per.index[0]]
            if len(bf):
                spliced_before = per.index[0].strftime("%Y-%m-%d")
                per = pd.concat([bf, per])
        except Exception as e:  # noqa: BLE001
            log(f"  ⚠️ {key}: 이어붙이기 실패 → 원 시리즈만 사용 ({type(e).__name__})")

    frame = {tf: derive(per, obs_freq, tf) for tf in sp["tf"]}
    df = pd.DataFrame(frame)
    df = df[df.index >= START]
    df = df.dropna(how="all")

    nd_level = max(sp["dec"] + 2, 2) if per.abs().max() < 1e5 else 1

    # pubDate = 마지막 관측(rawLast)이 원천에서 공개된 날 (미국 날짜).
    # 같은 관측의 수정 발표는 공개일로 치지 않으므로 rawLast 가 그대로면 이전 값을 유지
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    raw_last = raw.index[-1].strftime("%Y-%m-%d")
    prev = {}
    if (SERIES_DIR / f"{key}.json").exists():
        try:
            prev = json.loads((SERIES_DIR / f"{key}.json").read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    pub_date = prev.get("pubDate") if prev.get("rawLast") == raw_last else None
    if not pub_date:
        if meta.get("updated"):              # FRED last_updated (미국 중부시간)
            pub_date = meta["updated"][:10]
        elif sp["src"] == "yahoo":           # 종가는 거래일 당일 공개
            pub_date = raw_last
        else:                                # 공개일을 알 수 없으면 처음 받은 날
            pub_date = datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")

    # 다음 발표일: FRED 일정 → 실패하면 이전에 받아둔 일정 중 아직 안 지난 것
    rs = release_sid(key, sp)
    nxt = fred_next_releases(rs) if rs else None
    if nxt is None:
        today = datetime.now(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
        nxt = [d for d in prev.get("next") or [] if d >= today]

    out = {
        "key": key, "label": sp["label"], "units": sp["units"],
        "freq": sp["freq"], "obsFreq": obs_freq, "agg": sp["agg"],
        "src": sp["src"], "srcId": sp["srcId"], "url": meta.get("url") or source_url(sp),
        "note": sp["note"], "dec": sp["dec"], "tf": sp["tf"],
        "rawFirst": raw.index[0].strftime("%Y-%m-%d"),
        "rawLast": raw_last,
        "partialLast": partial,
        "since": sp.get("since"),
        "spliceNote": (f"{spliced_before[:4]}년 {int(spliced_before[5:7])}월 이전은 월별 {sp['backfill'][0]} − {sp['backfill'][1].split(':')[0]} 로 이어붙인 값이에요"
                       if spliced_before else None),
        "updated": meta.get("updated"),
        "fetchedAt": now,
        "pubDate": pub_date,
        "next": nxt,
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
        "pubDate": js.get("pubDate"), "next": js.get("next") or [],
        "since": js.get("since"), "spliceNote": js.get("spliceNote"),
        "latest": {"tf": tf0, "date": date, "value": val, "prev": prev},
        "spark": spark,
    }


def build_recessions(prev):
    """FRED USREC(NBER 경기침체 월=1) → [{from, to}] (월 단위, to 포함). 실패 시 이전 값 유지"""
    try:
        s, _ = fetch_fred("USREC")
    except Exception as e:  # noqa: BLE001
        log(f"  ⚠️ USREC 실패 → 이전 경기침체 구간 유지 ({type(e).__name__})")
        return prev
    s = s[s.index >= pd.Timestamp(START) - pd.DateOffset(years=5)]
    out, cur = [], None
    for d, v in s.items():
        if v >= 1 and cur is None:
            cur = d
        elif v < 1 and cur is not None:
            out.append({"from": cur.strftime("%Y-%m"), "to": (d - pd.DateOffset(months=1)).strftime("%Y-%m")})
            cur = None
    if cur is not None:
        out.append({"from": cur.strftime("%Y-%m"), "to": s.index[-1].strftime("%Y-%m"), "ongoing": True})
    return out


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
            "easy": EXPLAIN.get(ind["id"]),
            "relations": rel,
        })

    prev_rec = []
    if (OUT_DIR / "catalog.json").exists():
        try:
            prev_rec = json.loads((OUT_DIR / "catalog.json").read_text(encoding="utf-8")).get("recessions", [])
        except Exception:  # noqa: BLE001
            pass

    catalog = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "recessions": build_recessions(prev_rec),
        "events": [{"id": e["id"], "name": e["name"], "from": e["frm"], "to": e["to"], "note": e["note"]} for e in EVENTS],
        "start": START,
        "tfLabel": TF_LABEL,
        "categories": CATEGORIES,
        "indicators": inds,
        "series": {k: v for k, v in summaries.items() if v},
        "seriesEasy": {k: v for k, v in SERIES_EXPLAIN.items() if summaries.get(k)},
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
