"""
시도 경계 GeoJSON → 화면용 SVG path (public/data/house/map.json). 경계가 바뀔 때만 다시 실행.

  python scripts/house/build_map.py

원천: 통계청(KOSTAT) 2013 센서스용 행정구역경계 (southkorea/southkorea-maps 단순화본, "Free to share or remix")
투영: 위도 36° 기준 등장방형(경도에 cos 보정) — 남한 범위에서는 왜곡이 작아 따로 지도 라이브러리를 쓰지 않는다.
"""
import json
import math
import sys
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from house_registry import REGIONS  # noqa: E402

SRC = "https://cdn.jsdelivr.net/gh/southkorea/southkorea-maps@master/kostat/2013/json/skorea_provinces_geo_simple.json"
OUT = HERE.parents[1] / "public" / "data" / "house" / "map.json"
WIDTH = 520
PAD = 8
MIN_STEP = 0.7     # 이보다 가까운 점은 생략 (px)
MIN_RING = 2.0     # 이보다 작은 섬은 생략 (px, 바운딩 박스 대각선)
KX = math.cos(math.radians(36))
# 라벨 겹침 보정 (px): 경기 중심이 서울 위에 오고, 세종은 면적이 작아 옆으로 뺀다
LABEL_NUDGE = {"gyeonggi": (26, 30), "sejong": (-16, -6)}


def main():
    geo = requests.get(SRC, timeout=60).json()
    by_geo = {r["geo"]: r for r in REGIONS}

    rings_all = []
    for f in geo["features"]:
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for ring in poly:
                rings_all += ring
    xs = [p[0] * KX for p in rings_all]
    ys = [-p[1] for p in rings_all]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    scale = (WIDTH - 2 * PAD) / (x1 - x0)
    height = round((y1 - y0) * scale + 2 * PAD)

    def proj(p):
        return ((p[0] * KX - x0) * scale + PAD, (-p[1] - y0) * scale + PAD)

    regions = {}
    for f in geo["features"]:
        reg = by_geo[f["properties"]["code"]]
        g = f["geometry"]
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        parts, cx, cy, area_best = [], 0, 0, -1
        for poly in polys:
            for ri, ring in enumerate(poly):
                pts = [proj(p) for p in ring]
                bx = [p[0] for p in pts]
                by = [p[1] for p in pts]
                if math.hypot(max(bx) - min(bx), max(by) - min(by)) < MIN_RING:
                    continue
                kept = [pts[0]]
                for p in pts[1:]:
                    if math.hypot(p[0] - kept[-1][0], p[1] - kept[-1][1]) >= MIN_STEP:
                        kept.append(p)
                if len(kept) < 3:
                    continue
                parts.append("M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in kept) + "Z")
                if ri == 0:   # 가장 큰 바깥 고리의 중심을 라벨 위치로
                    a = (max(bx) - min(bx)) * (max(by) - min(by))
                    if a > area_best:
                        area_best, cx, cy = a, sum(bx) / len(bx), sum(by) / len(by)
        dx, dy = LABEL_NUDGE.get(reg["id"], (0, 0))
        regions[reg["id"]] = {"d": "".join(parts), "label": [round(cx + dx, 1), round(cy + dy, 1)]}

    out = {
        "source": "통계청(KOSTAT) 2013 행정구역경계 · southkorea/southkorea-maps",
        "viewBox": [0, 0, WIDTH, height],
        "regions": regions,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"✅ {OUT} ({OUT.stat().st_size // 1024} KB, {len(regions)} 시도)")


if __name__ == "__main__":
    main()
