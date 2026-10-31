"""
수도권 전철 노선·역 → 단지별 지도에 겹쳐 그릴 선과 역 (public/data/house/subway.json). 노선이 바뀔 때만 다시 실행.

  py scripts/house/build_subway.py

원천: OpenStreetMap (Overpass API, ODbL — 화면에 '© OpenStreetMap' 표시) 의 route=subway/light_rail/train 관계 중
      network 에 '수도권 전철' 이 있거나 우이신설선(ref W). 노선 색은 관계의 colour 태그
출력
  lines    [{n: 이름, c: 색, p: [[[lat, lng], ...], ...]}]   (같은 노선의 상·하행·지선 선로는 한 번만)
  stations [{n: 역 이름, la, lo, c: [노선 색...]}]            (같은 이름 역은 300m 안이면 하나로 — 환승역)
"""
import json
import math
import sys
import time
from collections import defaultdict
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_local_map import dp  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "public" / "data" / "house" / "subway.json"
BBOX = (36.9, 126.3, 38.3, 127.9)   # 수도권 + 천안·춘천 방면 끝 (지도에선 구 안만 보임)
MIRRORS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]
TOL = 8              # 선 단순화 (m)
MERGE = 300          # 같은 이름 역을 하나로 볼 거리 (m)
STOP_ROLES = {"stop", "stop_entry_only", "stop_exit_only", "station"}

# 화면에 쓸 짧은 노선 이름 (ref → 이름). 없으면 관계 이름 앞부분
SHORT = {str(i): f"{i}호선" for i in range(1, 10)} | {
    "인천1": "인천1호선", "I2": "인천2호선", "W": "우이신설선", "Silim": "신림선", "U": "의정부경전철", "E": "용인경전철",
    "경의·중앙": "경의중앙선", "수인·분당": "수인분당선", "공항철도": "공항철도", "경춘": "경춘선", "경강": "경강선",
    "신분당": "신분당선", "서해": "서해선", "GTX-A": "GTX-A", "김포 골드라인": "김포골드라인", "용인": "용인경전철",
}


def log(msg):
    print(msg, flush=True)


def overpass(q):
    for i in range(6):
        url = MIRRORS[i % len(MIRRORS)]
        try:
            r = requests.post(url, data={"data": q}, headers={"User-Agent": "reant-build/1.0"}, timeout=200)
            if r.ok and r.text.lstrip().startswith("{"):
                return r.json()["elements"]
            log(f"  ⚠️ {url} {r.status_code}")
        except requests.RequestException as e:
            log(f"  ⚠️ {url} {e}")
        time.sleep(10)
    raise SystemExit("Overpass 응답 없음")


def meters(la0):
    kx = 111_320 * math.cos(math.radians(la0))
    return lambda p: (p[1] * kx, p[0] * 110_540)


def chain(segs):
    """끝점이 같은 선로 조각을 이어 붙여 선 개수를 줄임"""
    key = lambda p: (round(p[0], 6), round(p[1], 6))  # noqa: E731
    segs = [list(s) for s in segs]
    ends = defaultdict(list)
    for i, s in enumerate(segs):
        ends[key(s[0])].append(i)
        ends[key(s[-1])].append(i)
    used, out = set(), []
    for i in range(len(segs)):
        if i in used:
            continue
        used.add(i)
        line = segs[i]
        for forward in (True, False):
            while True:
                tip = key(line[-1] if forward else line[0])
                nxt = next((j for j in ends[tip] if j not in used), None)
                if nxt is None:
                    break
                used.add(nxt)
                s = segs[nxt]
                if forward:
                    line = line + (s[1:] if key(s[0]) == tip else s[::-1][1:])
                else:
                    line = (s[:-1] if key(s[-1]) == tip else s[::-1][:-1]) + line
        out.append(line)
    return out


def main():
    s, w, n, e = BBOX
    route = '"route"~"^(subway|light_rail|train)$"'
    log("· 노선 관계 받는 중 (Overpass)")
    rels = overpass(f'[out:json][timeout:180];rel[{route}]({s},{w},{n},{e});out geom;')
    rels = [r for r in rels if "수도권 전철" in r["tags"].get("network", "") or r["tags"].get("ref") == "W"]
    log(f"  관계 {len(rels)}개")
    log("· 역 이름 받는 중")
    nodes = overpass(f'[out:json][timeout:180];rel[{route}]({s},{w},{n},{e});node(r)["name"];out;')
    name_of = {nd["id"]: nd["tags"].get("name:ko") or nd["tags"]["name"] for nd in nodes}
    pos_of = {nd["id"]: (nd["lat"], nd["lon"]) for nd in nodes}

    lines = {}
    stops = []
    for r in rels:
        t = r["tags"]
        ref = t.get("ref") or t.get("name", "").split(":")[0].strip()
        ln = lines.setdefault(ref, {"n": SHORT.get(ref, ref), "c": t.get("colour", "#888888"), "ways": {}})
        for m in r["members"]:
            if m["type"] == "way" and m.get("role", "") in ("", "forward", "backward") and "geometry" in m:
                ln["ways"].setdefault(m["ref"], [(g["lat"], g["lon"]) for g in m["geometry"] if g])
            elif m["type"] == "node" and m.get("role", "") in STOP_ROLES and m["ref"] in name_of:
                stops.append((name_of[m["ref"]], pos_of[m["ref"]], ln["c"]))

    to_m = meters((s + n) / 2)
    out_lines = []
    for ln in lines.values():
        paths = []
        for p in chain(ln["ways"].values()):
            xy = [to_m(q) for q in p]
            # 순환선(2호선)처럼 처음과 끝이 같은 선은 반으로 나눠 단순화 (안 그러면 두 점만 남음)
            h = len(xy) // 2
            keep = set(map(tuple, dp(xy[:h + 1], TOL) + dp(xy[h:], TOL)))
            sp = [[round(q[0], 5), round(q[1], 5)] for q, m in zip(p, xy) if tuple(m) in keep]
            if len(sp) >= 2:
                paths.append(sp)
        if paths:
            out_lines.append({"n": ln["n"], "c": ln["c"], "p": paths})
            log(f"  {ln['n']:<10} {ln['c']}  선 {len(paths)}")

    # 역: 이름 끝 '역' 정리, 같은 이름 MERGE 안이면 하나로 (환승역은 색 여러 개)
    st = []
    for name, (la, lo), c in stops:
        name = name.removesuffix("역") if len(name) > 2 else name
        x, y = to_m((la, lo))
        hit = next((a for a in st if a["n"] == name and math.hypot(a["x"] - x, a["y"] - y) < MERGE), None)
        if hit is None:
            st.append({"n": name, "x": x, "y": y, "pts": [(la, lo)], "c": [c]})
        else:
            hit["pts"].append((la, lo))
            if c not in hit["c"]:
                hit["c"].append(c)
    stations = [{"n": a["n"], "la": round(sum(p[0] for p in a["pts"]) / len(a["pts"]), 5),
                 "lo": round(sum(p[1] for p in a["pts"]) / len(a["pts"]), 5), "c": a["c"]} for a in st]

    OUT.write_text(json.dumps({"source": "© OpenStreetMap contributors (ODbL)", "lines": out_lines, "stations": stations},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log(f"✅ 노선 {len(out_lines)} · 역 {len(stations)} · {OUT.stat().st_size // 1024} KB → {OUT}")


if __name__ == "__main__":
    main()
