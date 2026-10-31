"""
수도권 단지별 지도 — 구(생활권) 안의 행정동 경계 + 아파트 단지 시세 (국토부 실거래가)

  py scripts/house/build_apts.py             # 계산만 (좌표를 못 찾은 단지는 행정동 안에 대략 배치)
  py scripts/house/build_apts.py --geocode   # VWORLD_API_KEY 로 좌표 없는 단지 찾기 → processed/house/apt_xy.csv

build_trades.py 다음에 실행. 결과
  public/data/house/apt/{단위}.json    지도용 (행정동 경계·요약, 단지 위치·시세)
  public/data/house/apt/{단위}_h.json  단지를 눌렀을 때 (분기별 시세 흐름, 최근 거래)
  public/data/house/apt/index.json     단지 지도가 있는 단위 목록
단위 = 수도권 지도의 맨 아래 단위 (서울 구, 경기 일반구·시·군, 생활권)
시세 = 직전 12개월 실거래 ㎡당 가격 중앙값 × 84 (전용 30~200㎡, 3건 이상). 흐름은 분기 말마다 같은 방식
좌표는 EPSG:5179 (build_local_map.py 경계와 같은 평면좌표)
"""
import csv
import json
import math
import os
import sys
import tempfile
import time
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import requests

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
from build_local import now  # noqa: E402
from build_local_map import EMD_SRC, bbox, dissolve, fetch, label_of, parse_wkb, ring_area, to_path  # noqa: E402
from build_trades import CAPITAL, MIX, RAW_DIR, load_raw, log  # noqa: E402

GEO_DIR = ROOT / "public" / "data" / "house" / "local"
OUT_DIR = ROOT / "public" / "data" / "house" / "apt"
XY = ROOT / "processed" / "house" / "apt_xy.csv"
VKEY = os.environ.get("VWORLD_API_KEY", "").strip()
SIDO_FULL = {"seoul": "서울특별시", "incheon": "인천광역시", "gyeonggi": "경기도"}

WIDTH, PAD = 640, 14
TOL = 0.35                 # 경계 단순화 (px)
AREA_MIN, AREA_MAX = 30, 200
WIN = 12                   # 시세 창 (개월)
MIN_N = 3                  # 창 안에 이만큼 거래가 있어야 시세를 냄
ALIVE = 60                 # 최근 이만큼(개월) 거래가 없는 단지는 빼기 (재건축 등으로 사라진 단지)
LAST_TRADES = 15           # 단지 상세에 넣을 최근 거래 수 (화면에 15건)
SQM = 84


# ─────────────────────────────────────────────────────────────
# 지도 단위 · 행정동
# ─────────────────────────────────────────────────────────────
def leaves(geo):
    """(단위 uid, 실거래 시군구, 지도 단위) — 생활권은 시 단위로 실거래를 받음"""
    units = geo["units"]
    parents = {u.get("parent") for u in units.values()}
    for uid, u in units.items():
        if u.get("kind") == "area":
            yield uid, u["parent"], u
        elif uid not in parents and u.get("d"):
            yield uid, uid, u


def point_in(poly_rings, x, y):
    inside = False
    for ring in poly_rings:
        n = len(ring)
        for i in range(n):
            (x0, y0), (x1, y1) = ring[i], ring[(i + 1) % n]
            if (y0 > y) != (y1 > y) and x < (x1 - x0) * (y - y0) / (y1 - y0) + x0:
                inside = not inside
    return inside


def load_mix():
    """법정동코드 → [행정동코드], 법정동 이름"""
    b2h, bname = defaultdict(list), {}
    with MIX.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            b2h[r["bjd"]].append(r["hcode"])
            bname[r["bjd"]] = r["bname"]
    return b2h, bname


# ─────────────────────────────────────────────────────────────
# 좌표 (브이월드 지오코더, 결과는 캐시)
# ─────────────────────────────────────────────────────────────
def load_xy():
    if not XY.exists():
        return {}
    with XY.open(encoding="utf-8") as f:
        return {r["key"]: r for r in csv.DictReader(f)}


def save_xy(xy):
    XY.parent.mkdir(parents=True, exist_ok=True)
    with XY.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["key", "x", "y", "src"])
        w.writeheader()
        for k in sorted(xy):
            w.writerow({c: xy[k].get(c, "") for c in ["key", "x", "y", "src"]})


def vworld(addr, typ):
    for attempt in range(3):
        try:
            r = requests.get("https://api.vworld.kr/req/address", timeout=20, params=dict(
                service="address", request="getcoord", version="2.0", crs="epsg:5179", address=addr,
                format="json", type=typ, refine="true", simple="true", key=VKEY))
            res = r.json()["response"]
            if res["status"] == "OK":
                p = res["result"]["point"]
                return float(p["x"]), float(p["y"])
            if res["status"] == "NOT_FOUND":
                return None
            raise RuntimeError(json.dumps(res.get("error"), ensure_ascii=False))
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                log(f"  ! 지오코딩 실패 {addr}: {e}")
                return None
            time.sleep(1 + attempt)
    return None


def sgg_full(fid, geo, sgg):
    u = geo["units"][sgg]
    name = u["full"]
    if u.get("level") == 3 and "시" in name and not name.endswith("시"):
        i = name.index("시") + 1
        name = name[:i] + " " + name[i:]   # '고양시일산서구' → '고양시 일산서구'
    return f"{SIDO_FULL[fid]} {name}"


def geocode(todo, xy):
    """todo: [(key, 지번 주소, 도로명 주소)]"""
    log(f"  · 좌표 찾을 단지 {len(todo):,}개")
    for i, (key, parcel, road) in enumerate(todo, 1):
        p = vworld(parcel, "parcel") if parcel else None
        src = "parcel"
        if p is None and road:
            p, src = vworld(road, "road"), "road"
        xy[key] = {"key": key, "x": f"{p[0]:.1f}", "y": f"{p[1]:.1f}", "src": src} if p else {"key": key, "src": "fail"}
        if i % 200 == 0:
            save_xy(xy)
            log(f"    … {i:,}/{len(todo):,}")
    save_xy(xy)


# ─────────────────────────────────────────────────────────────
# 시세
# ─────────────────────────────────────────────────────────────
def mnum(ym):
    return int(ym[:4]) * 12 + int(ym[4:6]) - 1


def mstr(m):
    return f"{m // 12}-{m % 12 + 1:02d}"


def rolling(ms, pp, ends):
    """끝 달마다 직전 WIN개월 ㎡당 가격 중앙값 × 84 (거래가 MIN_N 건 미만이면 None). ms 는 정렬돼 있어야 함"""
    lo = np.searchsorted(ms, ends - WIN + 1, "left")
    hi = np.searchsorted(ms, ends, "right")
    out = []
    for a, b in zip(lo, hi):
        out.append(round(float(np.median(pp[a:b])) * SQM) if b - a >= MIN_N else None)
    return out


def summary(ms, pp, end, qends):
    """시세·고점 대비·1년 변화·하락 추세 + 분기별 흐름"""
    o = np.argsort(ms, kind="stable")
    ms, pp = ms[o], pp[o]
    flow = rolling(ms, pp, qends)
    cur, prev = rolling(ms, pp, np.array([end, end - 12]))
    out = {"c": int(((ms > end - WIN) & (ms <= end)).sum())}
    vals = [(v, i) for i, v in enumerate(flow) if v is not None]
    if cur is not None and vals:
        peak, pi = max(vals)
        peak = max(peak, cur)
        out.update(p=cur, pk=peak, pd=mstr(int(qends[pi])) if peak != cur else mstr(end), dd=round((cur / peak - 1) * 100, 1))
        if prev:
            out["yoy"] = round((cur / prev - 1) * 100, 1)
        last4 = rolling(ms, pp, np.arange(end - 3, end + 1))
        if None not in last4 and all(a > b for a, b in zip(last4, last4[1:])):
            out["down"] = 1
    return out, flow


# ─────────────────────────────────────────────────────────────
def main():
    do_geo = "--geocode" in sys.argv
    if do_geo and not VKEY:
        log("VWORLD_API_KEY 없음 — 좌표 찾기는 건너뜀")
        do_geo = False
    today = date.today()
    end = today.year * 12 + today.month - 2          # 지난달까지 (이번 달은 신고가 덜 됨)
    first = 2006 * 12 + 11                            # 2006-12 (실거래 신고제 2006-01 + 12개월)
    qends = np.array([m for m in range(first, end + 1) if m % 3 == 2] + ([end] if end % 3 != 2 else []))
    qlabels = [mstr(int(m)) for m in qends]

    b2h, bname = load_mix()
    xy = load_xy()
    emd_all = defaultdict(list)
    for r in fetch(EMD_SRC, Path(tempfile.gettempdir()) / "reant_house").itertuples():
        if r.sidocd in ("11", "28", "41"):
            emd_all[r.sggcd].append(r)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    index = {}
    for fid in CAPITAL:
        geo = json.loads((GEO_DIR / f"geo_{fid}.json").read_text(encoding="utf-8"))
        by_sgg = defaultdict(list)
        for uid, sgg, u in leaves(geo):
            by_sgg[sgg].append((uid, u))

        for sgg, lv in sorted(by_sgg.items()):
            raw = load_raw(sgg)
            apath = RAW_DIR / sgg / "apts.csv"
            if raw.empty or not apath.exists():
                log(f"  · {geo['ko']} {geo['units'][sgg]['name']}: 실거래 없음 — 건너뜀")
                continue
            apts = pd.read_csv(apath, dtype=str, keep_default_na=False).set_index("seq")
            for c in ["umd", "jibun", "road"]:
                if c not in apts:
                    apts[c] = ""

            # 행정동: 경계·이름·어느 단위에 속하는지
            emds = {}
            area_of = {}
            for r in emd_all.get(sgg, []):
                polys = parse_wkb(r.geom)
                emds[r.emdcd] = dict(name=r.emdnm, polys=polys)
            for uid, u in lv:
                names = set(u.get("emds") or [])
                for code, e in emds.items():
                    if u.get("kind") != "area" or e["name"] in names:
                        area_of[code] = uid

            df = raw.copy()
            df["area"] = pd.to_numeric(df["area"], errors="coerce")
            df["price"] = pd.to_numeric(df["price"], errors="coerce")
            df = df[(df["area"] >= AREA_MIN) & (df["area"] <= AREA_MAX) & (df["price"] > 0)]
            df["m"] = df["ym"].map(mnum)
            df = df[df["m"] <= end]
            df["pp"] = df["price"] / df["area"]
            last_m = df.groupby("seq")["m"].max()
            alive = set(last_m[last_m > end - ALIVE].index)
            # 법정동은 실거래 원본에서 (apts.csv 는 예전에 받은 시군구엔 이름만 있음)
            umd = raw.sort_values(["ym", "day"]).groupby("seq")["umd"].last()
            apts = apts.reindex(apts.index.union(umd.index), fill_value="")
            apts.loc[umd.index, "umd"] = umd

            # 좌표 찾기 (살아 있는 단지만)
            if do_geo:
                todo = []
                base = sgg_full(fid, geo, sgg)
                for seq in sorted(alive):
                    key = f"{sgg}-{seq}"
                    if key in xy or seq not in apts.index:
                        continue
                    a = apts.loc[seq]
                    bjd = sgg + a["umd"] if a["umd"] else ""
                    bn = bname.get(bjd, "")
                    if bjd and bjd[-2:] != "00":   # 리 → '통진읍 도사리'
                        bn = f"{bname.get(bjd[:8] + '00', '')} {bn}".strip()
                    parcel = f"{base} {bn} {a['jibun']}" if bn and a["jibun"] else ""
                    road = f"{base} {a['road']}" if a["road"] else ""
                    if parcel or road:
                        todo.append((key, parcel, road))
                if todo:
                    geocode(todo, xy)

            # 단지 → 행정동 (좌표가 있으면 경계 안에 드는 동, 없으면 법정동 연결표)
            apt_rows = {}
            for seq in alive:
                a = apts.loc[seq] if seq in apts.index else None
                p = xy.get(f"{sgg}-{seq}")
                code, pt = None, None
                if p and p.get("x"):
                    pt = (float(p["x"]), float(p["y"]))
                    code = next((c for c, e in emds.items() if any(point_in(poly, *pt) for poly in e["polys"])), None)
                if code is None and a is not None and a["umd"]:
                    cands = [h for h in b2h.get(sgg + a["umd"], []) if h in emds]
                    code = cands[0] if cands else None
                    pt = None if code is None or (pt and not any(point_in(poly, *pt) for poly in emds[code]["polys"])) else pt
                if code is None or code not in area_of:
                    continue
                apt_rows[seq] = dict(code=code, pt=pt, name=a["apt"] if a is not None else seq)

            df["code"] = df["seq"].map(lambda s: apt_rows[s]["code"] if s in apt_rows else None)
            for uid, u in lv:
                codes = [c for c, a in area_of.items() if a == uid]
                if not codes:
                    continue
                build_leaf(fid, uid, u, geo, codes, emds, df, apt_rows, end, qends, qlabels, index)

    save_xy(xy) if do_geo else None
    (OUT_DIR / "index.json").write_text(json.dumps(
        {"generatedAt": now(), "asOf": mstr(end), "units": index}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"  ✅ 단지 지도 {len(index)}개 단위 · 기준 {mstr(end)}")


def build_leaf(fid, uid, u, geo, codes, emds, df, apt_rows, end, qends, qlabels, index):
    polys_all = [p for c in codes for p in emds[c]["polys"]]
    x0, y0, x1, y1 = bbox([pt for p in polys_all for pt in p[0]])
    s = (WIDTH - 2 * PAD) / max(x1 - x0, (y1 - y0) * 0.8)
    height = round((y1 - y0) * s + 2 * PAD)
    proj = lambda p: ((p[0] - x0) * s + PAD, (y1 - p[1]) * s + PAD)  # noqa: E731

    sub = df[df["code"].isin(codes)]
    dongs, dong_idx = [], {}
    for c in sorted(codes, key=lambda c: emds[c]["name"]):
        e = emds[c]
        g = sub[sub["code"] == c]
        sm, _ = summary(g["m"].to_numpy(), g["pp"].to_numpy(), end, qends)
        dong_idx[c] = len(dongs)
        dongs.append(dict(n=e["name"], d=to_path(e["polys"], proj, TOL), l=label_of(e["polys"], proj),
                          a=round(sum(ring_area(p[0]) for p in e["polys"]) * s * s), **sm))

    # 좌표 없는 단지: 동 중심에서 해바라기 배치 (거래 많은 단지가 가운데)
    by_dong = defaultdict(list)
    for seq, a in apt_rows.items():
        if a["code"] in dong_idx and a["pt"] is None:
            by_dong[a["code"]].append(seq)
    cnt = sub.groupby("seq").size()
    approx = {}
    for c, seqs in by_dong.items():
        seqs.sort(key=lambda q: -cnt.get(q, 0))
        lx, ly = dongs[dong_idx[c]]["l"]
        r0 = math.sqrt(dongs[dong_idx[c]]["a"] / math.pi) * 0.55
        for i, q in enumerate(seqs):
            rr = r0 * math.sqrt((i + 0.5) / len(seqs))
            t = i * 2.39996
            approx[q] = (lx + rr * math.cos(t), ly + rr * math.sin(t))

    apts, hist = [], {}
    for seq, g in sub.groupby("seq"):
        a = apt_rows.get(seq)
        if a is None:
            continue
        sm, flow = summary(g["m"].to_numpy(), g["pp"].to_numpy(), end, qends)
        x, y = proj(a["pt"]) if a["pt"] else approx[seq]
        g = g.sort_values(["m", "day"])
        lt = g.iloc[-1]
        rec = dict(i=seq, n=a["name"], x=round(x, 1), y=round(y, 1), g=dong_idx[a["code"]],
                   b=int(lt["built"]) if str(lt["built"]).isdigit() else None,
                   t=[mstr(int(lt["m"])), float(lt["area"]), int(lt["price"]), str(lt["floor"])], **sm)
        if a["pt"] is None:
            rec["ap"] = 1
        apts.append(rec)
        k = next((j for j, v in enumerate(flow) if v is not None), None)
        hist[seq] = dict(
            s=k if k is not None else len(flow), v=flow[k:] if k is not None else [],
            t=[[mstr(int(r.m)), int(r.day) if str(r.day).isdigit() else 0, float(r.area), str(r.floor), int(r.price)]
               for r in g.tail(LAST_TRADES).itertuples()][::-1],
        )
    apts.sort(key=lambda r: -r["c"])

    total, _ = summary(sub["m"].to_numpy(), sub["pp"].to_numpy(), end, qends)
    out = dict(
        id=uid, name=u["name"], full=u["full"], sido=geo["ko"], fid=fid, asOf=mstr(end), generatedAt=now(),
        viewBox=[0, 0, WIDTH, height], outline=to_path(dissolve(polys_all), proj, TOL),
        sum=total, dongs=dongs, apts=apts,
    )
    (OUT_DIR / f"{uid}.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (OUT_DIR / f"{uid}_h.json").write_text(json.dumps({"q": qlabels, "apts": hist}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    index[uid] = dict(fid=fid, n=len(apts))
    n_ap = sum(1 for a in apts if a.get("ap"))
    log(f"  ✅ {geo['ko']} {u['full']}: 동 {len(dongs)} · 단지 {len(apts)}" + (f" (좌표 대략 {n_ap})" if n_ap else "")
        + f" · {(OUT_DIR / f'{uid}.json').stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
