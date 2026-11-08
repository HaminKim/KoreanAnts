"""매일 자동 작업 점검 → 실패하면 한 번 다시 돌리고 → 결과를 메일로 보고.

.github/workflows/health-check.yml 에서 매일 11:00 KST 실행 (10:30 예약 배포 뒤).

점검
  1. 워크플로 3개(매매흐름 수집·매크로/부동산·예약 배포)의 최근 24시간 실행 결과
  2. 데이터가 제때 들어왔는지 (작업이 '성공'이어도 continue-on-error 로 조용히 실패할 수 있어서)
     - 매매흐름 원본: 오늘 전 마지막 한국 영업일까지
     - 개미지수 누적: 원본 마지막 날 − 2영업일 (Seibro T+2)
     - 매크로·부동산·S&P: 26시간 안에 다시 만들어졌는지
  3. 실제 사이트(reant.kr)가 열리고, 레포 데이터가 배포됐는지
재시도
  - 데이터가 늦거나 마지막 실행이 실패한 작업은 workflow_dispatch 로 1번 다시 돌리고 끝날 때까지 기다림
  - 다시 돌린 게 있거나 사이트가 레포보다 뒤처지면 예약 배포도 다시 돌리고 사이트 반영을 기다림
  - 그래도 안 되면 실패 로그 끝부분을 메일에 붙임

환경변수: GITHUB_TOKEN, GITHUB_REPOSITORY, GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO(없으면 GMAIL_USER)
로컬 시험: py scripts/health/check.py --dry-run  (재시도·메일 없이 점검만)
"""
from __future__ import annotations

import ast
import csv
import json
import os
import re
import smtplib
import sys
import time
from datetime import date, datetime, timedelta, timezone
from email.mime.text import MIMEText
from pathlib import Path

import requests

REPO = os.environ.get("GITHUB_REPOSITORY", "HaminKim/KoreanAnts")
SITE = "https://www.reant.kr"
API = f"https://api.github.com/repos/{REPO}"
KST = timezone(timedelta(hours=9))
DRY = "--dry-run" in sys.argv

S = requests.Session()
S.headers["Accept"] = "application/vnd.github+json"
if os.environ.get("GITHUB_TOKEN"):
    S.headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"

WORKFLOWS = {
    "daily-sync.yml": "매매흐름 수집",
    "macro-sync.yml": "매크로·부동산 갱신",
    "deploy-daily.yml": "예약 배포",
}
PAGES = ["/", "/ants", "/macro", "/house", "/watchlist"]


def log(*a):
    print(*a, flush=True)


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def kst(dt: datetime) -> str:
    return dt.astimezone(KST).strftime("%m/%d %H:%M")


# ── GitHub API ──────────────────────────────────────────────
def gh(endpoint: str, **params):
    r = S.get(f"{API}{endpoint}", params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def runs(wf: str, **params) -> list[dict]:
    return gh(f"/actions/workflows/{wf}/runs", per_page=30, **params)["workflow_runs"]


def error_tail(run: dict, n: int = 25) -> str:
    """실패한 실행의 로그에서 에러 근처 줄만 뽑음."""
    try:
        jobs = gh(f"/actions/runs/{run['id']}/jobs")["jobs"]
        out = []
        for j in jobs:
            bad = [s["name"] for s in j["steps"] if s["conclusion"] == "failure"]
            if not bad and j["conclusion"] == "success":
                continue
            out.append(f"[{j['name']}] 실패 단계: {', '.join(bad) or '-'}")
            r = S.get(f"{API}/actions/jobs/{j['id']}/logs", timeout=60)
            if r.ok:
                lines = [re.sub(r"^\S+Z ", "", x) for x in r.text.splitlines()]
                k = next((i for i, x in enumerate(lines) if "##[error]" in x or "Traceback" in x), len(lines))
                out += lines[max(0, k - n): k + 8]
        return "\n".join(out)[-4000:]
    except Exception as e:  # 로그를 못 받아도 보고는 보냄
        return f"(로그를 못 가져옴: {e})"


def dispatch_and_wait(wf: str, timeout_min: int = 60) -> dict | None:
    started = now()
    r = S.post(f"{API}/actions/workflows/{wf}/dispatches", json={"ref": "main"}, timeout=30)
    if r.status_code != 204:
        log(f"  ✗ {wf} 재실행 요청 실패: {r.status_code} {r.text[:200]}")
        return None
    log(f"  ↻ {wf} 재실행 요청")
    run = None
    deadline = time.time() + timeout_min * 60
    while time.time() < deadline:
        time.sleep(20)
        if run is None:
            cand = [x for x in runs(wf, event="workflow_dispatch") if iso(x["created_at"]) >= started - timedelta(seconds=30)]
            run = cand[-1] if cand else None
            continue
        run = gh(f"/actions/runs/{run['id']}")
        if run["status"] == "completed":
            log(f"  → {run['conclusion']}  {run['html_url']}")
            return run
    log(f"  ✗ {wf} {timeout_min}분 안에 안 끝남")
    return run


# ── 데이터 점검 ─────────────────────────────────────────────
def repo_text(rel: str) -> str:
    """main 의 최신 파일 (레포 전체를 받지 않으려고 API 로 읽음)"""
    r = S.get(f"{API}/contents/{rel}", params={"ref": "main"}, timeout=60,
              headers={"Accept": "application/vnd.github.raw"})
    r.raise_for_status()
    r.encoding = "utf-8"
    return r.text.lstrip("﻿")


def kr_holidays() -> set[date]:
    src = repo_text("scraper/find_missing_days.py")
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", "") == "HOLIDAYS" for t in node.targets):
            return {date.fromisoformat(d) for d in ast.literal_eval(node.value)}
    return set()


def prev_bday(d: date, n: int = 1, holidays: set[date] = frozenset()) -> date:
    while n:
        d -= timedelta(days=1)
        if d.weekday() < 5 and d not in holidays:
            n -= 1
    return d


def read_json(rel: str):
    return json.loads(repo_text(rel))


def check_data() -> list[dict]:
    """[{name, ok, detail, wf}]  wf = 늦으면 다시 돌릴 워크플로"""
    out = []
    today = now().astimezone(KST).date()

    # 매매흐름 원본
    rows = csv.reader(repo_text("processed/all_data_clean.csv").splitlines())
    last = max(r[0] for r in rows if r and re.match(r"\d{4}-\d{2}-\d{2}$", r[0]))
    last_d = date.fromisoformat(last)
    want = prev_bday(today, 1, kr_holidays())
    out.append(dict(name="매매흐름 원본(Seibro)", ok=last_d >= want, wf="daily-sync.yml",
                    detail=f"마지막 {last} / 기대 {want}"))

    # 개미지수 누적 (원본 − 2영업일, generate_ant_cumulative 는 휴일 없이 BusinessDay)
    ac = read_json("public/data/flow/ant_cumulative.json")["asOf"]
    want_ac = prev_bday(last_d, 2).isoformat()
    out.append(dict(name="개미지수 누적 순매수", ok=ac == want_ac, wf="daily-sync.yml",
                    detail=f"asOf {ac} / 기대 {want_ac}"))

    # 매크로·부동산·S&P (07:10 KST 빌드)
    for name, rel in [("매크로 지표", "public/data/macro/catalog.json"),
                      ("부동산", "public/data/house/catalog.json"),
                      ("S&P·지수(랜딩)", "public/data/market/landing.json")]:
        g = iso(read_json(rel)["generatedAt"])
        age = (now() - g).total_seconds() / 3600
        detail = f"생성 {kst(g)} ({age:.0f}시간 전)"
        if rel.endswith("landing.json"):
            spx = read_json(rel)["index"]["SPX"]["d"][-1]
            detail += f", S&P 마지막 {spx}"
        out.append(dict(name=name, ok=age <= 26, wf="macro-sync.yml", detail=detail))
    return out


def check_site() -> list[dict]:
    out = []
    bad = []
    for p in PAGES:
        try:
            c = S.get(SITE + p, timeout=30, headers={"Accept": "text/html"}).status_code
        except Exception as e:
            c = str(e)[:60]
        if c != 200:
            bad.append(f"{p}={c}")
    out.append(dict(name="사이트 접속", ok=not bad, wf=None,
                    detail="모든 페이지 200" if not bad else ", ".join(bad)))

    # 레포 데이터가 배포됐는지 (마지막 배포 커밋 이전에 바뀐 데이터는 사이트에 있어야 함)
    try:
        last_deploy = next((c for c in gh("/commits", sha="main", per_page=60)
                            if c["commit"]["message"].startswith("chore(deploy)") or "[deploy]" in c["commit"]["message"]), None)
        dep_t = iso(last_deploy["commit"]["committer"]["date"]) if last_deploy else None
    except Exception:
        dep_t = None
    for name, rel, key in [("사이트 반영: 개미지수", "public/data/flow/ant_cumulative.json", "asOf"),
                           ("사이트 반영: 매크로", "public/data/macro/catalog.json", "generatedAt")]:
        repo_v = read_json(rel)[key]
        try:
            live_v = S.get(f"{SITE}/{rel.removeprefix('public/')}", timeout=30).json()[key]
        except Exception as e:
            live_v = f"못 읽음({str(e)[:40]})"
        if live_v == repo_v:
            out.append(dict(name=name, ok=True, wf=None, detail=f"{live_v}"))
            continue
        # 레포 쪽 변경이 마지막 배포보다 뒤면 다음 배포 대기 (정상)
        try:
            ch = gh("/commits", sha="main", path=rel, per_page=1)[0]
            ch_t = iso(ch["commit"]["committer"]["date"])
        except Exception:
            ch_t = None
        # 마지막 배포 뒤에 바뀐 지 1시간 안이면 다음 배포 대기(정상). 그보다 오래면 예약 배포가 밀리거나 실패한 것
        pending = bool(dep_t and ch_t and ch_t > dep_t and now() - ch_t < timedelta(hours=1))
        why = "다음 배포 대기" if pending else (
            f"레포 반영 {kst(ch_t)} 뒤로 배포 없음" if dep_t and ch_t and ch_t > dep_t else "배포했는데 사이트에 안 보임")
        out.append(dict(name=name, ok=pending, wf=None if pending else "deploy-daily.yml",
                        detail=f"사이트 {live_v} / 레포 {repo_v} ({why})"))
    return out


def check_runs() -> list[dict]:
    out = []
    since = now() - timedelta(hours=24)
    for wf, label in WORKFLOWS.items():
        rs = [r for r in runs(wf) if iso(r["created_at"]) >= since and r["status"] == "completed"]
        fails = [r for r in rs if r["conclusion"] not in ("success", "skipped", "cancelled")]
        latest = rs[0] if rs else None
        ok = bool(rs) and (latest["conclusion"] == "success")
        detail = f"24시간 {len(rs)}번 실행, 실패 {len(fails)}번"
        if latest:
            detail += f", 마지막 {kst(iso(latest['created_at']))} {latest['conclusion']}"
        out.append(dict(name=f"작업: {label}", ok=ok, wf=wf, detail=detail,
                        run=latest if latest and not ok else None,
                        fails=[f"{kst(iso(r['created_at']))} {r['html_url']}" for r in fails]))
    return out


def check_all() -> list[dict]:
    items = []
    for fn in (check_runs, check_data, check_site):
        try:
            items += fn()
        except Exception as e:
            items.append(dict(name=f"점검 오류({fn.__name__})", ok=False, wf=None, detail=str(e)[:300]))
    return items


# ── 메인 ────────────────────────────────────────────────────
def main():
    first = check_all()
    for x in first:
        log(("✅" if x["ok"] else "❌"), x["name"], "-", x["detail"])

    retried: list[str] = []
    if not DRY:
        todo = []
        for x in first:
            if not x["ok"] and x.get("wf") and x["wf"] not in todo and x["wf"] != "deploy-daily.yml":
                todo.append(x["wf"])
        for wf in todo:
            r = dispatch_and_wait(wf)
            retried.append(f"{WORKFLOWS[wf]} → {r['conclusion'] if r else '시작 못 함'}" + (f" ({r['html_url']})" if r else ""))
        need_deploy = bool(todo) or any(not x["ok"] and x.get("wf") == "deploy-daily.yml" for x in first)
        if need_deploy:
            r = dispatch_and_wait("deploy-daily.yml", 15)
            retried.append(f"예약 배포 → {r['conclusion'] if r else '시작 못 함'}")
            log("  … Vercel 빌드 기다림 (최대 15분)")
            for _ in range(15):
                time.sleep(60)
                if all(x["ok"] for x in check_site()):
                    break

    final = check_all() if retried else first
    bad = [x for x in final if not x["ok"]]

    # 보고서
    d = now().astimezone(KST)
    status = "정상" if not bad else f"문제 {len(bad)}건"
    subject = f"[REANT] {d:%m/%d} 점검: {status}" + (" (재실행함)" if retried else "")
    lines = [f"REANT 매일 점검 — {d:%Y-%m-%d %H:%M} KST", ""]
    if retried:
        lines += ["■ 다시 돌린 작업"] + [f"  - {x}" for x in retried] + [""]
        fixed = [x["name"] for x in first if not x["ok"] and any(y["name"] == x["name"] and y["ok"] for y in final)]
        if fixed:
            lines += ["■ 재실행으로 해결", *[f"  - {n}" for n in fixed], ""]
    lines.append("■ 현재 상태")
    for x in final:
        lines.append(f"  {'✅' if x['ok'] else '❌'} {x['name']}: {x['detail']}")
        for f_ in x.get("fails") or []:
            lines.append(f"       실패: {f_}")
    for x in bad:
        if x.get("run"):
            lines += ["", f"■ {x['name']} 실패 로그 ({x['run']['html_url']})", error_tail(x["run"])]
    if bad:
        lines += ["", "→ 재실행으로도 안 된 항목이에요. Claude Code 에 이 메일 내용을 붙여서 원인 확인을 요청하세요."]
    body = "\n".join(lines)
    log("\n" + subject + "\n" + body)

    if summ := os.environ.get("GITHUB_STEP_SUMMARY"):
        Path(summ).write_text(f"## {subject}\n\n```\n{body}\n```\n", encoding="utf-8")

    user, pw = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD")
    if DRY:
        return
    if not (user and pw):
        log("⚠️ GMAIL_USER / GMAIL_APP_PASSWORD 없음 — 메일 생략")
        sys.exit(1)
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"], msg["From"], msg["To"] = subject, user, os.environ.get("MAIL_TO") or user
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as s:
        s.login(user, pw)
        s.send_message(msg)
    log("📧 메일 보냄")


if __name__ == "__main__":
    main()
