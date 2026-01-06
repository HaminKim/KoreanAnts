import pandas as pd
import os

# 📂 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR = os.path.join(BASE_DIR, 'processed') 
TARGET_FILE = 'all_data_clean.csv'
csv_path = os.path.join(CSV_DIR, TARGET_FILE)

print(f"🕵️ [진단 재시작] 파일 위치: {csv_path}")

if not os.path.exists(csv_path):
    print(f"❌ 오류: '{csv_path}' 파일이 없습니다.")
    exit()

# 1. 인코딩 및 구분자(탭 vs 쉼표) 자동 감지
encodings = ['utf-8', 'cp949', 'euc-kr', 'utf-8-sig']
df = None

for enc in encodings:
    try:
        # ✨ [수정된 부분] sep='\t'를 추가해서 탭으로 된 파일도 읽게 함
        df = pd.read_csv(csv_path, encoding=enc, sep='\t')
        
        # 만약 탭으로 읽었는데 컬럼이 1개밖에 없으면, 다시 쉼표로 읽어봄
        if len(df.columns) <= 1:
             df = pd.read_csv(csv_path, encoding=enc, sep=',')
             
        print(f"✅ 파일 읽기 성공! (인코딩: {enc})")
        break
    except:
        continue

if df is None:
    print("🚨 파일 읽기 실패. 인코딩 문제 지속됨.")
    exit()

# 2. 컬럼 공백 제거 및 확인
df.columns = [c.strip() for c in df.columns]
print(f"📊 인식된 컬럼: {list(df.columns)}")

# 3. 종목명 컬럼 찾기
name_col = None
for candidate in ['종목명', 'name', 'Stock', 'Ticker']:
    if candidate in df.columns:
        name_col = candidate
        break

if not name_col:
    print(f"🚨 여전히 '종목명' 컬럼을 못 찾겠습니다. 현재 컬럼 상태: {df.columns}")
    exit()

# 4. [매칭 검사] JSON과 비교할 종목명 출력
print("-" * 30)
unique_names = df[name_col].unique()
print(f"🔍 CSV 안의 종목명 샘플 (총 {len(unique_names)}개):")

# 앞부분 5개, 뒷부분 5개 출력
for name in list(unique_names)[:5] + list(unique_names)[-5:]:
    print(f"  👉 [{name}]")

print("-" * 30)
print("✅ 이제 이 종목명들이 아까 JSON의 긴 이름과 똑같은지 봐야 합니다!")