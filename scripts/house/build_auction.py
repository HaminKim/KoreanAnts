"""
경매 신청 — 대법원 등기정보광장 Open API (임의경매·강제경매 개시결정등기 신청 부동산 수, 집합건물)

  py scripts/house/build_auction.py           # 올해(1~2월엔 작년도) 다시 받기 + 빠진 해 채우기 → 시군구 단위 합치기
  py scripts/house/build_auction.py --no-fetch  # 저장된 RAW 로 계산만
  py scripts/house/build_auction.py --fetch-only  # 받기만 (macro-sync: build_house 전에 받고, build_local 뒤에 --no-fetch 로 붙임)

  - 임의경매: 대출(근저당)을 못 갚아 금융기관이 경매에 넘긴 것 → 빚 부담 신호 (IROS_AUCTION_KEY)
  - 강제경매: 판결 등으로 채권자가 넘긴 것 (전세보증금 반환 소송 등) (IROS_FORCED_KEY)
  - 집합건물 = 아파트·연립·다세대·오피스텔 (단독주택·토지 제외)
  - 2010년부터, 한 번에 최대 12개월, 키마다 하루 1,000번

RAW: processed/house/raw/auction/{kind}_{시도코드}.csv (ym, sgg, tot)
  → 전국·시도는 build_house.py 가 이 RAW 로 시리즈·지도를 만들고 (src = iros)
  → 시군구·구는 여기서 local/{시도}.json 에 덧붙임 (build_local.py · build_trades.py 다음에 실행)
"""
import json
import os
import sys
import time
from datetime import date
from pathlib import Path

import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from build_local import now, pack  # noqa: E402

URL = "https://data.iros.go.kr/openapi/cr/rs/selectCrRsRgsCsOpenApi.rest"
RAW_DIR = ROOT / "processed" / "house" / "raw" / "auction"
OUT_DIR = ROOT / "public" / "data" / "house" / "local"
FIRST_YEAR = 2010

KINDS = {
    # kind: (서비스 ID, 키 환경변수)
    "auction": ("0000000083", "IROS_AUCTION_KEY"),
    "forced": ("0000000087", "IROS_FORCED_KEY"),
}
# 등기정보광장 시도 코드 → (지역 파일 id, 이름)
SIDO = {
    "900": "seoul", "800": "busan", "600": "daegu", "1100": "incheon", "1200": "jeonnamgwangju",
    "700": "daejeon", "1000": "ulsan", "1700": "sejong", "200": "gyeonggi", "100": "gangwon",
    "1600": "chungbuk", "1500": "chungnam", "1300": "jeonbuk", "400": "gyeongbuk", "300": "gyeongnam", "1400": "jeju",
}
GWANGJU_GU = {"동구", "서구", "남구", "북구", "광산구"}   # 전남광주 안의 광주 자치구


def log(msg):
    print(msg, flush=True)


# ─────────────────────────────────────────────────────────────
# 받기
# ─────────────────────────────────────────────────────────────
def fetch_year(svc, key, sido, year):
    end = f"{year}12" if year < date.today().year else f"{year}{date.today().month:02d}"
    for attempt in range(4):
        try:
            r = requests.get(URL, params=dict(
                id=svc, key=key, reqtype="json", search_type_api="02",
                search_start_date_api=f"{year}01", search_end_date_api=end,
                search_real_cls_api="02", search_regn1_name_api=sido,
            ), headers={"User-Agent": "Mozilla/5.0"}, timeout=60)
            res = r.json()["result"]
            code = res["head"]["returnCode"]
            if code == "APIINFO-0003":      # 데이터 없음
                return []
            if code != "APIINFO-0001":
                raise RuntimeError(f"{code} {res['head'].get('returnMessage')}")
            return [(i["resDate"].replace("-", ""), i["adminRegn2Name"], int(i["tot"])) for i in res["items"]["item"]]
        except Exception as e:  # noqa: BLE001
            if attempt == 3 or "0003" in str(e) or "0005" in str(e):
                raise
            time.sleep(3 * (attempt + 1))   # 동시에 많이 부르면 연결을 끊어서 천천히


def update_raw(kind):
    svc, env = KINDS[kind]
    key = os.environ.get(env, "").strip()
    if not key:
        log(f"  · {env} 없음 — {kind} 저장본 사용")
        return
    today = date.today()
    refetch = {today.year} | ({today.year - 1} if today.month <= 2 else set())
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    calls = 0
    for sido in SIDO:
        path = RAW_DIR / f"{kind}_{sido}.csv"
        old = pd.read_csv(path, dtype={"ym": str, "sgg": str}, keep_default_na=False) if path.exists() else pd.DataFrame(columns=["ym", "sgg", "tot"])
        have = set(old["ym"].str[:4])
        years = [y for y in range(FIRST_YEAR, today.year + 1) if y in refetch or str(y) not in have]
        if not years:
            continue
        got = []
        for y in years:
            got += fetch_year(svc, key, sido, y)
            calls += 1
            time.sleep(0.4)
        new = pd.DataFrame(got, columns=["ym", "sgg", "tot"])
        keep = old[~old["ym"].str[:4].isin({str(y) for y in years})]
        pd.concat([keep, new]).sort_values(["ym", "sgg"]).to_csv(path, index=False)
    log(f"  ✅ {kind}: {calls}번 호출")


def load_raw(kind):
    fs = sorted(RAW_DIR.glob(f"{kind}_*.csv"))
    if not fs:
        return pd.DataFrame(columns=["sido", "ym", "sgg", "tot"])
    out = []
    for f in fs:
        df = pd.read_csv(f, dtype={"ym": str, "sgg": str}, keep_default_na=False)
        df["sido"] = f.stem.split("_", 1)[1]
        out.append(df)
    return pd.concat(out, ignore_index=True)


# ─────────────────────────────────────────────────────────────
# 시군구·구로 합치기
# ─────────────────────────────────────────────────────────────
def monthly(df):
    if df.empty:
        return None
    s = df.groupby("ym")["tot"].sum()
    s.index = pd.PeriodIndex(s.index.str[:4] + "-" + s.index.str[4:], freq="M")
    s = s.sort_index()
    # 이번 달은 아직 덜 쌓였으니 지난달까지
    s = s[s.index < pd.Period(date.today(), freq="M")]
    if s.empty:
        return None
    # 끝 달을 모든 단위가 같게 (지난달) — 최근에 신청이 없던 곳도 '최근 12개월'이 같은 기간이 되도록
    full = pd.period_range(pd.Period(f"{FIRST_YEAR}-01", freq="M"), pd.Period(date.today(), freq="M") - 1, freq="M")
    return s.reindex(full, fill_value=0).astype(float)


def summary(s):
    if s is None or len(s) < 13:
        return {}
    last12 = float(s.iloc[-12:].sum())
    prev12 = float(s.iloc[-24:-12].sum()) if len(s) >= 24 else None
    return {
        "date": str(s.index[-1]), "n12": int(last12), "n12y": int(prev12) if prev12 is not None else None,
        "yoy": round((last12 / prev12 - 1) * 100, 1) if prev12 else None,
        "last": int(s.iloc[-1]),
    }


def unit_rows(df, geo):
    """지도 단위 id → 그 단위에 해당하는 RAW 행. 일반구가 있는 시는 시 = '고양시' + '고양시 OO구' 행 모두"""
    units = geo["units"]
    rows = {"root": df}
    for uid, u in units.items():
        if u.get("kind") == "area":
            continue
        if geo["id"] == "jeonnamgwangju" and uid == "12200":
            rows[uid] = df[df["sgg"].isin(GWANGJU_GU)]
        elif geo["id"] == "jeonnamgwangju" and u.get("parent") == "12200":
            rows[uid] = df[df["sgg"] == u["name"]]
        elif u["level"] == 3:
            rows[uid] = df[df["sgg"] == f"{units[u['parent']]['name']} {u['name']}"]
        elif any(k.get("parent") == uid and not k.get("kind") for k in units.values()):
            rows[uid] = df[(df["sgg"] == u["name"]) | df["sgg"].str.startswith(u["name"] + " ")]
        elif geo["id"] == "sejong":
            rows[uid] = df
        else:
            rows[uid] = df[df["sgg"] == u["name"]]
    return rows


def attach(u, a, f):
    """단위에 경매 시계열을 붙이고, 지도 칩·순위용 요약은 sum 에도 (build_local 이 sum 을 새로 만들어도 이 단계가 다시 채움)"""
    sa, sf = summary(a), summary(f)
    u["auc"] = {"m": pack(a, 0) if a is not None else None, "f": pack(f, 0) if f is not None else None, "sum": sa, "sumF": sf}
    u.setdefault("sum", {}).update(auc12=sa.get("n12"), aucYoy=sa.get("yoy"), aucF12=sf.get("n12"))


def merge_local():
    raws = {k: load_raw(k) for k in KINDS}
    if all(r.empty for r in raws.values()):
        log("  · 경매 RAW 없음 — 건너뜀")
        return
    by_fid = {}
    for sido, fid in SIDO.items():
        by_fid[fid] = {k: r[r["sido"] == sido] for k, r in raws.items()}
    for fid, dfs in by_fid.items():
        gpath, dpath = OUT_DIR / f"geo_{fid}.json", OUT_DIR / f"{fid}.json"
        if not gpath.exists() or not dpath.exists():
            continue
        geo = json.loads(gpath.read_text(encoding="utf-8"))
        data = json.loads(dpath.read_text(encoding="utf-8"))
        rows = {k: unit_rows(df, geo) for k, df in dfs.items()}
        n = 0
        for uid in rows["auction"]:
            if uid != "root" and uid not in geo["units"]:
                continue
            a = monthly(rows["auction"][uid])
            f = monthly(rows["forced"].get(uid, pd.DataFrame(columns=["ym", "tot"])))
            if a is None and f is None:
                continue
            u = data["units"].setdefault(uid, {"sum": {}})
            attach(u, a, f)
            n += 1
        # 전남광주 파일의 '전남' 합계(전국 지도의 전남 칸) = 광주 빼고 나머지
        if fid == "jeonnamgwangju" and "jeonnam" in data["units"]:
            a = monthly(dfs["auction"][~dfs["auction"]["sgg"].isin(GWANGJU_GU)])
            f = monthly(dfs["forced"][~dfs["forced"]["sgg"].isin(GWANGJU_GU)])
            attach(data["units"]["jeonnam"], a, f)
        data["auctionAt"] = now()
        dpath.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        log(f"  ✅ {geo['ko']}: 경매 {n}개 단위")


def main():
    if "--no-fetch" not in sys.argv:
        for kind in KINDS:
            try:
                update_raw(kind)
            except Exception as e:  # noqa: BLE001
                log(f"  ✗ {kind}: {e} — 저장본 사용")
    if "--fetch-only" not in sys.argv:
        merge_local()


if __name__ == "__main__":
    main()
