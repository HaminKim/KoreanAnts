import json
import os
from datetime import datetime

# 📅 요일별 전략
STRATEGY = {
    0: {'day': 'Monday',    'source': ['netBuy_5'],           'theme': 'THEME_WEEKLY_TREND'}, 
    1: {'day': 'Tuesday',   'source': ['netSell_5'],          'theme': 'THEME_PANIC_SELL'},   
    2: {'day': 'Wednesday', 'source': ['netBuy_10', 'netSell_10'], 'theme': 'THEME_VS_MATCH'}, 
    3: {'day': 'Thursday',  'source': ['netSell_10'],         'theme': 'THEME_MID_SELL'},     
    4: {'day': 'Friday',    'source': ['netBuy_5'],           'theme': 'THEME_HOT_FRIDAY'},   
    5: {'day': 'Saturday',  'source': ['netBuy_20'],          'theme': 'THEME_WEEKEND_TOTAL'},
    6: {'day': 'Sunday',    'source': ['netBuy_20'],          'theme': 'THEME_WEEKEND_BUY'}   
}

def load_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def normalize_key(s):
    return s.upper().strip()

def main():
    today = datetime.now()
    weekday = today.weekday()
    config = STRATEGY.get(weekday)
    
    print(f"📅 오늘은 {config['day']}! 전략: {config['theme']}")

    base_dir = os.path.dirname(os.path.abspath(__file__))
    output_path = os.path.join(base_dir, "../public/data/daily_briefing.json")
    
    ticker_map = load_json(os.path.join(base_dir, "../public/data/ticker_map.json"))
    name_alias = load_json(os.path.join(base_dir, "../public/data/name_alias.json"))

    norm_ticker_map = {normalize_key(k): str(v) for k, v in ticker_map.items()}
    norm_name_alias = {normalize_key(k): str(v) for k, v in name_alias.items()}

    final_picks = []

    # 1. 며칠치 데이터인지 확인 (파일명에서 숫자 추출)
    # 예: ['netBuy_5'] -> '5' 추출
    # 수요일(['netBuy_10', 'netSell_10'])도 어차피 기간은 같으므로 첫 번째 거 기준
    source_name = config['source'][0] 
    days_str = source_name.split('_')[-1] # 5, 10, 20

    for src_file in config['source']:
        source_path = os.path.join(base_dir, f"../public/data/top10/{src_file}.json")
        raw_data = load_json(source_path)
        
        limit = 3 if len(config['source']) > 1 else 5
        items = raw_data.get('items', [])
        
        for i, item in enumerate(items[:limit]):
            raw_name = item.get('ticker', '').strip()
            norm_key = normalize_key(raw_name)

            clean_ticker = norm_ticker_map.get(norm_key, raw_name)
            clean_ticker_key = normalize_key(clean_ticker)
            korean_name = norm_name_alias.get(clean_ticker_key, clean_ticker)

            is_buy = 'Buy' in src_file
            
            fixed_rank = i + 1
            
            final_picks.append({
                'rank': fixed_rank,
                'ticker': clean_ticker,    
                'name': korean_name,       
                'raw_name': raw_name,      
                'value': item['value'],
                'type': 'NET_BUY' if is_buy else 'NET_SELL',
                'desc_key': f"{'매수' if is_buy else '매도'} {fixed_rank}위"
            })

    # ✨ [수정 완료] 결과창에 메타 데이터 추가
    result = {
        'date': today.strftime('%Y-%m-%d'),
        'day_of_week': config['day'],
        'theme_code': config['theme'],
        
        # 👇 여기가 추가된 핵심 정보입니다!
        'meta_info': {
            'period_days': int(days_str),       # 숫자 (예: 5)
            'total_count': len(final_picks),    # 숫자 (예: 5 또는 6)
            'source_desc': f"최근 {days_str}일간 데이터" # 친절한 설명
        },
        
        'items': final_picks
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ 완벽 생성! ({days_str}일 데이터, 총 {len(final_picks)}개) -> {output_path}")

if __name__ == "__main__":
    main()