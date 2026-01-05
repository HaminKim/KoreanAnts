import pandas as pd
import yfinance as yf
import json
import os
import time
from datetime import datetime
from pandas.tseries.offsets import BusinessDay 
from concurrent.futures import ThreadPoolExecutor, as_completed

# =========================================================
# ⚙️ 설정 (엑셀 컬럼명에 맞춰 수정됨)
# =========================================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE_DIR, '..', 'processed')
TARGET_CSV_FILE = 'all_data_clean.csv'
OUTPUT_DIR = os.path.join(BASE_DIR, '..', 'public', 'data', 'flow')
MAP_FILE = os.path.join(BASE_DIR, '..', 'public', 'data', 'ticker_map.json')

# 🚨 CSV 파일 안의 이동평균선 컬럼명 매핑 (왼쪽: 엑셀 헤더, 오른쪽: 코드 내부용)
# 엑셀 사진 보고 정확히 맞췄습니다.
MA_MAP = {
    'MA5': 'ma5',     
    'MA10': 'ma10',   
    'MA20': 'ma20'    
}

# 🚨 날짜 보정 (T+2)
DATE_OFFSET = 2
# 🚀 병렬 처리 개수
MAX_WORKERS = 4 
# =========================================================

def calculate_reverse_signal(df):
    """리버스 개미 지표 계산"""
    if len(df) < 20: return "NEUTRAL", 0
    
    window = 60
    df['mean_60'] = df['net_buy'].rolling(window=window).mean()
    df['std_60'] = df['net_buy'].rolling(window=window).std()
    
    valid_flow_idx = df[df['net_buy'] != 0].index
    if not valid_flow_idx.empty:
        last_valid_idx = valid_flow_idx.max()
        last_row = df.loc[last_valid_idx]
    else:
        last_row = df.iloc[-1]
    
    std = last_row['std_60'] if last_row['std_60'] != 0 else 1
    z_score = round((last_row['net_buy'] - last_row['mean_60']) / std, 2)

    price_trend = "FLAT"
    # 주가 데이터가 있는 경우에만 추세 계산
    if 'close' in df.columns:
        last_price_row = df.iloc[-1]
        if pd.notnull(last_price_row['close']) and last_price_row['close'] != 0:
            ma20 = df['close'].rolling(window=20).mean().iloc[-1]
            ma5 = df['close'].rolling(window=5).mean().iloc[-1]
            
            if pd.notnull(ma5) and pd.notnull(ma20):
                if ma5 < ma20 * 0.98: price_trend = "DOWN"
                elif ma5 > ma20 * 1.02: price_trend = "UP"

    signal = "NEUTRAL"
    if price_trend == "DOWN" and z_score > 1.5: signal = "FALLING_KNIFE" 
    elif price_trend == "UP" and z_score > 2.0: signal = "FOMO"            
    elif price_trend == "DOWN" and z_score < -1.5: signal = "PANIC_SELL" 

    return signal, z_score

def process_single_stock(data_pack):
    raw_name, df_flow, ticker_symbol = data_pack
    
    try:
        df_flow = df_flow.sort_values('date').copy()
        final_df = df_flow
        has_price = False
        
        if ticker_symbol:
            try:
                # 1. 주가 데이터 가져오기
                ticker_obj = yf.Ticker(ticker_symbol)
                stock_data = ticker_obj.history(period="2y")
                
                if not stock_data.empty:
                    stock_data = stock_data.reset_index()
                    if 'Date' in stock_data.columns and stock_data['Date'].dt.tz is not None:
                        stock_data['Date'] = stock_data['Date'].dt.tz_localize(None)
                    
                    price_df = stock_data[['Date', 'Close']].rename(columns={'Date': 'date', 'Close': 'close'})
                    
                    # 진짜 개장일(Market Days) 필터링
                    valid_market_days = set(price_df['date'])

                    # 2. 데이터 병합 (Outer Join으로 한국/미국 날짜 모두 포함)
                    final_df = pd.merge(df_flow, price_df, on='date', how='outer')
                    
                    # 미국 휴장일(데이터 없는 날) 삭제
                    final_df = final_df[final_df['date'].isin(valid_market_days)]
                    
                    # 3. 데이터 정리 및 채우기 (Filling Logic)
                    min_flow_date = df_flow['date'].min()
                    final_df = final_df[final_df['date'] >= min_flow_date].copy()
                    
                    final_df['name'] = final_df['name'].fillna(raw_name)
                    final_df['net_buy'] = final_df['net_buy'].fillna(0) # 순매수는 없으면 0
                    
                    # 🔥 [핵심] MA(이동평균) 데이터 전날 값 유지 (Forward Fill)
                    # 계산된 MA값은 추세이므로, 한국 휴장일에도 전날 추세가 유지된다고 가정
                    for col in MA_MAP.values():
                        if col in final_df.columns:
                            final_df[col] = final_df[col].ffill()
                            final_df[col] = final_df[col].fillna(0) # 앞부분 비었으면 0

                    final_df['close'] = final_df['close'].ffill() # 주가도 ffill
                    has_price = True
            except Exception:
                pass

        if has_price:
            final_df = final_df.dropna(subset=['close'])
            final_df = final_df[final_df['close'] > 0]

        final_df = final_df.sort_values('date')
        
        if final_df.empty:
            return None

        signal, z_score = calculate_reverse_signal(final_df)
        last_date_str = final_df['date'].iloc[-1].strftime('%Y-%m-%d')
        
        output_data = {
            "meta": {
                "name": raw_name,
                "ticker": ticker_symbol,
                "signal": signal,
                "zScore": z_score,
                "hasPrice": has_price,
                "lastUpdate": last_date_str 
            },
            "data": []
        }

        # JSON 데이터 생성
        for _, row in final_df.iterrows():
            item = {
                "date": row['date'].strftime('%Y-%m-%d'),
                "netBuy": int(row['net_buy'])
            }
            if 'close' in row and row['close'] > 0:
                item["price"] = round(row['close'], 2)
            
            # 🔥 [핵심] MA 데이터 JSON에 추가 (정수로 변환하여 용량 절약)
            for ma_key in MA_MAP.values():
                if ma_key in row and pd.notnull(row[ma_key]):
                    # 엑셀에 소수점이 있어도 화면 표시용으론 정수가 깔끔하므로 int 처리
                    item[ma_key] = int(row[ma_key])

            output_data['data'].append(item)
            
        return output_data

    except Exception as e:
        print(f"Error processing {raw_name}: {e}")
        return None

def main():
    start_time = time.time()
    print(f"🚀 데이터 처리 시작 (MA5, MA10, MA20 포함)...")

    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    with open(MAP_FILE, 'r', encoding='utf-8') as f:
        ticker_map = json.load(f)

    csv_path = os.path.join(CSV_DIR, TARGET_CSV_FILE)
    if not os.path.exists(csv_path):
        print(f"❌ 파일을 찾을 수 없습니다: {csv_path}")
        return

    try:
        df_all = pd.read_csv(csv_path)
        df_all.columns = [c.strip() for c in df_all.columns]
        
        # 기본 컬럼명 매핑
        rename_map = {'종목명': 'name', '날짜': 'date', '순매수': 'net_buy'}
        
        # 🔥 MA 컬럼 매핑 추가
        rename_map.update(MA_MAP)
        
        df_all.rename(columns=rename_map, inplace=True)

        df_all['date'] = pd.to_datetime(df_all['date'])
        print(f"⚡ 날짜 보정: 결제일 기준 -{DATE_OFFSET} 영업일 적용 중...")
        df_all['date'] = df_all['date'] - BusinessDay(n=DATE_OFFSET)

        grouped = df_all.groupby('name')
        total_groups = len(grouped)
        
        tasks = []
        for raw_name, df_flow in grouped:
            ticker_symbol = ticker_map.get(raw_name, "")
            tasks.append((raw_name, df_flow.copy(), ticker_symbol))

        print(f"📊 총 {total_groups}개 종목 처리 시작...")

        completed_count = 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            future_to_stock = {executor.submit(process_single_stock, t): t[0] for t in tasks}
            
            for future in as_completed(future_to_stock):
                stock_name = future_to_stock[future]
                try:
                    result = future.result()
                    if result:
                        safe_filename = "".join([c if c.isalnum() or c in (' ', '.', '-', '_') else "_" for c in stock_name])
                        save_path = os.path.join(OUTPUT_DIR, f"{safe_filename}_all.json")
                        with open(save_path, 'w', encoding='utf-8') as f:
                            json.dump(result, f, ensure_ascii=False)
                            
                    completed_count += 1
                    if completed_count % 5 == 0:
                        print(f"⚡ 진행률: {completed_count}/{total_groups} 완료", end="\r")
                        
                except Exception as exc:
                    print(f"\n❌ {stock_name} 처리 중 에러: {exc}")

        end_time = time.time()
        elapsed = end_time - start_time
        print(f"\n\n✅ 전체 완료! 소요 시간: {elapsed:.2f}초")

    except Exception as e:
        print(f"\n❌ 치명적 오류 발생: {e}")

if __name__ == "__main__":
    main()