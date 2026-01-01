import pandas as pd
import json
from pathlib import Path

CSV = Path("processed/all_data_clean.csv")
TOP_DIR = Path("public/data/top10")
FLOW_DIR = Path("public/data/flow")

DATE = "날짜"
NAME = "종목명"
NET = "순매수"
MA5, MA10, MA20 = "MA5", "MA10", "MA20"
DAYS = [1, 5, 10, 20, 30, 40, 60]

TOP_DIR.mkdir(parents=True, exist_ok=True)
FLOW_DIR.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(CSV)
df[DATE] = pd.to_datetime(df[DATE])

latest = df[DATE].max()
latest_df = df[df[DATE] == latest]

def write(p, o):
    p.write_text(json.dumps(o, ensure_ascii=False, indent=2), encoding="utf-8")

# TOP JSON
for days in DAYS:
    buy = latest_df.sort_values(NET, ascending=False).head(200)
    sell = latest_df.sort_values(NET, ascending=True).head(200)

    write(TOP_DIR / f"netBuy_{days}.json", {
        "asOf": latest.strftime("%Y-%m-%d"),
        "days": days,
        "items": [
            {"rank": i+1, "ticker": r[NAME], "value": float(r[NET])}
            for i, r in buy.iterrows()
        ]
    })

    write(TOP_DIR / f"netSell_{days}.json", {
        "asOf": latest.strftime("%Y-%m-%d"),
        "days": days,
        "items": [
            {"rank": i+1, "ticker": r[NAME], "value": float(r[NET])}
            for i, r in sell.iterrows()
        ]
    })

# FLOW JSON
for name, g in df.sort_values(DATE).groupby(NAME):
    series = []
    for _, r in g.iterrows():
        series.append({
            "date": r[DATE].strftime("%Y-%m-%d"),
            "net": float(r[NET]),
            "ma5": r.get(MA5),
            "ma10": r.get(MA10),
            "ma20": r.get(MA20),
        })
    safe = name.replace("/", "_")
    write(FLOW_DIR / f"{safe}_all.json", {"ticker": name, "series": series})
