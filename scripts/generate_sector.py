import yfinance as yf
import json
import os
import pandas as pd

# 1. 감시할 섹터 목록 정의
SECTORS = [
    {"id": 1, "name": "반도체", "ticker": "SOXX", "emoji": "💾"},
    {"id": 2, "name": "빅테크", "ticker": "XLK", "emoji": "📱"},
    {"id": 3, "name": "나스닥", "ticker": "QQQ", "emoji": "🗽"},
    {"id": 4, "name": "2차전지", "ticker": "LIT", "emoji": "🔋"},
    {"id": 5, "name": "바이오", "ticker": "XLV", "emoji": "🧬"},
    {"id": 6, "name": "금융주", "ticker": "XLF", "emoji": "🏦"},
    {"id": 7, "name": "에너지", "ticker": "XLE", "emoji": "🛢️"},
    {"id": 8, "name": "방산", "ticker": "ITA", "emoji": "🚀"},
]

def generate_sector_data():
    results = []
    print("📊 섹터 데이터 분석 시작...")

    for s in SECTORS:
        try:
            # 2. 데이터 가져오기 (넉넉하게 2달치)
            ticker = yf.Ticker(s['ticker'])
            hist = ticker.history(period="3mo")
            
            if len(hist) < 2:
                print(f"❌ 데이터 부족: {s['name']}")
                continue

            # 최신 종가 (Close)
            price_now = hist['Close'].iloc[-1]
            
            # 3. 등락률 계산
            # 1일 전 (거래일 기준 -2번째)
            price_1d = hist['Close'].iloc[-2]
            change_1d = ((price_now - price_1d) / price_1d) * 100

            # 1주 전 (거래일 기준 약 5일 전)
            # 데이터가 모자라면 가장 옛날 데이터 사용
            idx_1w = -6 if len(hist) >= 6 else -len(hist)
            price_1w = hist['Close'].iloc[idx_1w]
            change_1w = ((price_now - price_1w) / price_1w) * 100

            # 1달 전 (거래일 기준 약 21일 전)
            idx_1m = -22 if len(hist) >= 22 else -len(hist)
            price_1m = hist['Close'].iloc[idx_1m]
            change_1m = ((price_now - price_1m) / price_1m) * 100

            # 결과 저장
            s['change1d'] = round(change_1d, 2)
            s['change1w'] = round(change_1w, 2)
            s['change1m'] = round(change_1m, 2)
            results.append(s)
            
            print(f"✅ {s['name']}: 1D {s['change1d']}%")

        except Exception as e:
            print(f"⚠️ 에러 발생 ({s['name']}): {e}")
            # 에러나면 0.0으로 채워서라도 보냄
            s['change1d'] = 0.0
            s['change1w'] = 0.0
            s['change1m'] = 0.0
            results.append(s)

    # 4. JSON 저장
    os.makedirs('public/data', exist_ok=True)
    with open('public/data/sector_performance.json', 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    
    print("💾 sector_performance.json 저장 완료!")

if __name__ == "__main__":
    generate_sector_data()