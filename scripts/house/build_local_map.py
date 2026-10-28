"""
시군구·구 경계 → 시도별 화면용 SVG path (public/data/house/local/geo_{시도}.json). 경계가 바뀔 때만 다시 실행.

  py scripts/house/build_local_map.py

원천: vuski/admdongkor sgg_{VER}.parquet (MIT, 행정안전부 행정동 경계 기반) — EPSG:5179 (미터 단위 평면좌표라 그대로 SVG 로 옮긴다)
단위
  level 2 : 시·군·자치구. 일반구가 있는 시(고양시 등)와 전남광주의 '광주'는 구 경계를 합쳐 만든다
  level 3 : 일반구(고양시 일산서구 등) · 광주의 자치구
            · 구가 없는 시·광역시 군은 생활권(행정동을 합침, living_areas.py) — kind='area', emds=행정동 목록
"""
import io
import json
import math
import re
import struct
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

import pyarrow.parquet as pq
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from living_areas import areas_of  # noqa: E402

VER = "20261001"
SRC = f"https://raw.githubusercontent.com/vuski/admdongkor/master/parquet/sgg_{VER}.parquet"
EMD_SRC = f"https://raw.githubusercontent.com/vuski/admdongkor/master/parquet/emd_{VER}.parquet"
OUT_DIR = Path(__file__).resolve().parents[2] / "public" / "data" / "house" / "local"
WIDTH = 520
PAD = 10
TOL = {2: 0.35, 3: 0.2}   # 단순화 허용 오차 (px) — 구는 확대해서 보므로 더 촘촘히
MIN_RING = 1.2            # 이보다 작은 섬은 생략 (px, 바운딩 박스 대각선)
ISLAND_GAP = 30_000       # 본토 묶음에서 이 거리(m) 넘게 떨어진 작은 섬 묶음은 지도에서 뺀다 (백령도·울릉도 등)

# 경계 시도 코드 → (파일 id, R-ONE 시도 이름)
SIDO = {
    "11": ("seoul", "서울"), "26": ("busan", "부산"), "27": ("daegu", "대구"), "28": ("incheon", "인천"),
    "12": ("jeonnamgwangju", "전남광주"), "30": ("daejeon", "대전"), "31": ("ulsan", "울산"), "36": ("sejong", "세종"),
    "41": ("gyeonggi", "경기"), "51": ("gangwon", "강원"), "43": ("chungbuk", "충북"), "44": ("chungnam", "충남"),
    "52": ("jeonbuk", "전북"), "47": ("gyeongbuk", "경북"), "48": ("gyeongnam", "경남"), "50": ("jeju", "제주"),
}
# 섬이 넓게 흩어져 본토가 작아지는 군은 지도 범위 계산에서 뺀다 (범위 안의 섬만 그려짐)
BBOX_EXCLUDE = {"28720"}   # 인천 옹진군
GWANGJU_UID = "12200"   # 전남광주 안의 옛 광주광역시 (자치구 5개를 합친 가상 단위)
GWANGJU_GU = {"12210", "12240", "12270", "12300", "12330"}
METRO_GUN = {"26", "27", "28", "31"}   # 군도 생활권으로 나누는 광역시 (부산·대구·인천·울산)


# ─────────────────────────────────────────────────────────────
# WKB → 링 목록 (외곽·구멍 구분 없이 [[(x, y), ...], ...] 를 폴리곤별로)
# ─────────────────────────────────────────────────────────────
def parse_wkb(b):
    buf = io.BytesIO(b)

    def geom():
        bo = "<" if buf.read(1) == b"\x01" else ">"
        (t,) = struct.unpack(bo + "I", buf.read(4))
        t %= 1000
        if t == 3:
            (nr,) = struct.unpack(bo + "I", buf.read(4))
            rings = []
            for _ in range(nr):
                (n,) = struct.unpack(bo + "I", buf.read(4))
                pts = struct.unpack(bo + "d" * (2 * n), buf.read(16 * n))
                rings.append(list(zip(pts[0::2], pts[1::2])))
            return [rings]
        if t == 6:
            (n,) = struct.unpack(bo + "I", buf.read(4))
            return [p for _ in range(n) for p in geom()]
        raise ValueError(f"WKB type {t}")

    return geom()


def ring_area(r):
    return abs(sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]))) / 2


def bbox(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


# ─────────────────────────────────────────────────────────────
# 구 합치기: 같은 변이 두 번(반대 방향) 나오면 내부 경계 → 지우고 남은 변을 이어 링으로
# ─────────────────────────────────────────────────────────────
def dissolve(polys):
    q = lambda p: (round(p[0], 1), round(p[1], 1))
    edges = defaultdict(int)
    directed = []
    for poly in polys:
        for ring in poly:
            pts = [q(p) for p in ring]
            if pts[0] != pts[-1]:
                pts.append(pts[0])
            for a, b in zip(pts, pts[1:]):
                if a == b:
                    continue
                directed.append((a, b))
                edges[frozenset((a, b))] += 1
    nxt = defaultdict(list)
    for a, b in directed:
        if edges[frozenset((a, b))] == 1:
            nxt[a].append(b)
    rings = []
    while nxt:
        start = next(iter(nxt))
        ring, cur = [start], start
        while True:
            b = nxt[cur].pop()
            if not nxt[cur]:
                del nxt[cur]
            if b == start:
                break
            ring.append(b)
            cur = b
            if cur not in nxt:
                break
        if len(ring) >= 3:
            rings.append(ring)
    # 링 하나하나를 독립 폴리곤으로 (구멍은 nonzero 채우기에서 방향으로 처리됨)
    return [[r] for r in rings]


# ─────────────────────────────────────────────────────────────
# 단순화 (Douglas–Peucker)
# ─────────────────────────────────────────────────────────────
def dp(pts, tol):
    if len(pts) < 3:
        return pts
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x0, y0), (x1, y1) = pts[i], pts[j]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1.0, -1
        for k in range(i + 1, j):
            x, y = pts[k]
            d = abs(dy * (x - x0) - dx * (y - y0)) / L
            if d > best:
                best, bi = d, k
        if best > tol:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def to_path(polys, proj, tol):
    out = []
    for poly in polys:
        for ring in poly:
            pts = [proj(p) for p in ring]
            x0, y0, x1, y1 = bbox(pts)
            if math.hypot(x1 - x0, y1 - y0) < MIN_RING:
                continue
            if pts[0] == pts[-1]:
                pts = pts[:-1]
            # 닫힌 링은 시작점에서 가장 먼 점으로 나눠 두 번 단순화 (양 끝이 같으면 거리 계산이 안 됨)
            far = max(range(len(pts)), key=lambda k: (pts[k][0] - pts[0][0]) ** 2 + (pts[k][1] - pts[0][1]) ** 2)
            s = dp(pts[:far + 1], tol)[:-1] + dp(pts[far:] + [pts[0]], tol)[:-1]
            if len(s) < 3:
                continue
            out.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in s) + "Z")
    return "".join(out)


def label_of(polys, proj):
    """가장 큰 링의 무게중심"""
    ring = max((r for p in polys for r in p[:1]), key=ring_area)
    pts = [proj(p) for p in ring]
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
        c = x0 * y1 - x1 * y0
        a += c
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    if abs(a) < 1e-9:
        x0, y0, x1, y1 = bbox(pts)
        return [round((x0 + x1) / 2, 1), round((y0 + y1) / 2, 1)]
    return [round(cx / (3 * a), 1), round(cy / (3 * a), 1)]


def mainland(all_polys):
    """본토 묶음만 남기는 필터 — 작은 섬 묶음이 멀리 떨어져 있으면 지도 범위에서 뺀다"""
    rings = [(bbox(p[0]), ring_area(p[0]), id(p)) for p in all_polys]
    rings = [r for r in rings if r[1] > 2e5]   # 0.2 km² 미만 섬은 묶음 판단에서 제외
    n = len(rings)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    order = sorted(range(n), key=lambda i: rings[i][0][0])
    for a_i, a in enumerate(order):
        ax0, ay0, ax1, ay1 = rings[a][0]
        for b in order[a_i + 1:]:
            bx0, by0, bx1, by1 = rings[b][0]
            if bx0 - ax1 > ISLAND_GAP:
                break
            gy = max(0, by0 - ay1, ay0 - by1)
            gx = max(0, bx0 - ax1, ax0 - bx1)
            if math.hypot(gx, gy) <= ISLAND_GAP:
                parent[find(a)] = find(b)
    area = defaultdict(float)
    for i in range(n):
        area[find(i)] += rings[i][1]
    total = sum(area.values())
    big = max(area, key=area.get)
    keep_roots = {r for r, a in area.items() if r == big or a >= 0.1 * total}
    return {rings[i][2] for i in range(n) if find(i) in keep_roots}


def fetch(url, tmp):
    path = tmp / url.rsplit("/", 1)[1]
    if not path.exists():
        r = requests.get(url, timeout=180)
        r.raise_for_status()
        path.write_bytes(r.content)
    return pq.read_table(path).to_pandas()


def add_areas(units, emd_rows):
    """구 없는 시(·광역시 군)에 생활권 단위를 붙인다"""
    by_sgg = defaultdict(list)
    for r in emd_rows:
        by_sgg[r.sggcd].append(r)
    n = 0
    for uid, u in list(units.items()):
        if u["level"] != 2 or any(k["parent"] == uid for k in units.values()):
            continue
        if not (u["name"].endswith("시") or (u["name"].endswith("군") and uid[:2] in METRO_GUN)):
            continue
        rows = by_sgg.get(uid, [])
        areas = areas_of(uid, u["name"], [r.emdnm for r in rows])
        if not areas:
            continue
        geo = {r.emdnm: parse_wkb(r.geom) for r in rows}
        for i, (name, emds) in enumerate(areas.items(), 1):
            units[f"{uid}_{i:02d}"] = dict(
                name=name, full=f"{u['name']} {name}", level=3, parent=uid, kind="area", emds=sorted(emds),
                polys=dissolve([p for e in emds for p in geo[e]]),
            )
        n += 1
    return n


def main():
    tmp = Path(tempfile.gettempdir()) / "reant_house"
    tmp.mkdir(parents=True, exist_ok=True)
    df = fetch(SRC, tmp)
    emd = defaultdict(list)
    for row in fetch(EMD_SRC, tmp).itertuples():
        emd[row.sidocd].append(row)

    by_sido = defaultdict(list)
    for row in df.itertuples():
        by_sido[row.sidocd].append(row)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for sd, rows in by_sido.items():
        if sd not in SIDO:
            print(f"  ? 알 수 없는 시도 {sd}", file=sys.stderr)
            continue
        fid, ko = SIDO[sd]
        units = {}
        for r in rows:
            polys = parse_wkb(r.geom)
            m = re.match(r"^(.+시)(.+구)$", r.sggnm)
            if r.sggcd[-1] != "0" and m:
                units[r.sggcd] = dict(name=m.group(2), full=r.sggnm, level=3, parent=r.sggcd[:4] + "0", polys=polys)
                units.setdefault(r.sggcd[:4] + "0", dict(name=m.group(1), full=m.group(1), level=2, parent=None, polys=None))
            elif sd == "12" and r.sggcd in GWANGJU_GU:
                units[r.sggcd] = dict(name=r.sggnm, full=f"광주 {r.sggnm}", level=3, parent=GWANGJU_UID, polys=polys)
                units.setdefault(GWANGJU_UID, dict(name="광주", full="광주", level=2, parent=None, polys=None))
            else:
                units[r.sggcd] = dict(name=r.sggnm, full=r.sggnm, level=2, parent=None, polys=polys)
        for uid, u in units.items():
            if u["polys"] is None:
                kids = [k["polys"] for k in units.values() if k["parent"] == uid]
                u["polys"] = dissolve([p for ps in kids for p in ps])
        n_area = add_areas(units, emd[sd])

        # 지도 범위: 2단계 단위의 본토 묶음
        l2 = [p for uid, u in units.items() if u["level"] == 2 and uid not in BBOX_EXCLUDE for p in u["polys"]]
        keep = mainland(l2)
        pts = [pt for p in l2 if id(p) in keep for pt in p[0]]
        x0, y0, x1, y1 = bbox(pts)
        s = (WIDTH - 2 * PAD) / (x1 - x0)
        height = round((y1 - y0) * s + 2 * PAD)
        proj = lambda p: ((p[0] - x0) * s + PAD, (y1 - p[1]) * s + PAD)

        out_units = {}
        for uid, u in sorted(units.items()):
            polys = [p for p in u["polys"] if u["level"] == 3 or uid in BBOX_EXCLUDE or id(p) in keep or ring_area(p[0]) <= 2e5]
            # 본토 범위 밖 작은 섬 제거 (2단계에서 뺀 섬과 같은 기준)
            polys = [p for p in polys if not (bbox(p[0])[2] < x0 or bbox(p[0])[0] > x1 or bbox(p[0])[3] < y0 or bbox(p[0])[1] > y1)]
            if not polys:
                out_units[uid] = dict(name=u["name"], full=u["full"], level=u["level"], parent=u["parent"], d=None, label=None, bbox=None)
                continue
            d = to_path(polys, proj, TOL[u["level"]])
            bpts = [proj(pt) for p in polys for pt in p[0]]
            bx0, by0, bx1, by1 = bbox(bpts)
            out_units[uid] = dict(
                name=u["name"], full=u["full"], level=u["level"], parent=u["parent"], d=d or None,
                label=label_of(polys, proj), bbox=[round(bx0, 1), round(by0, 1), round(bx1 - bx0, 1), round(by1 - by0, 1)],
            )
            if u.get("kind"):
                out_units[uid].update(kind=u["kind"], emds=u["emds"])
        out = {
            "id": fid, "ko": ko, "source": f"vuski/admdongkor sgg·emd_{VER} (MIT)",
            "viewBox": [0, 0, WIDTH, height], "units": out_units,
        }
        p = OUT_DIR / f"geo_{fid}.json"
        p.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        n2 = sum(1 for u in out_units.values() if u["level"] == 2)
        n3 = sum(1 for u in out_units.values() if u["level"] == 3 and not u.get("kind"))
        na = sum(1 for u in out_units.values() if u.get("kind") == "area")
        print(f"  ✅ {ko}: 시군구 {n2} · 구 {n3} · 생활권 {na}({n_area}개 시군) · {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
