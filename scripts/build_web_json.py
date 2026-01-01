import os
import json
import re
import pandas as pd

# ===============================
# 설정값
# ===============================
CSV_PATH = "processed/all_data_clean.csv"

OUT_TOP = "public/data/top10"
OUT_FLOW = "public/data/flow"
OUT_MAP = "public/data/ticker_map.json"

DAYS_LIST = [1, 5, 10, 20, 30, 40, 60]
SIDES = ["netBuy", "netSell"]
TOP_MAX = 40  # 홈에서 10/20/30/40으로 잘라 씀

# ===============================
# 유틸
# ===============================
def ensure_dir(path: str):
    os.makedirs(path, exist_ok=True)

def safe_name(s: str) -> str:
    """파일명으로 안전하게"""
    s = str(s).strip()
    s = re.sub(r'[\\/:*?"<>|]+', "_", s)
    return s[:120]

# ===============================
# 메인
# ===============================
def main():
    ensure_dir(OUT_TOP)
    ensure_dir(OUT_FLOW)

    df = pd.read_csv(CSV_PATH)

    # 컬럼 정리
    df["날짜"] = pd.to_datetime(df["날짜"]).dt.strftime("%Y-%m-%d")
    df["종목명"] = df["종목명"].astype(str).str.upper()

    for col in ["매수", "매도", "순매수", "MA5", "MA10", "MA20"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    all_dates = sorted(df["날짜"].unique())

    ticker_map = {}

    # ======================================================
    # 1) TOP JSON 생성 (기간별 / 순매수·순매도 / TOP40)
    # ======================================================
    for days in DAYS_LIST:
        recent_dates = set(all_dates[-days:])
        dfx = df[df["날짜"].isin(recent_dates)].copy()

        grouped = (
            dfx.groupby("종목명", as_index=False)["순매수"]
            .sum()
            .rename(columns={"순매수": "value"})
        )

        for side in SIDES:
            if side == "netBuy":
                top = grouped.sort_values("value", ascending=False).head(TOP_MAX)
            else:
                top = grouped.sort_values("value", ascending=True).head(TOP_MAX)

            items = []
            for i, row in top.reset_index(drop=True).iterrows():
                ticker = row["종목명"]
                file_ticker = safe_name(ticker)

                ticker_map[ticker] = file_ticker

                items.append({
                    "rank": int(i + 1),
                    "ticker": ticker,
                    "fileTicker": file_ticker,
                    "value": float(row["value"]) if pd.notna(row["value"]) else 0.0,
                })

            payload = {
                "side": side,
                "days": days,
                "items": items,
            }

            out_path = os.path.join(OUT_TOP, f"{side}_{days}.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False)

    # ======================================================
    # 2) FLOW JSON 생성 (종목당 1개, 전체 기간)
    # ======================================================
    for ticker in sorted(df["종목명"].unique()):
        file_ticker = safe_name(ticker)
        ticker_map[ticker] = file_ticker

        one = df[df["종목명"] == ticker].sort_values("날짜")

        series = []
        for _, r in one.iterrows():
            series.append({
                "date": r["날짜"],
                "net": float(r["순매수"]) if pd.notna(r["순매수"]) else 0.0,
                "ma5": float(r["MA5"]) if pd.notna(r.get("MA5")) else None,
                "ma10": float(r["MA10"]) if pd.notna(r.get("MA10")) else None,
                "ma20": float(r["MA20"]) if pd.notna(r.get("MA20")) else None,
            })

        payload = {
            "meta": {
                "ticker": ticker,
                "fileTicker": file_ticker,
                "points": len(series),
            },
            "series": series,
        }

        out_path = os.path.join(OUT_FLOW, f"{file_ticker}_all.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False)

    # ======================================================
    # 3) ticker_map 저장
    # ======================================================
    ensure_dir(os.path.dirname(OUT_MAP))
    with open(OUT_MAP, "w", encoding="utf-8") as f:
        json.dump(ticker_map, f, ensure_ascii=False)

    print("✅ build_web_json 완료")
    print(f"- TOP: {OUT_TOP}")
    print(f"- FLOW: {OUT_FLOW}")
    print(f"- MAP: {OUT_MAP}")

# ===============================
if __name__ == "__main__":
    main()
