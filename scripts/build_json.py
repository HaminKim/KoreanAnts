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

def num_or_none(x):
    return None if pd.isna(x) else float(x)

def write(p, o):
    p.write_text(json.dumps(o, ensure_ascii=False, indent=2), encoding="utf-8")

# TOP JSON  (✅ 거래일 기준)
all_dates = sorted(df[DATE].dropna().dt.normalize().unique())

for days in DAYS:
    if len(all_dates) == 0:
        continue

    use_dates = all_dates[-days:] if len(all_dates) >= days else all_dates[:]
    start = pd.to_datetime(use_dates[0]).strftime("%Y-%m-%d")
    end = pd.to_datetime(use_dates[-1]).strftime("%Y-%m-%d")

    window = df[df[DATE].dt.normalize().isin(use_dates)].copy()

    # ✅ 최근 n거래일 "순매수 합"으로 랭킹 산출
    agg = (
        window.groupby(NAME, as_index=False)[NET]
        .sum()
        .sort_values(NET, ascending=False)
        .reset_index(drop=True)
    )

    buy = agg.head(200)
    sell = agg.sort_values(NET, ascending=True).head(200)

    write(TOP_DIR / f"netBuy_{days}.json", {
        "asOf": end,
        "days": days,
        "range": {"start": start, "end": end, "count": len(use_dates)},
        "items": [
            {"rank": i+1, "ticker": r[NAME], "value": float(r[NET])}
            for i, r in buy.iterrows()
        ]
    })

    write(TOP_DIR / f"netSell_{days}.json", {
        "asOf": end,
        "days": days,
        "range": {"start": start, "end": end, "count": len(use_dates)},
        "items": [
            {"rank": i+1, "ticker": r[NAME], "value": float(r[NET])}
            for i, r in sell.iterrows()
        ]
    })

# FLOW JSON
def num_or_none(x):
    try:
        if pd.isna(x):
            return None
        return float(x)
    except:
        return None


for name, g in df.sort_values(DATE).groupby(NAME):
    series = []
    for _, r in g.iterrows():
        series.append({
            "date": r[DATE].strftime("%Y-%m-%d"),
            "net": num_or_none(r[NET]),
            "ma5": num_or_none(r.get(MA5)),
            "ma10": num_or_none(r.get(MA10)),
            "ma20": num_or_none(r.get(MA20)),
        })

    safe = name.replace("/", "_")
    write(
        FLOW_DIR / f"{safe}_all.json",
        {
            "ticker": name,
            "series": series
        }
    )
