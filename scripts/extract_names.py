import pandas as pd
import json
import re
from pathlib import Path

# ✅ 경로만 하민 프로젝트에 맞게 수정
CSV_PATH = Path("processed/all_data_clean.csv")

# ✅ 컬럼명: 실제 CSV 헤더가 '종목명'인지 확인 필요
COL_NAME = "종목명"   # 예: '종목명' 또는 'ticker' 또는 'name'
DATE_COL = "날짜"     # optional (없으면 무시됨)

def looks_like_ticker(s: str) -> bool:
    """
    대충 ticker처럼 보이는지 판별:
    - 대문자/숫자/점/하이픈 조합
    - 길이 1~10 정도
    """
    if not isinstance(s, str):
        return False
    s = s.strip()
    if len(s) < 1 or len(s) > 12:
        return False
    return bool(re.fullmatch(r"[A-Z0-9.\-]{1,12}", s))

def main():
    df = pd.read_csv(CSV_PATH)

    if COL_NAME not in df.columns:
        raise ValueError(f"'{COL_NAME}' 컬럼이 없습니다. 현재 컬럼: {list(df.columns)}")

    # 종목명 유니크 값 추출
    raw_names = (
        df[COL_NAME]
        .dropna()
        .astype(str)
        .str.strip()
        .unique()
        .tolist()
    )
    raw_names_sorted = sorted(raw_names)

    # ticker처럼 보이는 값/아닌 값 나눠보기
    ticker_like = [x for x in raw_names_sorted if looks_like_ticker(x)]
    non_ticker_like = [x for x in raw_names_sorted if not looks_like_ticker(x)]

    print(f"총 유니크 '{COL_NAME}' 개수:", len(raw_names_sorted))
    print(f"ticker처럼 보이는 값:", len(ticker_like))
    print(f"ticker 아닌(원천 이름 가능성):", len(non_ticker_like))

    # 샘플 출력
    print("\n[ticker-like 샘플 20개]")
    for x in ticker_like[:20]:
        print(" -", x)

    print("\n[non-ticker-like 샘플 20개]")
    for x in non_ticker_like[:20]:
        print(" -", x)

    # ✅ 매핑 템플릿 생성
    # 1) 종목명이 ticker라면: ticker -> displayName 템플릿
    ticker_name_map = {t: "" for t in ticker_like}

    # 2) 종목명이 원천 풀네임이라면: rawName -> displayName 템플릿
    raw_name_alias = {n: "" for n in non_ticker_like}

    out_dir = Path("public/data")
    out_dir.mkdir(parents=True, exist_ok=True)

    (out_dir / "ticker_name_map.template.json").write_text(
        json.dumps(ticker_name_map, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    (out_dir / "name_alias.template.json").write_text(
        json.dumps(raw_name_alias, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )

    print("\n✅ 생성 완료:")
    print(" - public/data/ticker_name_map.template.json")
    print(" - public/data/name_alias.template.json")
    print("\n→ 둘 중 실제로 쓸 파일만 골라서 값 채우면 됩니다.")

if __name__ == "__main__":
    main()
