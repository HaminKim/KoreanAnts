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

    for src_file in config['source']:
        source_path = os.path.join(base_dir, f"../public/data/top10/{src_file}.json")
        raw_data = load_json(source_path)
        
        limit = 3 if len(config['source']) > 1 else 5
        items = raw_data.get('items', [])
        
        # ✨ [핵심 수정] enumerate로 0부터 순서를 매겨서, 강제로 1위, 2위로 만듭니다.
        # 원래 데이터에 rank가 123위로 되어 있어도 무시하고 우리가 1위로 임명합니다.
        for i, item in enumerate(items[:limit]):
            
            # 데이터 세탁 (Mapping)
            raw_name = item.get('ticker', '').strip()
            norm_key = normalize_key(raw_name)

            clean_ticker = norm_ticker_map.get(norm_key, raw_name)
            clean_ticker_key = normalize_key(clean_ticker)
            korean_name = norm_name_alias.get(clean_ticker_key, clean_ticker)

            is_buy = 'Buy' in src_file
            
            # 🥇 강제 랭킹 부여 (0번째 -> 1위, 1번째 -> 2위...)
            fixed_rank = i + 1
            
            final_picks.append({
                'rank': fixed_rank,        # 👈 이제 무조건 1, 2, 3... 으로 저장됨!
                'ticker': clean_ticker,    
                'name': korean_name,       
                'raw_name': raw_name,      
                'value': item['value'],
                'type': 'NET_BUY' if is_buy else 'NET_SELL',
                # 👇 설명도 깔끔하게 "매도 1위"로 통일
                'desc_key': f"{'매수' if is_buy else '매도'} {fixed_rank}위"
            })

    result = {
        'date': today.strftime('%Y-%m-%d'),
        'day_of_week': config['day'],
        'theme_code': config['theme'],
        'items': final_picks
    }

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print(f"✅ 완벽 생성! (랭킹 초기화 완료) -> {output_path}")
    for p in final_picks:
        print(f"   [{p['desc_key']}] {p['ticker']} ({p['name']})")

if __name__ == "__main__":
    main()