"""
한국 부동산·가계신용 데이터 빌더

  python scripts/house/build_house.py              # 전체
  python scripts/house/build_house.py KR_CALL      # 특정 전국 시리즈만 (catalog·지역은 항상 재생성)

산출물
  processed/house/raw/{KEY}.csv            원천 RAW (원본 주기 그대로)
  public/data/house/series/{KEY}.json      전국 시리즈 (macro 와 같은 형식 → 같은 차트 엔진)
  public/data/house/regions.json           17개 시도 지도용 (최신값 + 최근 흐름)
  public/data/house/catalog.json           카드·설명·API 키 상태·이벤트

ECOS_API_KEY / RONE_API_KEY 가 없으면 그 원천의 시리즈는 건너뛰고 '키 필요' 로 표시한다.
받기 실패한 시리즈·지역은 기존 JSON 을 그대로 둔다 (빈 화면 방지).
"""
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "macro"))
from house_registry import (  # noqa: E402
    APIS, EVENTS, GROUPS, INDICATORS, MERGED_NOTE, REGION_METRICS, REGIONS, START, S as SERIES,
)
from build_macro import derive, fetch_fred, get, log, rnd, to_period  # noqa: E402

ROOT = HERE.parents[1]
RAW_DIR = ROOT / "processed" / "house" / "raw"
OUT_DIR = ROOT / "public" / "data" / "house"
SERIES_DIR = OUT_DIR / "series"

KEYS = {
    "ECOS": os.environ.get("ECOS_API_KEY", "").strip(),
    "RONE": os.environ.get("RONE_API_KEY", "").strip(),
    "IROS": os.environ.get("IROS_AUCTION_KEY", "").strip(),
}
AUCTION_RAW = RAW_DIR / "auction"
# 등기정보광장 시도 코드 → 지도 id (전남광주 1200 은 광주 자치구로 나눔)
IROS_SIDO = {
    "900": "seoul", "800": "busan", "600": "daegu", "1100": "incheon", "700": "daejeon", "1000": "ulsan",
    "1700": "sejong", "200": "gyeonggi", "100": "gangwon", "1600": "chungbuk", "1500": "chungnam",
    "1300": "jeonbuk", "400": "gyeongbuk", "300": "gyeongnam", "1400": "jeju",
}
GWANGJU_GU = {"동구", "서구", "남구", "북구", "광산구"}
SPARK_YEARS = 10
REGION_SPARK_YEARS = 20

TF_LABEL = {
    "level": "원본", "yoy": "YoY %", "mom": "MoM %", "qoq": "QoQ %", "qoq_saar": "QoQ 연율 %",
    "chg": "전기 대비 변화", "chg_3ma": "변화 3개월 평균", "avg_3m": "3개월 평균",
}


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─────────────────────────────────────────────────────────────
# ECOS
# ─────────────────────────────────────────────────────────────
def _ecos_time(t, cycle):
    if cycle == "M":
        return pd.Timestamp(year=int(t[:4]), month=int(t[4:6]), day=1)
    if cycle == "Q":
        return pd.Timestamp(year=int(t[:4]), month=(int(t[5]) - 1) * 3 + 1, day=1)
    return pd.Timestamp(year=int(t[:4]), month=1, day=1)


def fetch_ecos(stat, cycle, items, start):
    """ECOS StatisticSearch → pd.Series(월/분기 첫날 index). items = 'A/B/C' (항목코드 순서대로)"""
    end = {"M": "209912", "Q": "2099Q4", "A": "2099"}[cycle]
    url = f"https://ecos.bok.or.kr/api/StatisticSearch/{KEYS['ECOS']}/json/kr/1/100000/{stat}/{cycle}/{start}/{end}/{items}"
    js = get(url).json()
    if "StatisticSearch" not in js:
        raise RuntimeError(js.get("RESULT", js))
    rows = js["StatisticSearch"]["row"]
    s = pd.Series({_ecos_time(r["TIME"], cycle): r["DATA_VALUE"] for r in rows})
    s = pd.to_numeric(s, errors="coerce").dropna().sort_index()
    return s


# ─────────────────────────────────────────────────────────────
# R-ONE (한국부동산원)
# ─────────────────────────────────────────────────────────────
def fetch_rone(statbl, cls, itm):
    """R-ONE SttsApiTblData (월간) → pd.Series(월 첫날 index). 한 페이지 최대 1000행이라 넘기며 받는다"""
    vals, page = {}, 1
    while True:
        url = ("https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
               f"?KEY={KEYS['RONE']}&Type=json&pIndex={page}&pSize=1000"
               f"&STATBL_ID={statbl}&DTACYCLE_CD=MM&CLS_ID={cls}&ITM_ID={itm}")
        js = get(url).json()
        if "SttsApiTblData" not in js:
            raise RuntimeError(js.get("RESULT", js))
        head, body = js["SttsApiTblData"]
        for r in body["row"]:
            t = r["WRTTIME_IDTFR_ID"]
            vals[pd.Timestamp(year=int(t[:4]), month=int(t[4:6]), day=1)] = r["DTA_VAL"]
        if len(vals) >= head["head"][0]["list_total_count"] or not body["row"]:
            break
        page += 1
    return pd.to_numeric(pd.Series(vals), errors="coerce").dropna().sort_index()


def iros_raw(kind):
    """build_auction.py 가 받아 둔 RAW → (시도 지도 id, 월 첫날, 건수) DataFrame"""
    out = []
    for f in sorted(AUCTION_RAW.glob(f"{kind}_*.csv")):
        df = pd.read_csv(f, dtype={"ym": str, "sgg": str}, keep_default_na=False)
        sido = f.stem.split("_", 1)[1]
        if sido == "1200":
            df["region"] = df["sgg"].map(lambda x: "gwangju" if x in GWANGJU_GU else "jeonnam")
        else:
            df["region"] = IROS_SIDO.get(sido)
        out.append(df)
    if not out:
        raise RuntimeError("경매 RAW 없음 — build_auction.py 먼저")
    df = pd.concat(out, ignore_index=True)
    df["date"] = pd.to_datetime(df["ym"].str[:4] + "-" + df["ym"].str[4:] + "-01")
    this_month = pd.Timestamp.today().to_period("M").to_timestamp()
    return df[df["date"] < this_month]   # 이번 달은 아직 덜 쌓임


def fetch_series_raw(sp):
    if sp["src"] == "fred":
        s, _ = fetch_fred(sp["srcId"])
        return s, f"https://fred.stlouisfed.org/series/{sp['srcId']}"
    if sp["src"] == "ecos":
        stat, cycle, items = sp["srcId"].split("/", 2)
        start = {"M": "197001", "Q": "1970Q1", "A": "1970"}[cycle]
        return fetch_ecos(stat, cycle, items, start), "https://ecos.bok.or.kr/"
    if sp["src"] == "rone":
        statbl, cls, itm = sp["srcId"].split("/")
        return fetch_rone(statbl, cls, itm), "https://www.reb.or.kr/r-one/"
    if sp["src"] == "iros":
        s = iros_raw(sp["srcId"]).groupby("date")["tot"].sum().sort_index().astype(float)
        return s.asfreq("MS", fill_value=0.0), "https://data.iros.go.kr/"
    raise RuntimeError(f"알 수 없는 원천: {sp['src']}")


# ─────────────────────────────────────────────────────────────
# 전국 시리즈
# ─────────────────────────────────────────────────────────────
def build_series(key):
    sp = SERIES[key]
    raw, url = fetch_series_raw(sp)
    if len(raw) < 10:
        raise RuntimeError(f"데이터가 너무 적음 ({len(raw)}행)")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    raw.rename("value").to_csv(RAW_DIR / f"{key}.csv", index_label="date")

    per, obs_freq, partial = to_period(raw, sp)
    df = pd.DataFrame({tf: derive(per, obs_freq, tf) for tf in sp["tf"]})
    df = df[df.index >= START].dropna(how="all")
    nd_level = max(sp["dec"] + 2, 2) if per.abs().max() < 1e5 else 1
    out = {
        "key": key, "label": sp["label"], "units": sp["units"], "freq": sp["freq"], "obsFreq": obs_freq,
        "agg": None, "src": sp["src"], "srcId": sp["srcId"], "url": url, "note": sp["note"], "dec": sp["dec"],
        "tf": sp["tf"], "rawFirst": raw.index[0].strftime("%Y-%m-%d"), "rawLast": raw.index[-1].strftime("%Y-%m-%d"),
        "partialLast": partial, "since": sp.get("since"), "spliceNote": None, "updated": None, "fetchedAt": now(),
        "d": [d.strftime("%Y-%m-%d") for d in df.index],
    }
    for tf in sp["tf"]:
        nd = nd_level if tf in ("level", "chg", "chg_3ma", "avg_3m") else 3
        out[tf] = [rnd(v, nd) for v in df[tf].tolist()]
    SERIES_DIR.mkdir(parents=True, exist_ok=True)
    (SERIES_DIR / f"{key}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def series_summary(key):
    p = SERIES_DIR / f"{key}.json"
    if not p.exists():
        return None
    js = json.loads(p.read_text(encoding="utf-8"))
    tf0 = js["tf"][0]
    pts = [(d, v) for d, v in zip(js["d"], js[tf0]) if v is not None]
    if not pts:
        return None
    cutoff = (pd.Timestamp.today() - pd.DateOffset(years=SPARK_YEARS)).strftime("%Y-%m-%d")
    spark = [[d, v] for d, v in pts if d >= cutoff]
    if len(spark) > 130:
        step = math.ceil(len(spark) / 120)
        spark = spark[::step] + ([spark[-1]] if spark[-1] != spark[::step][-1] else [])
    return {
        "key": key, "label": js["label"], "units": js["units"], "freq": js["freq"], "obsFreq": js["obsFreq"],
        "agg": None, "tf": js["tf"], "dec": js["dec"], "note": js["note"], "url": js["url"],
        "first": js["d"][0], "rawLast": js["rawLast"], "partialLast": js["partialLast"], "updated": None,
        "fetchedAt": js["fetchedAt"], "since": js.get("since"), "spliceNote": None,
        "latest": {"tf": tf0, "date": pts[-1][0], "value": pts[-1][1], "prev": pts[-2][1] if len(pts) > 1 else None},
        "spark": spark,
    }


# ─────────────────────────────────────────────────────────────
# 시도별 지도 데이터
# ─────────────────────────────────────────────────────────────
def region_series(metric, reg):
    if metric.get("src") == "iros":
        df = iros_raw(metric["kind"])
        s = df[df["region"] == reg["id"]].groupby("date")["tot"].sum().sort_index().astype(float)
        return s.asfreq("MS", fill_value=0.0)
    total = None
    for stat, tmpl in metric["fetch"]:
        s = fetch_ecos(stat, metric["cycle"], tmpl.format(**reg), metric["start"])
        total = s if total is None else total.add(s).dropna()   # 두 원천이 다 있는 달만
    return total


def transform_region(s, tf):
    if tf == "level":
        return s
    if tf == "yoy":
        return derive(s, "M", "yoy")
    if tf == "dd":
        return (s / s.cummax() - 1) * 100
    if tf == "sum12":   # 최근 12개월 합 (월별 건수가 들쭉날쭉해서)
        return s.rolling(12).sum()
    if tf == "yoy12":
        r = s.rolling(12).sum()
        return (r / r.shift(12) - 1) * 100
    raise ValueError(tf)


def build_regions():
    path = OUT_DIR / "regions.json"
    prev = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    prev_regions = prev.get("regions", {})
    cutoff = pd.Timestamp.today() - pd.DateOffset(years=REGION_SPARK_YEARS)

    metrics, regions = [], {}
    for r in REGIONS:
        regions[r["id"]] = {"ko": r["ko"], "name": r["name"], "geo": r["geo"], "values": {}, "hist": {},
                            "note": MERGED_NOTE if r["id"] in ("gwangju", "jeonnam") else None}

    for m in REGION_METRICS:
        have_key = bool(KEYS.get(m["need"]))
        ok = 0
        for r in REGIONS:
            slot = regions[r["id"]]
            old = prev_regions.get(r["id"], {})
            if not have_key:
                if m["id"] in old.get("values", {}):   # 예전에 받은 값이 있으면 유지
                    slot["values"][m["id"]] = old["values"][m["id"]]
                    slot["hist"][m["id"]] = old.get("hist", {}).get(m["id"], [])
                    ok += 1
                continue
            try:
                v = transform_region(region_series(m, r), m["tf"]).dropna()
                if v.empty:
                    raise RuntimeError("빈 시계열")
                h = v[v.index >= cutoff]
                slot["values"][m["id"]] = {"v": rnd(v.iloc[-1], 3), "date": v.index[-1].strftime("%Y-%m"),
                                           "prev12": rnd(v.iloc[-13], 3) if len(v) > 12 else None}
                slot["hist"][m["id"]] = [[d.strftime("%Y-%m"), rnd(x, 3)] for d, x in h.items()]
                ok += 1
            except Exception as e:  # noqa: BLE001
                log(f"  ✗ {m['id']} {r['ko']}: {e} — 기존 값 유지")
                if m["id"] in old.get("values", {}):
                    slot["values"][m["id"]] = old["values"][m["id"]]
                    slot["hist"][m["id"]] = old.get("hist", {}).get(m["id"], [])
                    ok += 1
        dates = [regions[r["id"]]["values"][m["id"]]["date"] for r in REGIONS if m["id"] in regions[r["id"]]["values"]]
        metrics.append({
            "id": m["id"], "label": m["label"], "short": m["short"], "unit": m["unit"], "dec": m["dec"],
            "good": m["good"], "need": m["need"], "desc": m["desc"],
            "available": ok > 0, "asOf": max(dates) if dates else None,
        })
        log(f"  {'✅' if ok else '··'} 지역 {m['id']}: {ok}/{len(REGIONS)}" + ("" if have_key else f" ({m['need']} 키 없음)"))

    out = {"generatedAt": now(), "metrics": metrics, "regions": regions}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# ─────────────────────────────────────────────────────────────
# catalog.json
# ─────────────────────────────────────────────────────────────
def build_catalog():
    used = []
    for ind in INDICATORS:
        used += ind["main"] + ind.get("subs", [])
    summaries = {k: series_summary(k) for k in dict.fromkeys(used)}
    inds = []
    for ind in INDICATORS:
        need = SERIES[ind["main"][0]].get("need")
        live = all(summaries.get(k) for k in ind["main"])
        inds.append({
            "id": ind["id"], "group": ind["group"], "ko": ind["ko"], "main": ind["main"], "subs": ind.get("subs", []),
            "what": ind["what"], "need": need,
            "status": "live" if live else ("needKey" if need and not KEYS.get(need) else "error"),
        })
    catalog = {
        "generatedAt": now(),
        "start": START,
        "tfLabel": TF_LABEL,
        "keys": {k: bool(v) for k, v in KEYS.items()},
        "apis": APIS,
        "groups": GROUPS,
        "indicators": inds,
        "series": {k: v for k, v in summaries.items() if v},
        "events": [{"id": e["id"], "name": e["name"], "from": e["frm"], "to": e["to"], "note": e["note"]} for e in EVENTS],
    }
    (OUT_DIR / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return catalog


def main():
    only = set(sys.argv[1:])
    keys = [k for k in SERIES if not only or k in only]
    done, skipped, failed = 0, [], []
    for k in keys:
        need = SERIES[k].get("need")
        if need and not KEYS.get(need):
            skipped.append(k)
            continue
        try:
            build_series(k)
            done += 1
            log(f"  ✅ {k}")
        except Exception as e:  # noqa: BLE001
            failed.append(k)
            log(f"  ✗ {k}: {e} — 기존 파일 유지")
    if not only:
        build_regions()
    cat = build_catalog()
    live = sum(1 for i in cat["indicators"] if i["status"] == "live")
    log(f"\n요약: 시리즈 {done} 성공 · 키 없어 건너뜀 {len(skipped)} · 실패 {len(failed)} / 카드 live {live}/{len(cat['indicators'])}")
    if failed:
        log("실패: " + ", ".join(failed))
        tried = len(keys) - len(skipped)
        if tried and len(failed) > tried / 2:
            sys.exit(1)


if __name__ == "__main__":
    main()
