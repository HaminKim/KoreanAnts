"""한국 개인투자자 미국주식 누적 순매수 (개미지수 페이지 상단 그래프)

processed/all_data_clean.csv (Seibro 일별 결제 상위 50종목) 의 날짜별 순매수 합을 최근 2년 누적.
→ public/data/flow/ant_cumulative.json

- 날짜는 process_flow_data 와 같게 결제일 기준 -2 영업일 (Seibro T+2)
- 미국 채권 휴장 다음날처럼 종목이 몇 개 안 잡힌 날은 합계가 왜곡되므로 제외
"""
import json
import os

import pandas as pd
from pandas.tseries.offsets import BusinessDay

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, '..', 'processed', 'all_data_clean.csv')
OUT_PATH = os.path.join(BASE_DIR, '..', 'public', 'data', 'flow', 'ant_cumulative.json')

DATE_OFFSET = 2
YEARS = 2
MIN_STOCKS = 10


def main():
    df = pd.read_csv(CSV_PATH, encoding='utf-8-sig')
    df['날짜'] = pd.to_datetime(df['날짜']) - BusinessDay(n=DATE_OFFSET)

    g = df.groupby('날짜')
    daily = pd.DataFrame({'net': g['순매수'].sum(), 'n': g.size()})
    daily = daily[daily['n'] >= MIN_STOCKS]
    daily = daily[daily.index >= daily.index.max() - pd.DateOffset(years=YEARS)]
    if daily.empty:
        print('❌ 데이터 없음 → 기존 파일 유지')
        return

    cum = daily['net'].cumsum()
    out = {
        'asOf': daily.index.max().strftime('%Y-%m-%d'),
        'start': daily.index.min().strftime('%Y-%m-%d'),
        'unit': 'USD',
        'basis': f'Seibro 일별 결제 상위 50종목 순매수 합 (종목 {MIN_STOCKS}개 미만인 날 제외)',
        'd': [x.strftime('%Y-%m-%d') for x in daily.index],
        'net': [int(v) for v in daily['net']],
        'cum': [int(v) for v in cum],
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(f"💾 ant_cumulative.json: {out['start']} ~ {out['asOf']} ({len(out['d'])}일), 누적 {cum.iloc[-1] / 1e8:,.1f}억 $")


if __name__ == '__main__':
    main()
