"""
생활권(구 없는 시를 행정동으로 묶은 단위) 집값 — 국토부 아파트 매매 실거래가 상세 자료

  py scripts/house/build_trades.py                    # 빠진 달 + 최근 3개월 다시 받기 → 계산
  py scripts/house/build_trades.py --max-calls 9000   # 하루 호출 한도(개발계정 1만) 안에서 끊어 받기
  py scripts/house/build_trades.py --kikmix jscode.zip   # 행안부 법정동↔행정동 연결표 갱신 (행정동이 바뀔 때만)

build_local.py 다음에 실행 (local/{시도}.json 에 생활권 단위를 덧붙임)

집값이 부동산원 시 전체 값과 따로 놀지 않게
  생활권 집값(t) = 부동산원 시 84㎡ 집값(t) × [생활권 ㎡당 중앙값 / 시 기준값](3개월 평균) × 수준 보정(시마다 상수)
    - ㎡당 중앙값: 최근 6개월(모자라면 12개월) 전용 75~95㎡ 실거래, 한 단지가 15% 넘게 차지하지 못하게
    - 시 기준값: 생활권 값들의 가중 평균 (가중치 = 전체 기간 거래 비중, 고정)
    - 수준 보정: 최근 1년 [시 기준값 × 84 / 부동산원 시 집값] 중앙값 — 금액은 실거래 수준, 흐름은 부동산원
  → 생활권끼리의 차이·흐름이 시 전체와 따로 놀지 않음. 부동산원 값이 없는 군은 실거래 중앙값 그대로
RAW: processed/house/raw/trades/{시군구}/{연도}.csv (해지된 거래 제외, 지난 해 파일은 안 바뀜)
     umd = 법정동코드 뒤 5자리, seq = 단지번호(시군구 접두어 뺌), 단지 이름은 {시군구}/apts.csv
"""
import csv
import io
import json
import os
import re
import sys
import threading
import time
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from build_local import now, pack, summarize  # noqa: E402
from living_areas import AREAS, BJD_OVERRIDE  # noqa: E402

KEY = os.environ.get("MOLIT_API_KEY", "").strip()
URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
OUT_DIR = ROOT / "public" / "data" / "house" / "local"
RAW_DIR = ROOT / "processed" / "house" / "raw" / "trades"
MIX = ROOT / "processed" / "house" / "kikmix.csv"
SINCE = "201901"
REFETCH = 3            # 늦은 신고·해지 반영: 최근 몇 달은 매번 다시 받음
AREA_MIN, AREA_MAX = 75, 95
WIN = 6                # 비율 계산 창 (개월)
MIN_N = 5              # 창 안에 이만큼 거래가 있어야 값을 냄
APT_CAP = 0.15         # 한 단지가 창 안 거래에서 차지할 수 있는 최대 비중
SQM = 84
COLS = ["ym", "day", "umd", "seq", "area", "price", "floor", "built"]


def log(msg):
    print(msg, flush=True)


# ─────────────────────────────────────────────────────────────
# 법정동 ↔ 행정동 (행안부 KIKmix)
# ─────────────────────────────────────────────────────────────
def update_kikmix(zip_path):
    z = zipfile.ZipFile(zip_path)
    name = next(n for n in z.namelist() if re.search(r"KIKmix\.\d{8}$", n))
    rows = []
    for line in z.read(name).decode("cp949").splitlines()[1:]:
        codes = re.findall(r"\b\d{10}\b", line)
        dates = re.findall(r"\b\d{8}\b", line)
        if len(codes) != 2 or len(dates) != 1:    # 말소일자가 있는 행 = 없어진 연결
            continue
        h, b = codes
        if h[5:] == "00000" or b[5:] == "00000":
            continue
        ib = line.index(b, line.index(h) + 10)
        names = line[line.index(h) + 10:ib].split()
        if not names:
            continue
        rows.append([h, h[:5], names[-1], b, line[ib + 10:line.index(dates[0], ib)].strip()])
    MIX.parent.mkdir(parents=True, exist_ok=True)
    with MIX.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["hcode", "sgg", "hname", "bjd", "bname"])
        w.writerows(rows)
    log(f"  ✅ {name.rsplit('/', 1)[-1]} → {MIX.relative_to(ROOT)} ({len(rows):,}행)")


def load_mix():
    mix = defaultdict(dict)   # (시군구, 행정동 이름) → {법정동코드: 법정동 이름}
    with MIX.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            # '화도읍남부출장소' 처럼 출장소로 따로 잡힌 리는 원래 읍면에 붙임
            h = re.sub(r"^(.+?[읍면동])\S*출장소$", r"\1", norm(r["hname"]))
            mix[(r["sgg"], h)][r["bjd"]] = r["bname"]
    return mix


def norm(name):
    return name.replace("·", ".").replace(" ", "")


def emd_bjds(mix, sgg, emd):
    """행정동 → 법정동들. 지도(경계)와 연결표의 개편 시점이 달라 이름이 안 맞으면 '고덕동' → '고덕1동·고덕2동' 처럼 찾음"""
    got = mix.get((sgg, norm(emd)))
    if got:
        return got
    stem = norm(emd)[:-1]
    out = {}
    for (s, h), v in mix.items():
        if s == sgg and re.fullmatch(re.escape(stem) + r"\d+동", h):
            out.update(v)
    return out


def bjd_to_area(geo_units, mix):
    """{시군구: {법정동코드: 생활권 uid}}"""
    out = defaultdict(dict)
    by_sgg = defaultdict(list)
    for uid, u in geo_units.items():
        if u.get("kind") == "area":
            by_sgg[u["parent"]].append((uid, u))
    for sgg, areas in by_sgg.items():
        cand = defaultdict(list)   # 법정동 → [(uid, 생활권 이름, 행정동들)]
        names = {}
        for uid, u in areas:
            for e in u["emds"]:
                bj = emd_bjds(mix, sgg, e)
                if not bj:
                    log(f"  ! 연결표에 없는 행정동: {u['full']} {e}")
                for b, bn in bj.items():
                    names[b] = bn
                    if uid not in [c[0] for c in cand[b]]:
                        cand[b].append((uid, u["name"], u["emds"]))
        over = BJD_OVERRIDE.get(sgg, {})
        for b, cs in cand.items():
            pick = cs[0][0]
            if len(cs) > 1:
                bn = names[b]
                stem = bn[:-1] if bn.endswith("동") else None
                named = [c for c in cs if stem and any(re.fullmatch(re.escape(stem) + r"\d*동", e) for e in c[2])]
                if len(named) == 1:
                    pick = named[0][0]
                elif bn in over:
                    pick = next((c[0] for c in cs if c[1] == over[bn]), pick)
                else:
                    log(f"  · {areas[0][1]['full'].split()[0]} {bn}: {[c[1] for c in cs]} 중 '{cs[0][1]}' 로")
            out[sgg][b] = pick
    return out


# ─────────────────────────────────────────────────────────────
# 실거래 받기
# ─────────────────────────────────────────────────────────────
class Budget:
    def __init__(self, n):
        self.left = n
        self.lock = threading.Lock()

    def take(self):
        with self.lock:
            if self.left <= 0:
                raise RuntimeError("호출 한도")
            self.left -= 1


def fetch_month(sgg, ym, budget):
    rows, page = [], 1
    while True:
        budget.take()
        for attempt in range(4):
            try:
                r = requests.get(URL, params=dict(serviceKey=KEY, LAWD_CD=sgg, DEAL_YMD=ym, pageNo=page, numOfRows=1000), timeout=40)
                root = ET.fromstring(r.content)
                code = root.findtext(".//resultCode")
                if code not in ("000", "00"):
                    raise RuntimeError(root.findtext(".//resultMsg") or root.findtext(".//returnAuthMsg") or r.text[:200])
                break
            except Exception as e:  # noqa: BLE001
                if attempt == 3 or "LIMITED" in str(e) or "등록되지 않은" in str(e):
                    raise
                time.sleep(2 * (attempt + 1))
        items = root.findall(".//item")
        total = int(root.findtext(".//totalCount") or 0)
        for it in items:
            g = {c.tag: (c.text or "").strip() for c in it}
            if g.get("cdealType"):          # 해지된 거래
                continue
            seq = g.get("aptSeq", "").removeprefix(sgg + "-")
            rows.append([
                ym, g.get("dealDay", ""), g.get("umdCd", ""), seq,
                g.get("excluUseAr", ""), g.get("dealAmount", "").replace(",", ""), g.get("floor", ""), g.get("buildYear", ""),
                g.get("aptNm", ""),
            ])
        if page * 1000 >= total or not items:
            return rows
        page += 1


def months(a, b):
    y, m = int(a[:4]), int(a[4:])
    out = []
    while f"{y}{m:02d}" <= b:
        out.append(f"{y}{m:02d}")
        m += 1
        if m > 12:
            y, m = y + 1, 1
    return out


def load_raw(sgg):
    d = RAW_DIR / sgg
    if not d.exists():
        return pd.DataFrame(columns=COLS)
    fs = sorted(d.glob("[0-9]*.csv"))
    if not fs:
        return pd.DataFrame(columns=COLS)
    return pd.concat([pd.read_csv(f, dtype=str, keep_default_na=False) for f in fs], ignore_index=True)


def save_apts(sgg, df):
    """단지번호 → 단지 이름 (새로 본 단지만 추가, 이름이 바뀌면 최신으로)"""
    path = RAW_DIR / sgg / "apts.csv"
    old = pd.read_csv(path, dtype=str, keep_default_na=False) if path.exists() else pd.DataFrame(columns=["seq", "apt"])
    out = pd.concat([old, df]).drop_duplicates("seq", keep="last").sort_values("seq")
    path.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(path, index=False)


def save_raw(sgg, df):
    d = RAW_DIR / sgg
    d.mkdir(parents=True, exist_ok=True)
    for y, g in df.groupby(df["ym"].str[:4]):
        g.sort_values(["ym", "day", "umd", "seq", "area", "floor"]).to_csv(d / f"{y}.csv", index=False)


def update_raw(sggs, budget):
    man_path = RAW_DIR / "_fetched.json"
    man = json.loads(man_path.read_text(encoding="utf-8")) if man_path.exists() else {}
    today = date.today()
    last = f"{today.year}{today.month:02d}"
    allm = months(SINCE, last)
    recent = set(allm[-REFETCH:])
    jobs = [(s, ym) for s in sggs for ym in allm if ym in recent or ym not in set(man.get(s, []))]
    # 최근 달부터 받아서, 한도에 걸려도 화면에 필요한 최근 값이 먼저 채워지게
    jobs.sort(key=lambda j: j[1], reverse=True)
    log(f"  · 받을 (시군구·달) {len(jobs):,}개 · 호출 한도 {budget.left:,}")
    got = defaultdict(dict)
    stop = False

    def work(job):
        if stop:
            return job, None
        try:
            return job, fetch_month(*job, budget)
        except Exception as e:  # noqa: BLE001
            return job, e

    done = 0
    with ThreadPoolExecutor(6) as ex:
        for (s, ym), res in ex.map(work, jobs):
            if isinstance(res, Exception):
                if "호출 한도" in str(res) or "LIMITED" in str(res):
                    stop = True
                else:
                    log(f"  ! {s} {ym}: {res}")
                continue
            if res is None:
                continue
            got[s][ym] = res
            done += 1
            if done % 500 == 0:
                log(f"    … {done:,}/{len(jobs):,}")
    for s, mm in got.items():
        old = load_raw(s)
        old = old[~old["ym"].isin(mm.keys())]
        new = pd.DataFrame([r for rs in mm.values() for r in rs], columns=COLS + ["apt"])
        save_apts(s, new[["seq", "apt"]])
        save_raw(s, pd.concat([old, new[COLS]], ignore_index=True))
        man[s] = sorted(set(man.get(s, [])) | set(mm))
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    man_path.write_text(json.dumps(man, separators=(",", ":")), encoding="utf-8")
    left = len(jobs) - done
    log(f"  ✅ 받음 {done:,} · 남음 {left:,}{' (호출 한도 — 다음 실행 때 이어서)' if stop else ''}")
    return man


# ─────────────────────────────────────────────────────────────
# 계산
# ─────────────────────────────────────────────────────────────
def unpack_series(p):
    if not p:
        return None
    idx = pd.period_range(p["s"], periods=len(p["v"]), freq="M")
    return pd.Series(p["v"], index=idx, dtype="float64")


def wmedian(v, w):
    o = v.argsort()
    v, w = v[o], w[o]
    c = w.cumsum()
    return float(v[(c >= c[-1] / 2).argmax()])


def window_price(g, t, months, start):
    """t 까지 months 개월 창의 ㎡당 가격 중앙값. 거래 하나하나를 세되(큰 단지일수록 거래가 많아 재고 비중과 비슷),
    한 단지가 창 거래의 APT_CAP 넘게 차지하지 못하게 눌러서 신축 한두 곳에 끌려가지 않게. 모자라면 None"""
    if t - months + 1 < start:
        return None, 0
    w = g[(g["p"] > t - months) & (g["p"] <= t)]
    n = len(w)
    if n < MIN_N:
        return None, n
    per = w.groupby("seq")["ppm"].transform("size").to_numpy(dtype=float)
    cap = max(5.0, APT_CAP * n)
    weight = (cap / per).clip(max=1.0)
    return wmedian(w["ppm"].to_numpy(dtype=float), weight), n


def area_prices(sel, months_idx):
    """생활권별 (㎡당 가격, 가중치=거래 수). 6개월로 모자라면 12개월 창"""
    start = sel["p"].min()
    out = {}
    for k, g in sel.groupby("uid"):
        med, cnt = {}, {}
        for t in months_idx:
            v, n = window_price(g, t, WIN, start)
            if v is None:
                v, _ = window_price(g, t, WIN * 2, start)
            med[t], cnt[t] = v, n
        out[k] = (pd.Series(med, dtype="float64"), pd.Series(cnt, dtype="float64"))
    return out


def build_city(sgg, df, b2a, city_p84, area_ids):
    df = df.copy()
    df["area_m2"] = pd.to_numeric(df["area"], errors="coerce")
    df["price_n"] = pd.to_numeric(df["price"], errors="coerce")
    df = df.dropna(subset=["area_m2", "price_n"])
    df["p"] = pd.PeriodIndex(df["ym"].str[:4] + "-" + df["ym"].str[4:], freq="M")
    # 이번 달은 신고 기한(30일)이 안 지나 거래가 덜 잡혀 있음 → 지난달까지만
    df = df[df["p"] < pd.Period(date.today(), freq="M")]
    df["uid"] = (sgg + df["umd"]).map(b2a)
    unmapped = df["uid"].isna().sum()
    df = df.dropna(subset=["uid"])
    vol = df.groupby(["uid", "p"]).size()
    sel = df[(df["area_m2"] >= AREA_MIN) & (df["area_m2"] <= AREA_MAX)].copy()
    sel["ppm"] = sel["price_n"] / sel["area_m2"]
    if sel.empty:
        return {}, unmapped
    # 첫 창이 다 찰 때부터 (2019-01 하나로 낸 값이 고점처럼 보이지 않게)
    idx = pd.period_range(sel["p"].min() + WIN - 1, sel["p"].max(), freq="M")
    areas = area_prices(sel, idx)
    # 기준 = 생활권 값들의 가중 평균 (가중치 = 생활권별 전체 기간 84형대 거래 비중, 고정)
    # → 생활권들을 다시 합치면 부동산원 시 값과 같아지고, 거래가 잠깐 한쪽에 몰려도 모든 생활권이 같이 흔들리지 않음
    med_df = pd.DataFrame({k: m for k, (m, _) in areas.items()})
    share = sel.groupby("uid").size().reindex(med_df.columns).fillna(0)
    w_df = med_df.notna().mul(share, axis=1)
    base = (med_df.fillna(0) * w_df).sum(axis=1) / w_df.sum(axis=1).replace(0, float("nan"))
    # 금액 수준: 부동산원 평균가격은 오래된 소형 단지까지 섞여 지방일수록 실거래보다 낮게 나옴 (군산 등 30~40%)
    # → 흐름은 부동산원 그대로 두고, 수준만 시마다 숫자 하나로 최근 1년 실거래에 맞춤
    level = 1.0
    if city_p84 is not None:
        k = (base * SQM / city_p84.reindex(base.index)).dropna()
        if len(k):
            level = float(k.iloc[-12:].median())
    out = {}
    for uid in area_ids:
        med = areas[uid][0] if uid in areas else pd.Series(dtype="float64")
        if med.dropna().empty:
            p, how = None, None
        elif city_p84 is not None:
            ratio = (med / base).rolling(3, min_periods=1).mean()
            p = (city_p84.reindex(med.index) * ratio * level).dropna()
            how = "trade_ratio"
        else:
            p = (med * SQM).dropna()
            how = "trade"
        recent = sel[(sel["uid"] == uid) & (sel["p"] > idx[-1] - 3)]
        v = vol.get(uid)
        vol_s = v.reindex(pd.period_range(idx[0], idx[-1], freq="M"), fill_value=0) if v is not None else None
        u = {
            "p84": pack(p, 0) if p is not None and not p.empty else None, "how": how,
            "vol": pack(vol_s.astype(float), 0) if vol_s is not None else None,
            # 최근 3개월 84형대 실거래 (환산 아님, 실제 거래 금액의 중앙값)
            "tr": {"n": int(len(recent)), "med": int(recent["price_n"].median()) if len(recent) else None,
                   "from": str(idx[-1] - 2), "to": str(idx[-1])},
            "sum": summarize(p if p is not None and not p.empty else None, None, vol_s),
        }
        out[uid] = {k: v for k, v in u.items() if v is not None}
    return out, unmapped


def main():
    if "--kikmix" in sys.argv:
        update_kikmix(sys.argv[sys.argv.index("--kikmix") + 1])
        return
    budget = Budget(int(sys.argv[sys.argv.index("--max-calls") + 1]) if "--max-calls" in sys.argv else 9000)
    mix = load_mix()
    geos = {p.stem[4:]: json.loads(p.read_text(encoding="utf-8")) for p in sorted(OUT_DIR.glob("geo_*.json"))}
    sggs = sorted({u["parent"] for g in geos.values() for u in g["units"].values() if u.get("kind") == "area"})
    unknown = [s for s in AREAS if s not in sggs]
    if unknown:
        log(f"  ! 지도에 없는 생활권 시군구: {unknown} — build_local_map.py 먼저")

    if KEY:
        update_raw(sggs, budget)
    else:
        log("MOLIT_API_KEY 없음 — 저장된 RAW 로 계산만")

    for fid, g in geos.items():
        b2a = bjd_to_area(g["units"], mix)
        if not b2a:
            continue
        path = OUT_DIR / f"{fid}.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        # 이전 실행의 생활권 단위는 지우고 다시
        data["units"] = {k: v for k, v in data["units"].items() if g["units"].get(k, {}).get("kind") != "area"}
        for sgg, m in b2a.items():
            raw = load_raw(sgg)
            if raw.empty:
                continue
            cu = data["units"].get(sgg) or (data["units"].get("root") if fid == "sejong" else None)
            city_p84 = unpack_series(cu.get("p84")) if cu else None
            area_ids = sorted(set(m.values()))
            units, unmapped = build_city(sgg, raw, m, city_p84, area_ids)
            data["units"].update(units)
            n_ok = sum(1 for u in units.values() if "p84" in u)
            name = g["units"][sgg]["name"]
            log(f"  ✅ {g['ko']} {name}: 생활권 {len(area_ids)}개 중 집값 {n_ok} · 거래 {len(raw):,}건"
                + (f" (생활권 못 찾은 {unmapped}건)" if unmapped else ""))
        data["tradeAt"] = now()
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
