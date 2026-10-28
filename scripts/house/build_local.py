"""
시군구·구 단위 아파트 집값 흐름 (R-ONE) → public/data/house/local/{시도}.json, local/index.json

  py scripts/house/build_local.py          # 새 달 데이터가 없으면 저장된 RAW 로 다시 계산만
  py scripts/house/build_local.py --force  # 무조건 다시 받기

집값(84㎡ 환산) 만드는 법
  - 지금 값 = 최근 달 ㎡당 평균 매매가격 × 84㎡ (부동산원은 평균가격을 '지역 간 가격 수준 비교'용으로 권장)
  - 과거 흐름 = 지금 값 × 매매가격지수(t) / 매매가격지수(최근 달)
    평균가격 자체는 표본 개편(2017·2021 등) 때 끊겨서 흐름으로 쓰면 안 된다고 부동산원이 명시 → 변동은 지수로 계산
RAW 는 processed/house/raw/local_{표}.csv 에 그대로 두고, 화면용 가공값은 별도 JSON.
지역 이름 → 지도 단위는 build_local_map.py 가 만든 geo_{시도}.json 을 기준으로 맞춘다.
"""
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "macro"))
from build_macro import get, log  # noqa: E402

KEY = os.environ.get("RONE_API_KEY", "").strip()
OUT_DIR = ROOT / "public" / "data" / "house" / "local"
RAW_DIR = ROOT / "processed" / "house" / "raw"
SQM = 84

# 표 id → (짧은 이름, 설명)
TABLES = {
    "idx": "A_2024_00045",   # (월) 매매가격지수_아파트 2003-11~
    "ppm": "A_2024_00061",   # (월) 평균단위매매가격_아파트 (천원/㎡) 2012-01~
    "med": "A_2024_00062",   # (월) 중위매매가격_아파트 (천원) 2012-01~
    "jr":  "A_2024_00072",   # (월) 평균 매매가격 대비 전세가격_아파트 (%) 2012-01~
    "vol": "A_2024_00554",   # (월) 행정구역별 아파트매매거래현황 (호) 2006-01~
}
NATIONAL_CLS = 500001

RONE_SIDO = {
    "서울": "seoul", "부산": "busan", "대구": "daegu", "인천": "incheon", "전남광주": "jeonnamgwangju",
    "대전": "daejeon", "울산": "ulsan", "세종": "sejong", "경기": "gyeonggi", "강원": "gangwon",
    "충북": "chungbuk", "충남": "chungnam", "전북": "jeonbuk", "경북": "gyeongbuk", "경남": "gyeongnam", "제주": "jeju",
}
# 전국 지도(17개 시도) id → (지역 파일, 그 파일 안의 단위)
NATIONAL = {
    "seoul": ("seoul", "root"), "busan": ("busan", "root"), "daegu": ("daegu", "root"), "incheon": ("incheon", "root"),
    "gwangju": ("jeonnamgwangju", "12200"), "daejeon": ("daejeon", "root"), "ulsan": ("ulsan", "root"),
    "sejong": ("sejong", "root"), "gyeonggi": ("gyeonggi", "root"), "gangwon": ("gangwon", "root"),
    "chungbuk": ("chungbuk", "root"), "chungnam": ("chungnam", "root"), "jeonbuk": ("jeonbuk", "root"),
    "jeonnam": ("jeonnamgwangju", "jeonnam"), "gyeongbuk": ("gyeongbuk", "root"), "gyeongnam": ("gyeongnam", "root"),
    "jeju": ("jeju", "root"),
}
GWANGJU_GU = {"동구", "서구", "남구", "북구", "광산구"}
PEAK_BAND = 3.0   # 최고가 대비 이 % 안이면 그냥 '최고가'


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ─────────────────────────────────────────────────────────────
# R-ONE 받기
# ─────────────────────────────────────────────────────────────
def rone(statbl, page, size=1000, cls=None):
    url = ("https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
           f"?KEY={KEY}&Type=json&pIndex={page}&pSize={size}&STATBL_ID={statbl}&DTACYCLE_CD=MM&ITM_ID=100001")
    if cls:
        url += f"&CLS_ID={cls}"
    js = get(url).json()
    if "SttsApiTblData" not in js:
        raise RuntimeError(js.get("RESULT", js))
    head, body = js["SttsApiTblData"]
    return head["head"][0]["list_total_count"], body["row"]


def latest_month(statbl):
    _, rows = rone(statbl, 1, cls=NATIONAL_CLS)
    return max(r["WRTTIME_IDTFR_ID"] for r in rows)


def fetch_table(name, statbl, force):
    """RAW CSV (cls, full, ym, value). 저장본의 마지막 달이 R-ONE 최신 달과 같으면 다시 받지 않는다"""
    path = RAW_DIR / f"local_{name}.csv"
    if path.exists() and not force:
        old = pd.read_csv(path, dtype={"ym": str})
        if old["ym"].max() == latest_month(statbl):
            log(f"  · {name}: 새 달 없음 ({old['ym'].max()}) — 저장본 사용")
            return old
    total, rows, page = None, [], 1
    while True:
        total, got = rone(statbl, page)
        rows += got
        if len(rows) >= total or not got:
            break
        page += 1
    df = pd.DataFrame({
        "cls": [r["CLS_ID"] for r in rows], "full": [r["CLS_FULLNM"] for r in rows],
        "ym": [r["WRTTIME_IDTFR_ID"] for r in rows], "value": [r["DTA_VAL"] for r in rows],
    }).sort_values(["cls", "ym"])
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    log(f"  ✅ {name}: {len(df):,}행 · {df['cls'].nunique()}개 지역 · ~{df['ym'].max()}")
    return df


# ─────────────────────────────────────────────────────────────
# R-ONE 지역 이름 → 지도 단위
# ─────────────────────────────────────────────────────────────
def is_group(seg):
    """권역 묶음(경부1권·강북지역·도심권·전남 등)은 건너뛴다"""
    return not seg.endswith(("시", "군", "구")) and seg not in ("광주", "(구)광주")


def resolve(full, index):
    """'경기>경의권>고양시>일산서구' → ('gyeonggi', '41287'). 못 찾으면 (시도, None)"""
    segs = full.split(">")
    fid = RONE_SIDO.get(segs[0])
    if not fid:
        return None, None
    rest, grouped = [], False
    for s in segs[1:]:
        if s == "(구)광주":
            s = "광주"
        elif s.startswith("(구)"):
            return fid, None          # 개편 전 옛 구역 — 지금 지도와 이어붙이지 않음
        if is_group(s):
            grouped = True
            continue
        rest.append(s)
    if fid == "jeonnamgwangju":
        if not rest and segs[-1] == "전남":
            return fid, "jeonnam"     # 지도에 없는 '전남(옛 전라남도) 합계' — 전국 지도의 전남 칸에 씀
        if rest and rest[0] in GWANGJU_GU:
            rest = ["광주"] + rest
    if not rest:
        return (fid, "root") if not grouped else (fid, None)
    return fid, index[fid].get(tuple(rest))


def unit_index(geos):
    idx = {}
    for fid, g in geos.items():
        m = {}
        for uid, u in g["units"].items():
            if u["level"] == 2:
                m[(u["name"],)] = uid
            else:
                m[(g["units"][u["parent"]]["name"], u["name"])] = uid
        idx[fid] = m
    return idx


# ─────────────────────────────────────────────────────────────
# 계산
# ─────────────────────────────────────────────────────────────
def to_series(df):
    s = pd.Series(df["value"].values, index=pd.PeriodIndex(df["ym"], freq="M"))
    s = pd.to_numeric(s, errors="coerce")
    s = s[~s.index.duplicated(keep="last")].sort_index()
    return s.asfreq("M")


def pack(s, nd):
    s = s.dropna()
    if s.empty:
        return None
    s = s.asfreq("M")
    return {"s": str(s.index[0]), "v": [None if pd.isna(v) else (round(float(v), nd) if nd else int(round(v))) for v in s]}


def p84_flow(idx, ppm):
    """84㎡ 환산 집값 흐름 (만원). 지수가 없으면 평균가격 그대로 (표본 개편 영향 있음)"""
    if ppm is None or ppm.dropna().empty:
        return None, None
    ppm = ppm.dropna()
    if idx is not None and not idx.dropna().empty:
        common = idx.dropna().index.intersection(ppm.index)
        if len(common):
            t = common[-1]
            base = ppm[t] * SQM / 10   # 천원/㎡ → 만원
            return (idx.dropna() / idx[t] * base), "index"
    return ppm * SQM / 10, "avg"


def summarize(p, jr, vol):
    out = {}
    if p is not None and len(p.dropna()) > 1:
        p = p.dropna()
        last, t = float(p.iloc[-1]), p.index[-1]
        pk_t = p.idxmax()
        pk = float(p[pk_t])
        dd = (last / pk - 1) * 100
        mom = p.pct_change() * 100
        m3 = mom.iloc[-3:].tolist()
        trend = "down" if all(x < 0 for x in m3) else "up" if all(x > 0 for x in m3) else "flat"
        y1 = p.get(t - 12)
        out.update(
            date=str(t), p84=round(last), peak=round(pk), peakDate=str(pk_t), dd=round(dd, 1),
            atPeak=dd > -PEAK_BAND, trend=trend, mom=round(float(mom.iloc[-1]), 2),
            yoy=round((last / float(y1) - 1) * 100, 1) if y1 is not None and not pd.isna(y1) else None,
            p84y=round(float(y1)) if y1 is not None and not pd.isna(y1) else None,
        )
    if jr is not None and not jr.dropna().empty:
        out["jr"] = round(float(jr.dropna().iloc[-1]), 1)
    if vol is not None and not vol.dropna().empty:
        v = vol.dropna()
        out["vol"] = int(v.iloc[-1])
        out["volDate"] = str(v.index[-1])
        prev = v.get(v.index[-1] - 12)
        out["volYoy"] = round((v.iloc[-1] / prev - 1) * 100) if prev and not pd.isna(prev) else None
    return out


def main():
    force = "--force" in sys.argv
    if not KEY:
        log("RONE_API_KEY 없음 — 건너뜀")
        return
    geos = {p.stem[4:]: json.loads(p.read_text(encoding="utf-8")) for p in sorted(OUT_DIR.glob("geo_*.json"))}
    if not geos:
        raise SystemExit("geo_*.json 없음 — 먼저 build_local_map.py 실행")
    index = unit_index(geos)

    raw = {k: fetch_table(k, t, force) for k, t in TABLES.items()}

    # 지역 파일별 단위 → 표별 시계열
    data = {fid: {} for fid in geos}
    miss = {}
    for k, df in raw.items():
        for (cls, full), g in df.groupby(["cls", "full"]):
            fid, uid = resolve(full, index)
            if fid is None:
                continue
            if uid is None:
                if not full.split(">")[-1].startswith("(구)") and not is_group(full.split(">")[-1]):
                    miss.setdefault(full, set()).add(k)
                continue
            data[fid].setdefault(uid, {})[k] = to_series(g)

    asof = max(df["ym"].max() for df in raw.values())
    asof = f"{asof[:4]}-{asof[4:]}"
    summaries = {}
    for fid, units in data.items():
        out_units = {}
        for uid, ss in units.items():
            p, how = p84_flow(ss.get("idx"), ss.get("ppm"))
            u = {
                "p84": pack(p, 0) if p is not None else None, "how": how,
                "idx": pack(ss["idx"], 2) if p is None and "idx" in ss else None,
                "jr": pack(ss["jr"], 1) if "jr" in ss else None,
                "vol": pack(ss["vol"], 0) if "vol" in ss else None,
                "med": round(float(ss["med"].dropna().iloc[-1]) / 10) if "med" in ss and not ss["med"].dropna().empty else None,
                "sum": summarize(p, ss.get("jr"), ss.get("vol")),
            }
            out_units[uid] = {k: v for k, v in u.items() if v is not None}
            summaries[(fid, uid)] = u["sum"]
        g = geos[fid]
        out = {"id": fid, "ko": g["ko"], "generatedAt": now(), "asOf": asof, "sqm": SQM, "units": out_units}
        # 생활권 단위(build_trades.py 가 덧붙임)는 그대로 둠 — 실거래 단계가 실패해도 값이 사라지지 않게
        prev_path = OUT_DIR / f"{fid}.json"
        if prev_path.exists():
            prev = json.loads(prev_path.read_text(encoding="utf-8"))
            out_units.update({k: v for k, v in prev["units"].items() if g["units"].get(k, {}).get("kind") == "area"})
            if "tradeAt" in prev:
                out["tradeAt"] = prev["tradeAt"]
        (OUT_DIR / f"{fid}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        n_geo = sum(1 for x in g["units"].values() if x["d"])
        n_p = sum(1 for uid, x in out_units.items() if "p84" in x and uid in g["units"])
        n_v = sum(1 for uid, x in out_units.items() if "vol" in x and uid in g["units"])
        log(f"  ✅ {g['ko']}: 지도 {n_geo}칸 중 집값 {n_p} · 거래량 {n_v}")

    idx_out = {
        "generatedAt": now(), "asOf": asof, "sqm": SQM, "peakBand": PEAK_BAND,
        "files": {nid: {"file": f, "unit": u} for nid, (f, u) in NATIONAL.items()},
        "regions": {nid: summaries.get((f, u), {}) for nid, (f, u) in NATIONAL.items()},
    }
    (OUT_DIR / "index.json").write_text(json.dumps(idx_out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    if miss:
        log(f"  · 지도에 없는 R-ONE 지역 {len(miss)}개 (건너뜀): " + ", ".join(sorted(miss)[:30]))


if __name__ == "__main__":
    main()
