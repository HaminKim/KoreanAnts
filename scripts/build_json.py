import pandas as pd
import json
import os
from pathlib import Path

# 📂 경로 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE_DIR, '..', 'processed')
TOP_DIR = Path(os.path.join(BASE_DIR, '..', 'public', 'data', 'top10'))

TARGET_FILE = 'all_data_clean.csv'
CSV_PATH = os.path.join(CSV_DIR, TARGET_FILE)

# 상수 정의
DATE = "날짜"
NAME = "종목명"
NET = "순매수"
DAYS = [1, 5, 10, 20, 30, 40, 60]

def main():
    print("🏆 [Top 10] 랭킹 데이터 생성을 시작합니다...")
    
    # 폴더 생성
    TOP_DIR.mkdir(parents=True, exist_ok=True)

    # 1. CSV 읽기 (진단 키트 로직 이식)
    # 엑셀이 만든 'utf-8-sig'를 1순위로 둡니다.
    encodings = ['utf-8-sig', 'utf-8', 'cp949'] 
    df = None
    
    for enc in encodings:
        try:
            # 1차 시도: 탭(\t)으로 먼저 읽어보기
            temp_df = pd.read_csv(CSV_PATH, encoding=enc, sep='\t')
            
            # 컬럼이 1개밖에 없으면 "아, 탭이 아니구나" 하고 쉼표(,)로 재시도
            if len(temp_df.columns) <= 1:
                temp_df = pd.read_csv(CSV_PATH, encoding=enc, sep=',')
            
            # '날짜' 컬럼이 있는지 확인 (성공 여부 판단)
            # 공백 제거 후 확인
            cols = [c.strip() for c in temp_df.columns]
            if DATE in cols:
                df = temp_df
                df.columns = cols # 공백 제거된 컬럼명 적용
                print(f"✅ CSV 읽기 성공! (인코딩: {enc})")
                break
        except Exception as e:
            continue
    
    if df is None:
        print(f"❌ 오류: '{DATE}' 컬럼을 찾을 수 없습니다. CSV 파일을 확인해주세요.")
        # 디버깅을 위해 파일 내용을 살짝 보여줌
        try:
            with open(CSV_PATH, 'r', encoding='utf-8') as f:
                print(f"📄 파일 앞부분 미리보기:\n{f.readline()}")
        except: pass
        return

    # 2. 날짜 변환
    try:
        df[DATE] = pd.to_datetime(df[DATE])
    except Exception as e:
        print(f"❌ 날짜 변환 실패: {e}")
        return

    # 3. 랭킹 산출 로직
    all_dates = sorted(df[DATE].dropna().dt.normalize().unique())
    print(f"📅 데이터 기간: {len(all_dates)}일치 발견")

    for days in DAYS:
        if len(all_dates) == 0: continue

        # 최근 N일치 데이터만 자르기
        use_dates = all_dates[-days:] if len(all_dates) >= days else all_dates[:]
        start = pd.to_datetime(use_dates[0]).strftime("%Y-%m-%d")
        end = pd.to_datetime(use_dates[-1]).strftime("%Y-%m-%d")

        window = df[df[DATE].dt.normalize().isin(use_dates)].copy()

        # 종목별 합계 계산
        agg = (
            window.groupby(NAME, as_index=False)[NET]
            .sum()
            .sort_values(NET, ascending=False)
            .reset_index(drop=True)
        )

        buy = agg.head(200) # 순매수 상위
        sell = agg.sort_values(NET, ascending=True).head(200) # 순매도 상위

        # JSON 저장 함수
        def write_json(path, data):
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        # 순매수 JSON 저장
        write_json(TOP_DIR / f"netBuy_{days}.json", {
            "asOf": end,
            "days": days,
            "range": {"start": start, "end": end, "count": len(use_dates)},
            "items": [
                {"rank": i+1, "ticker": r[NAME], "value": float(r[NET])}
                for i, r in buy.iterrows()
            ]
        })

        # 순매도 JSON 저장
        write_json(TOP_DIR / f"netSell_{days}.json", {
            "asOf": end,
            "days": days,
            "range": {"start": start, "end": end, "count": len(use_dates)},
            "items": [
                {"rank": i+1, "ticker": r[NAME], "value": float(r[NET])}
                for i, r in sell.iterrows()
            ]
        })
        
    print(f"✅ Top 10 랭킹 데이터 생성 완료! -> {TOP_DIR}")

if __name__ == "__main__":
    main()