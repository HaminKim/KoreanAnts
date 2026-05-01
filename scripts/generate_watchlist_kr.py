"""
generate_watchlist_kr.py

한국 주식 워치리스트 생성 스크립트 (코스피 기준)

▶ 미국 버전(generate_watchlist.py)과 완전히 동일한 계산식
  - BENCHMARK: ^KS11 (코스피 지수)
  - 종목 티커: yfinance 형식 (예: 005930.KS, 086520.KQ)
  - 출력: public/data/watchlist_kr.json

▶ 미국 버전과의 차이점
  - EPS 데이터 미수집 (yfinance 한국 지원 불량)
  - market_context 필드명: kospi_* (spy_* 대신)
  - KOSPI 섹터는 RS = 0 고정 (시장 기준)
"""

import io
import json
import os
import sys
import time
import random
import concurrent.futures
import numpy as np
import pandas as pd
import yfinance as yf
from datetime import datetime

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ─────────────────────────────────────────
# 파라미터 (미국 버전과 동일)
# ─────────────────────────────────────────

BENCHMARK        = "^KS11"   # 코스피 지수
MA_PERIOD        = 100
MA_PERIOD_150    = 150
RS_WINDOW_STOCK  = 252
RS_WINDOW_60     = 60
RS_WINDOW_20     = 20
RS_WINDOW_SECTOR = 60
RS_MA_PERIOD     = 20
RS_WEIGHTS       = (0.2, 0.3, 0.5)  # 20d : 60d : 252d

# ─────────────────────────────────────────
# 한국 26개 섹터 정의
# ─────────────────────────────────────────

SECTORS_KR = [
    {
        "id": 1, "name": "반도체", "etf": "091160.KS", "emoji": "💾",
        "tickers": [
            "005930.KS", "000660.KS", "042700.KS", "058470.KS", "357780.KS",
            "084370.KS", "089030.KS", "240810.KS", "067310.KS", "099320.KS",
            "003160.KS", "232140.KS", "036830.KS", "054620.KS", "178600.KS",
            "064760.KQ", "019870.KQ", "049900.KQ", "095500.KQ", "046890.KQ",
            "048580.KQ", "025560.KS", "098520.KS",
        ]
    },
    {
        "id": 2, "name": "이차전지", "etf": "305720.KS", "emoji": "🔋",
        "tickers": [
            "373220.KS", "006400.KS", "086520.KQ", "247540.KS", "066970.KS",
            "003670.KS", "278280.KS", "121600.KQ", "025900.KS", "005070.KS",
            "336370.KS", "222080.KQ", "089980.KS", "438260.KS", "017370.KS",
            "270490.KS", "011790.KS", "298040.KS", "004490.KS", "124560.KQ",
            "096530.KQ", "234690.KQ", "006260.KS",
        ]
    },
    {
        "id": 3, "name": "자동차", "etf": "091180.KS", "emoji": "🚗",
        "tickers": [
            "005380.KS", "000270.KS", "012330.KS", "011210.KS", "204320.KS",
            "015750.KS", "005850.KS", "000040.KS", "161390.KS", "073240.KS",
            "123700.KS", "195870.KS", "006620.KS", "092780.KS", "178320.KS",
            "018880.KS", "241560.KS", "042670.KS", "025540.KS", "066570.KS",
            "032640.KS", "043270.KS",
        ]
    },
    {
        "id": 4, "name": "조선", "etf": "139230.KS", "emoji": "⚓",
        "tickers": [
            "009540.KS", "010140.KS", "010620.KS", "329180.KS", "042660.KS",
            "267250.KS", "100090.KS", "014620.KS", "071970.KS", "288620.KS",
            "170790.KS", "241560.KS", "014160.KS", "009180.KS", "091810.KS",
            "034020.KS", "004370.KS", "058650.KS", "003490.KS", "006120.KS",
            "002840.KS", "096870.KS",
        ]
    },
    {
        "id": 5, "name": "바이오/제약", "etf": "143460.KS", "emoji": "🧬",
        "tickers": [
            "207940.KS", "068270.KS", "128940.KS", "000100.KS", "185750.KS",
            "069620.KS", "003850.KS", "006280.KS", "170900.KS", "237690.KS",
            "214450.KQ", "243070.KS", "145720.KS", "086900.KQ", "019210.KS",
            "326030.KS", "200130.KQ", "137310.KQ", "091990.KQ", "220400.KQ",
            "009420.KS", "003520.KS",
        ]
    },
    {
        "id": 6, "name": "금융/보험", "etf": "091170.KS", "emoji": "🏦",
        "tickers": [
            "105560.KS", "055550.KS", "086790.KS", "316140.KS", "024110.KS",
            "138040.KS", "071050.KS", "000810.KS", "005830.KS", "001450.KS",
            "088350.KS", "003540.KS", "032830.KS", "000060.KS", "006800.KS",
            "000370.KS", "139130.KS", "175330.KS", "006220.KS", "085620.KS",
            "000540.KS", "002550.KS",
        ]
    },
    {
        "id": 7, "name": "증권", "etf": "102970.KS", "emoji": "📈",
        "tickers": [
            "016360.KS", "006800.KS", "071050.KS", "078020.KS", "001500.KS",
            "001720.KS", "039490.KS", "025540.KS", "001510.KS",
            "007070.KS", "001620.KS", "004490.KS", "023530.KS",
            "030490.KS", "024790.KS", "003540.KS", "050009.KS", "001290.KS",
            "003540.KS", "267360.KS", "003690.KS",
        ]
    },
    {
        "id": 8, "name": "인터넷/플랫폼", "etf": "139260.KS", "emoji": "🌐",
        "tickers": [
            "035420.KS", "035720.KS", "323410.KS", "377300.KS", "018280.KS",
            "053800.KS", "032500.KQ", "041510.KS", "035900.KS", "122870.KS",
            "253450.KS", "036420.KS", "160550.KS", "298000.KS", "413380.KS",
            "042000.KQ", "208170.KQ", "403550.KQ", "047560.KS", "101530.KS",
            "215600.KQ", "357550.KS",
        ]
    },
    {
        "id": 9, "name": "게임", "etf": "300950.KS", "emoji": "🎮",
        "tickers": [
            "036570.KS", "251270.KS", "259960.KS", "293490.KS", "112040.KQ",
            "078340.KQ", "263750.KQ", "069080.KQ", "192080.KQ", "194480.KQ",
            "181710.KS", "067000.KQ", "110790.KQ", "225570.KQ", "041140.KQ",
            "041920.KQ", "007390.KQ", "089790.KQ", "030530.KQ", "035080.KQ",
            "290510.KQ", "069080.KQ",
        ]
    },
    {
        "id": 10, "name": "엔터/미디어", "etf": "228810.KS", "emoji": "🎤",
        "tickers": [
            "352820.KS", "041510.KS", "035900.KS", "122870.KS", "035760.KS",
            "253450.KS", "036420.KS", "160550.KS", "298000.KS", "241840.KQ",
            "054780.KQ", "413380.KS", "314130.KS", "043910.KQ", "145210.KS",
            "222110.KQ", "287410.KQ", "376300.KS", "019490.KQ", "016170.KS",
            "025900.KS", "347860.KQ",
        ]
    },
    {
        "id": 11, "name": "건설", "etf": "139220.KS", "emoji": "🏗️",
        "tickers": [
            "028260.KS", "000720.KS", "006360.KS", "047040.KS", "375500.KS",
            "294870.KS", "009410.KS", "002990.KS", "004960.KS", "097230.KS",
            "003410.KS", "005960.KS", "001440.KS", "034300.KS", "000210.KS",
            "010780.KS", "001880.KS", "002380.KS", "014530.KS", "003650.KS",
            "013580.KS", "003440.KS",
        ]
    },
    {
        "id": 12, "name": "화학", "etf": "117460.KS", "emoji": "⚗️",
        "tickers": [
            "051910.KS", "011170.KS", "009830.KS", "011790.KS", "298050.KS",
            "120110.KS", "011780.KS", "010060.KS", "285130.KS", "000990.KS",
            "024090.KS", "003720.KS", "004000.KS", "009200.KS", "003830.KS",
            "006110.KS", "005720.KS", "011500.KS", "014200.KS", "002380.KS",
            "004490.KS", "078130.KS",
        ]
    },
    {
        "id": 13, "name": "철강/소재", "etf": "117680.KS", "emoji": "⛏️",
        "tickers": [
            "005490.KS", "004020.KS", "001230.KS", "010130.KS", "000670.KS",
            "103140.KS", "006260.KS", "001430.KS", "047050.KS", "004140.KS",
            "002220.KS", "005210.KS", "016580.KS", "008970.KS", "002440.KS",
            "010780.KS", "002630.KS", "004560.KS", "009780.KS", "014990.KS",
            "001520.KS", "011300.KS",
        ]
    },
    {
        "id": 14, "name": "유통/소비재", "etf": "227560.KS", "emoji": "🛒",
        "tickers": [
            "023530.KS", "139480.KS", "004170.KS", "069960.KS", "007070.KS",
            "005300.KS", "180640.KS", "271560.KS", "028150.KS", "001680.KS",
            "005110.KS", "000250.KS", "010120.KS", "002360.KS", "007310.KS",
            "007130.KS", "002690.KS", "004430.KS", "005440.KS", "001140.KS",
            "008770.KS", "030190.KS",
        ]
    },
    {
        "id": 15, "name": "통신", "etf": "017670.KS", "emoji": "📡",
        "tickers": [
            "017670.KS", "030200.KS", "032640.KS", "032350.KS", "036460.KS",
            "053800.KS", "033630.KS", "010660.KS", "052690.KS", "078600.KS",
            "115160.KS", "018280.KS", "034020.KS", "042700.KS", "031430.KS",
            "034120.KS", "016600.KS", "063160.KS", "060370.KS", "090350.KS",
            "035600.KQ", "025900.KS",
        ]
    },
    {
        "id": 16, "name": "에너지", "etf": "096770.KS", "emoji": "🛢️",
        "tickers": [
            "096770.KS", "010950.KS", "078930.KS", "036460.KS", "015760.KS",
            "010120.KS", "002240.KS", "006090.KS", "007570.KS",
            "101060.KS", "117580.KS", "267250.KS", "001830.KS",
            "004490.KS", "028050.KS", "009190.KS", "022000.KS", "002390.KS",
            "034020.KS", "012450.KS", "002200.KS", "003490.KS",
        ]
    },
    {
        "id": 17, "name": "방산", "etf": "0080G0.KS", "emoji": "🚀",
        "tickers": [
            "012450.KS", "079550.KS", "047810.KS", "064350.KS", "272210.KS",
            "065620.KS", "000880.KS", "007860.KS", "071970.KS", "004490.KS",
            "023150.KS", "032250.KS", "079850.KS", "241560.KS", "337840.KS",
            "105190.KS", "006260.KS", "032280.KS", "000400.KS", "014970.KQ",
            "047050.KS", "009180.KS",
        ]
    },
    {
        "id": 18, "name": "디스플레이", "etf": "034220.KS", "emoji": "🖥️",
        "tickers": [
            "034220.KS", "213420.KS", "357780.KS", "138360.KS", "067160.KS",
            "036540.KS", "011070.KS", "178920.KS", "080160.KS", "038290.KS",
            "078890.KS", "039030.KS", "011155.KS", "016730.KS", "032350.KS",
            "205470.KS", "044380.KS", "006460.KS", "097870.KS", "027560.KQ",
            "019070.KQ", "074600.KQ",
        ]
    },
    {
        "id": 19, "name": "의료기기", "etf": "307510.KS", "emoji": "🏥",
        "tickers": [
            "041830.KS", "100120.KQ", "214450.KQ", "228850.KQ", "214150.KQ",
            "039200.KQ", "091700.KQ", "286940.KS", "196170.KQ", "237690.KQ",
            "298060.KQ", "145720.KQ", "068060.KQ", "141080.KQ", "092190.KQ",
            "048830.KQ", "052300.KQ", "149980.KQ", "148140.KQ", "160550.KS",
            "006380.KS", "204840.KQ",
        ]
    },
    {
        "id": 20, "name": "물류/운송", "etf": "140710.KS", "emoji": "🚢",
        "tickers": [
            "086280.KS", "000120.KS", "002320.KS", "003490.KS", "020560.KS",
            "089590.KS", "035250.KS", "006490.KS", "048410.KS", "001250.KS",
            "009530.KS", "007110.KS", "012700.KS", "001560.KS", "044380.KS",
            "034810.KS", "023690.KS", "011300.KS", "005250.KS", "005430.KS",
            "015350.KS", "003200.KS",
        ]
    },
    {
        "id": 21, "name": "부동산/리츠", "etf": "329200.KS", "emoji": "🏢",
        "tickers": [
            "088980.KS", "330590.KS", "395400.KS", "432320.KS", "357120.KS",
            "448730.KS", "451800.KS", "293940.KS", "377190.KS", "348950.KS",
            "404990.KS", "409570.KS", "365550.KS", "432115.KS", "294090.KS",
            "396690.KS", "439090.KS", "411190.KS", "352290.KS", "284620.KS",
            "348210.KS", "417310.KS",
        ]
    },
    {
        "id": 22, "name": "클린에너지", "etf": "385510.KS", "emoji": "☀️",
        "tickers": [
            "112610.KS", "009830.KS", "010060.KS", "038870.KS", "006090.KS",
            "078130.KS", "389260.KS", "298260.KS", "175330.KS", "077970.KS",
            "298040.KS", "014620.KS", "004200.KS", "263920.KS", "003030.KS",
            "017550.KS", "038960.KS", "119500.KS", "009280.KS", "012810.KS",
            "005720.KS", "267890.KS",
        ]
    },
    {
        "id": 23, "name": "IT서비스", "etf": "139260.KS", "emoji": "💻",
        "tickers": [
            "018260.KS", "034730.KS", "012510.KS", "030520.KS", "032500.KQ",
            "047310.KQ", "093520.KQ", "079000.KQ", "023350.KS", "099430.KQ",
            "040910.KQ", "043260.KQ", "053290.KQ", "260780.KS", "065770.KQ",
            "035810.KQ", "060280.KQ", "036200.KS", "041480.KQ", "005150.KS",
            "052400.KQ", "058450.KQ",
        ]
    },
    {
        "id": 24, "name": "화장품/뷰티", "etf": "228790.KS", "emoji": "💄",
        "tickers": [
            "051900.KS", "090430.KS", "161890.KS", "044820.KS", "237880.KQ",
            "018290.KQ", "257720.KQ", "214420.KQ", "192820.KQ", "024720.KS",
            "104460.KQ", "241710.KQ", "078520.KQ", "189980.KQ", "003650.KS",
            "170790.KS", "037760.KQ", "169930.KQ", "057840.KQ", "069920.KQ",
            "304090.KQ", "049520.KQ",
        ]
    },
    {
        "id": 25, "name": "음식료", "etf": "097950.KS", "emoji": "🍜",
        "tickers": [
            "097950.KS", "007310.KS", "004370.KS", "000080.KS", "271560.KS",
            "005300.KS", "003230.KS", "049770.KS", "005180.KS", "002150.KS",
            "280360.KS", "008350.KS", "145990.KS", "007340.KS", "004020.KS",
            "002870.KS", "012750.KS", "036580.KQ", "002160.KS", "014680.KS",
            "000270.KS", "001680.KS",
        ]
    },
    {
        "id": 26, "name": "시장(코스피)", "etf": "069500.KS", "emoji": "🇰🇷",
        "tickers": [
            "005930.KS", "000660.KS", "373220.KS", "207940.KS", "005380.KS",
            "000270.KS", "005490.KS", "051910.KS", "068270.KS", "006400.KS",
            "035720.KS", "035420.KS", "017670.KS", "105560.KS", "055550.KS",
            "009540.KS", "034220.KS", "352820.KS", "096770.KS", "012330.KS",
        ]
    },
    {
        "id": 27, "name": "연료전지", "etf": "385510.KS", "emoji": "⛽",
        "tickers": [
            "336260.KS", "382900.KS", "059090.KQ", "094970.KQ", "120110.KS",
            "298050.KS", "034020.KS", "000150.KS", "011170.KS", "011790.KS",
            "066570.KS", "009830.KS", "051910.KS", "096770.KS",
            "271940.KS", "107240.KQ", "012450.KS", "004090.KS", "008730.KS",
            "013360.KS", "078930.KS",
        ]
    },
    {
        "id": 28, "name": "전력기기", "etf": "117460.KS", "emoji": "⚡",
        "tickers": [
            "010120.KS", "267260.KS", "298040.KS", "006260.KS", "001440.KS",
            "015760.KS", "052690.KS", "051600.KS", "103590.KS",
            "033100.KS", "007340.KS", "267250.KS",
            "000720.KS", "001530.KS", "017940.KS", "023810.KS", "053590.KQ",
            "034110.KS", "108670.KS", "011070.KS", "005490.KS", "271940.KS",
        ]
    },
    {
        "id": 29, "name": "원자력", "etf": "433500.KS", "emoji": "☢️",
        "tickers": [
            "034020.KS", "052690.KS", "015760.KS", "051600.KS", "041190.KQ",
            "267260.KS", "010120.KS", "000150.KS", "014620.KS", "298040.KS",
            "064350.KS", "012450.KS", "009540.KS", "071970.KS",
            "105190.KS", "013360.KS", "034730.KS", "004360.KS", "023810.KS",
            "017940.KS", "033100.KS",
        ]
    },
    {
        "id": 30, "name": "수소경제", "etf": "385510.KS", "emoji": "💧",
        "tickers": [
            "298050.KS", "271940.KS", "120110.KS", "336260.KS", "005380.KS",
            "000270.KS", "011170.KS", "096770.KS", "034020.KS", "009830.KS",
            "051910.KS", "000150.KS", "094970.KQ", "078930.KS",
            "047810.KS", "064350.KS", "042660.KS", "012450.KS", "271560.KS",
            "006280.KS", "059090.KQ",
        ]
    },
    {
        "id": 31, "name": "로봇", "etf": "464310.KS", "emoji": "🤖",
        "tickers": [
            "277810.KQ", "108490.KQ", "222800.KQ", "090360.KQ", "347890.KQ",
            "054620.KS", "011210.KS", "066570.KS", "012450.KS", "022100.KS",
            "117730.KQ", "204320.KS", "009150.KS",
            "106190.KQ", "119550.KQ", "089300.KQ", "208140.KQ", "043590.KQ",
            "083930.KQ", "041510.KS", "003600.KS", "294090.KS",
        ]
    },
    {
        "id": 32, "name": "우주/위성", "etf": "139260.KS", "emoji": "🛸",
        "tickers": [
            "047810.KS", "099320.KS", "277410.KQ", "079550.KS", "012450.KS",
            "064350.KS", "272210.KS", "000880.KS", "337840.KS", "241560.KS",
            "032350.KS", "053800.KS", "034020.KS", "033100.KS", "055490.KS",
            "271940.KS", "021240.KS", "047200.KS", "034730.KS", "012600.KS",
            "065620.KS", "023150.KS",
        ]
    },
    {
        "id": 33, "name": "AI/소프트웨어", "etf": "139260.KS", "emoji": "🧠",
        "tickers": [
            "035420.KS", "035720.KS", "304100.KQ", "122900.KQ",
            "022100.KS", "018260.KS", "030520.KS", "047310.KQ", "079000.KQ",
            "053290.KQ", "040910.KQ", "099430.KQ",
            "060280.KQ", "036200.KS", "035810.KQ", "041480.KQ", "039560.KS",
            "302920.KS", "052400.KQ", "058450.KQ", "095610.KQ", "323410.KS",
        ]
    },
    {
        "id": 34, "name": "항공/여행", "etf": "140710.KS", "emoji": "✈️",
        "tickers": [
            "003490.KS", "020560.KS", "089590.KS", "272450.KS", "298690.KS",
            "039130.KS", "104620.KQ", "032350.KS", "008770.KS",
            "034230.KS", "114090.KS",
            "023690.KS", "005250.KS", "003200.KS", "005430.KS", "015350.KS",
            "001430.KS", "009620.KS", "023000.KS", "079160.KS", "016610.KS",
        ]
    },
    {
        "id": 35, "name": "카지노/레저", "etf": "227560.KS", "emoji": "🎰",
        "tickers": [
            "035250.KS", "034230.KS", "114090.KS", "032350.KS", "008770.KS",
            "079160.KS", "012630.KS", "005300.KS", "004170.KS", "069960.KS",
            "139480.KS", "023530.KS", "007310.KS", "271560.KS",
            "038390.KS", "016610.KS", "004840.KS", "016780.KS", "023590.KQ",
            "078070.KS", "007080.KS",
        ]
    },
    {
        "id": 36, "name": "반도체장비", "etf": "396500.KS", "emoji": "🔬",
        "tickers": [
            "036930.KQ", "089010.KQ", "319660.KQ", "265520.KQ", "122640.KQ",
            "240810.KS", "042700.KS", "178600.KS", "084370.KS", "089030.KS",
            "067310.KS", "054620.KS", "095610.KQ", "140860.KQ",
            "078470.KQ", "083310.KQ", "050890.KQ", "058610.KQ", "107600.KQ",
            "196490.KQ", "210980.KQ", "064760.KQ",
        ]
    },
    {
        "id": 37, "name": "패션/OEM", "etf": "228790.KS", "emoji": "👗",
        "tickers": [
            "105630.KS", "111770.KS", "383220.KS", "081660.KS", "020000.KS",
            "007980.KS", "004150.KS", "071200.KQ",
            "010060.KS", "025870.KS", "000390.KS", "001260.KS",
            "010280.KS", "130960.KS", "009780.KS", "001740.KS", "025260.KS",
            "014940.KS", "004440.KS", "002100.KS", "051600.KS",
        ]
    },
    {
        "id": 38, "name": "교육", "etf": "227560.KS", "emoji": "📚",
        "tickers": [
            "215200.KS", "095720.KS", "370760.KQ", "289010.KQ", "067280.KQ",
            "032860.KQ", "043370.KQ", "096240.KS", "022100.KS", "005670.KS",
            "053800.KS", "082640.KS",
            "031330.KQ", "008800.KS", "063800.KQ", "140410.KQ", "035000.KS",
            "040570.KS", "145970.KQ", "204760.KQ", "013140.KS", "019680.KQ",
        ]
    },
    {
        "id": 39, "name": "광고/마케팅", "etf": "228810.KS", "emoji": "📣",
        "tickers": [
            "030000.KS", "214320.KS", "089600.KS", "230360.KQ",
            "036420.KS", "053800.KS", "035900.KS", "041510.KS", "122870.KS",
            "032500.KQ", "095190.KS", "078020.KS", "033130.KS",
            "105840.KS", "225330.KQ", "215360.KQ", "204210.KQ", "060280.KQ",
            "008370.KS", "043360.KQ", "003240.KS", "024120.KS",
        ]
    },
    {
        "id": 40, "name": "바이오CDMO", "etf": "244580.KS", "emoji": "🧪",
        "tickers": [
            "207940.KS", "302440.KS", "237690.KS", "196170.KQ",
            "145720.KS", "086900.KQ", "019210.KS", "214450.KQ", "243070.KS",
            "091700.KQ", "068060.KQ", "039200.KQ", "298060.KQ",
            "068760.KQ", "041960.KQ", "950130.KS", "214150.KQ", "191420.KQ",
            "090080.KQ", "263720.KQ", "046590.KQ", "220400.KQ",
        ]
    },
]

# ─────────────────────────────────────────
# MA 기울기 신선도 점수 (미국 버전과 동일)
# ─────────────────────────────────────────

def calc_ma_slope_score(ma_series, max_score=13):
    if len(ma_series) < 30:
        return 0.0, "flat", None
    slope_now = float(ma_series.iloc[-1] - ma_series.iloc[-6])
    cur_dir   = 1 if slope_now > 0 else (-1 if slope_now < 0 else 0)
    direction = "bullish" if cur_dir > 0 else ("bearish" if cur_dir < 0 else "flat")
    if cur_dir == 0:
        return 2.0, "flat", None
    ma_ref = abs(float(ma_series.iloc[-1]))
    slope_pct = abs(slope_now) / ma_ref * 100 if ma_ref > 0 else 0.0
    if   slope_pct >= 3.0: velocity_bonus = 5.0
    elif slope_pct >= 1.5: velocity_bonus = 4.0
    elif slope_pct >= 0.8: velocity_bonus = 2.5
    elif slope_pct >= 0.4: velocity_bonus = 1.0
    else:                  velocity_bonus = 0.0
    days_since_turn = None
    for i in range(6, min(80, len(ma_series) - 6)):
        past_slope = float(ma_series.iloc[-i] - ma_series.iloc[-(i + 5)])
        past_dir   = 1 if past_slope > 0 else (-1 if past_slope < 0 else 0)
        if past_dir != 0 and past_dir != cur_dir:
            days_since_turn = i
            break
    if days_since_turn is None:
        return float(min(max_score, 1.0 + velocity_bonus)), direction, None
    if   days_since_turn <= 5:  freshness = 11
    elif days_since_turn <= 10: freshness = 9
    elif days_since_turn <= 20: freshness = 6
    elif days_since_turn <= 40: freshness = 3
    else:                       freshness = 1
    score = min(max_score, freshness + velocity_bonus)
    return float(score), direction, days_since_turn


def calc_weighted_rs(rs_20d, rs_60d, rs_252d):
    pairs     = list(zip(RS_WEIGHTS, (rs_20d, rs_60d, rs_252d)))
    available = [(w, v) for w, v in pairs if v is not None]
    if not available:
        return 0.0
    total_w = sum(w for w, _ in available)
    return round(sum(w * v for w, v in available) / total_w, 2)


def apply_signal_gate(signal, ma_distance_pct, slope_dir, market_regime):
    if signal == "long":
        gate_ok = (ma_distance_pct > 0 and slope_dir == "bullish" and market_regime != "bear")
        if not gate_ok:
            return "long_watch"
    elif signal == "short":
        gate_ok = (ma_distance_pct < 0 and slope_dir == "bearish" and market_regime != "bull")
        if not gate_ok:
            return "short_watch"
    if market_regime == "bear" and signal == "long_watch":
        return "neutral"
    return signal


def calc_conflicts(signal, rs_weighted, ma_distance_pct, slope_dir, sector_rs_60d, market_regime):
    conflicts = 0
    if signal in ("long", "long_watch"):
        if rs_weighted > 10 and sector_rs_60d is not None and sector_rs_60d < -5:
            conflicts += 1
        if ma_distance_pct > 0 and slope_dir == "bearish":
            conflicts += 1
        if market_regime == "bear":
            conflicts += 1
    elif signal in ("short", "short_watch"):
        if rs_weighted < -10 and sector_rs_60d is not None and sector_rs_60d > 5:
            conflicts += 1
        if ma_distance_pct < 0 and slope_dir == "bullish":
            conflicts += 1
        if market_regime == "bull":
            conflicts += 1
    return conflicts


def downgrade_signal(signal, conflicts):
    if conflicts == 0 or signal == "neutral":
        return signal
    order = ["long", "long_watch", "neutral", "short_watch", "short"]
    if signal not in order:
        return signal
    idx = order.index(signal)
    if signal in ("long", "long_watch"):
        idx = min(order.index("neutral"), idx + conflicts)
    elif signal in ("short", "short_watch"):
        idx = max(order.index("neutral"), idx - conflicts)
    return order[idx]


def _ma_bull_pos(d):
    if   d < -15: return 0.0
    elif d <  -5: return (d + 15) / 10 * 6
    elif d <   0: return 6.0 + (d + 5) / 5 * 9
    elif d <  15: return 15.0 + d / 15 * 5
    elif d <  30: return 20.0 - (d - 15) / 15 * 8
    else:         return 5.0


def _ma_bear_pos(d):
    if   d >  15: return 0.0
    elif d >   5: return (15 - d) / 10 * 6
    elif d >   0: return 6.0 + (5 - d) / 5 * 9
    elif d > -15: return 15.0 + (-d) / 15 * 5
    elif d > -30: return 20.0 - (-d - 15) / 15 * 8
    else:         return 5.0


def calc_bull_strength(rs_excess_52w, ma_distance_pct, ma_slope_val, slope_dir,
                       sector_rs_60d, benchmark_ma_distance, benchmark_slope_dir):
    rs_score  = min(30.0, max(0.0,  rs_excess_52w * 0.6))
    ma_score  = _ma_bull_pos(ma_distance_pct)
    slp_score = float(ma_slope_val) if slope_dir == "bullish" else 0.0
    sec_val   = sector_rs_60d if sector_rs_60d is not None else 0.0
    sec_score = min(25.0, max(0.0,  sec_val))
    mkt_score = (6.0 if benchmark_ma_distance > 0       else 0.0) \
              + (6.0 if benchmark_slope_dir == "bullish" else 0.0)
    return round(rs_score + ma_score + slp_score + sec_score + mkt_score, 1)


def calc_bear_strength(rs_excess_52w, ma_distance_pct, ma_slope_val, slope_dir,
                       sector_rs_60d, benchmark_ma_distance, benchmark_slope_dir):
    rs_score  = min(30.0, max(0.0, -rs_excess_52w * 0.6))
    ma_score  = _ma_bear_pos(ma_distance_pct)
    slp_score = float(ma_slope_val) if slope_dir == "bearish" else 0.0
    sec_val   = sector_rs_60d if sector_rs_60d is not None else 0.0
    sec_score = min(25.0, max(0.0, -sec_val))
    mkt_score = (6.0 if benchmark_ma_distance < 0       else 0.0) \
              + (6.0 if benchmark_slope_dir == "bearish" else 0.0)
    return round(rs_score + ma_score + slp_score + sec_score + mkt_score, 1)


def classify_signal(bull_strength, bear_strength):
    net = bull_strength - bear_strength
    if   net >=  50: return "long"
    elif net >=  30: return "long_watch"
    elif net <= -50: return "short"
    elif net <= -30: return "short_watch"
    return "neutral"


def hint_stage(ma_distance_pct, slope_dir, days_since_slope_turn):
    above = ma_distance_pct > 0
    fresh = days_since_slope_turn is not None and days_since_slope_turn <= 20
    if slope_dir == "bullish":
        if not above and ma_distance_pct > -8:
            return "stage1_late"
        elif above and ma_distance_pct <= 15:
            return "stage2_early" if fresh else "stage2"
        else:
            return "stage2_extended"
    else:
        if above and ma_distance_pct < 8:
            return "stage3_late"
        elif not above and ma_distance_pct >= -15:
            return "stage4_early" if fresh else "stage4"
        else:
            return "stage4_extended"


def get_high_days(prices, window, lookback=90):
    prev_max = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).max()
    is_new_high = prices >= prev_max
    recent = is_new_high.iloc[-lookback:]
    if recent.any():
        pos = len(recent) - 1 - recent.values[::-1].argmax()
        return int(len(recent) - 1 - pos)
    return None


def get_low_days(prices, window, lookback=90):
    prev_min = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).min()
    is_new_low = prices <= prev_min
    recent = is_new_low.iloc[-lookback:]
    if recent.any():
        pos = len(recent) - 1 - recent.values[::-1].argmax()
        return int(len(recent) - 1 - pos)
    return None


def get_breakout_onset_days(prices, window, lookback=90, gap_min=10):
    prev_max    = prices.shift(1).rolling(window - 1, min_periods=max(window // 2, 10)).max()
    is_new_high = (prices >= prev_max).fillna(False)
    recent      = is_new_high.iloc[-lookback:]
    arr         = recent.values
    n           = len(arr)
    if not arr.any():
        return None
    latest    = n - 1 - arr[::-1].argmax()
    gap_count = 0
    onset     = latest
    for i in range(latest - 1, -1, -1):
        if arr[i]:
            onset     = i
            gap_count = 0
        else:
            gap_count += 1
            if gap_count >= gap_min:
                break
    return int(n - 1 - onset)


def get_near_high_pct(prices, window):
    rolling_high = prices.rolling(window, min_periods=max(window // 2, 10)).max()
    if len(rolling_high.dropna()) == 0:
        return None
    current = float(prices.iloc[-1])
    high    = float(rolling_high.iloc[-1])
    if high <= 0:
        return None
    return round((high - current) / high * 100, 2)


# ─────────────────────────────────────────
# RS 라인 (정규화, 1년=100)
# ─────────────────────────────────────────

def calc_rs_line(stock_prices, benchmark_prices, window=252):
    """코스피(benchmark) 대비 종목 상대강도 라인 (1년 전 = 100 기준)"""
    aligned = benchmark_prices.reindex(stock_prices.index).dropna()
    common  = stock_prices.reindex(aligned.index).dropna()
    aligned = aligned.reindex(common.index)

    if len(common) < window // 2:
        return []

    base_stock = common.iloc[max(0, len(common) - window)]
    base_bench = aligned.iloc[max(0, len(aligned) - window)]
    if base_stock == 0 or base_bench == 0:
        return []

    rs_line = (common / base_stock) / (aligned / base_bench) * 100
    result  = rs_line.tail(window)
    return [{"d": str(idx.date()), "v": round(float(v), 3)} for idx, v in result.items() if not np.isnan(v)]


def calc_rs_line_sector(stock_prices, sector_prices, window=252):
    """섹터 ETF 대비 종목 상대강도 라인"""
    aligned = sector_prices.reindex(stock_prices.index).dropna()
    common  = stock_prices.reindex(aligned.index).dropna()
    aligned = aligned.reindex(common.index)

    if len(common) < window // 2:
        return []

    base_stock  = common.iloc[max(0, len(common) - window)]
    base_sector = aligned.iloc[max(0, len(aligned) - window)]
    if base_stock == 0 or base_sector == 0:
        return []

    rs_line = (common / base_stock) / (aligned / base_sector) * 100
    result  = rs_line.tail(window)
    return [{"d": str(idx.date()), "v": round(float(v), 3)} for idx, v in result.items() if not np.isnan(v)]


# ─────────────────────────────────────────
# EPS / 매출 수집 (yfinance 한국주식)
# ─────────────────────────────────────────

MAX_EPS_QUARTERS = 20  # 최대 5년치 분기 보존


def merge_eps_history(old: list | None, new: list | None) -> list | None:
    """
    기존 캐시(old)와 신규 수집(new)을 날짜 기준으로 병합.
    - 같은 날짜: 신규 데이터 우선
    - 기존에만 있는 날짜: 보존
    - 최신 MAX_EPS_QUARTERS개 유지
    """
    if not old and not new:
        return None
    if not old:
        return new
    if not new:
        return old
    by_date: dict = {}
    for q in old:
        by_date[q["d"]] = q
    for q in new:
        # 신규 데이터로 덮어쓰되, 기존에 있던 non-None 필드가 신규에서 None이면 기존 유지
        existing = by_date.get(q["d"])
        if existing:
            merged_q = dict(existing)
            for k, v in q.items():
                if v is not None:
                    merged_q[k] = v
            by_date[q["d"]] = merged_q
        else:
            by_date[q["d"]] = q
    sorted_history = sorted(by_date.values(), key=lambda x: x["d"])
    return sorted_history[-MAX_EPS_QUARTERS:]

def _fetch_revenue_map_kr(t) -> dict:
    """quarterly_income_stmt에서 날짜→억원 매출 맵 반환."""
    revenue_map: dict = {}
    try:
        qf = t.quarterly_income_stmt
        if qf is None or qf.empty:
            return revenue_map
        for key in ["Total Revenue", "TotalRevenue", "Operating Revenue"]:
            if key in qf.index:
                for col_date, val in qf.loc[key].items():
                    if pd.notna(val):
                        ts = pd.Timestamp(col_date)
                        revenue_map[ts.tz_localize(None)] = float(val)
                break
    except Exception:
        pass
    return revenue_map


def _match_revenue(revenue_map: dict, date) -> float | None:
    if not revenue_map:
        return None
    date_naive = date.tz_localize(None) if hasattr(date, "tzinfo") and date.tzinfo else date
    closest = min(revenue_map.keys(), key=lambda d: abs((d - date_naive).days))
    if abs((closest - date_naive).days) <= 90:
        return revenue_map[closest] / 1e8  # 억원
    return None


def fetch_eps_data_kr(ticker):
    """
    1차: earnings_dates → 실제 EPS + 기관 추정치 + 매출 (최대 12분기)
    2차: quarterly_income_stmt → 실제 EPS만 + 매출 (폴백, 추정치 없음)
    실패 시 (ticker, None) 반환.
    """
    time.sleep(random.uniform(0.05, 0.20))
    try:
        t = yf.Ticker(ticker)

        # ── 1차: earnings_dates (추정치 포함) ──────────────────────────
        try:
            ed = t.get_earnings_dates(limit=24)  # 6년치 시도
            if ed is not None and not ed.empty:
                now  = pd.Timestamp.now(tz="UTC")
                past = ed[ed.index <= now].dropna(subset=["Reported EPS"])
                if not past.empty:
                    past = past.head(MAX_EPS_QUARTERS).iloc[::-1]
                    revenue_map = _fetch_revenue_map_kr(t)
                    history = []
                    for date, row in past.iterrows():
                        actual   = row.get("Reported EPS")
                        estimate = row.get("EPS Estimate")
                        surp     = row.get("Surprise(%)")
                        rev_val  = _match_revenue(revenue_map, date)
                        history.append({
                            "d":        str(date.date()),
                            "actual":   round(float(actual),   0) if pd.notna(actual)   else None,
                            "estimate": round(float(estimate), 0) if pd.notna(estimate) else None,
                            "surp":     round(float(surp),     2) if pd.notna(surp)     else None,
                            "revenue":  round(rev_val, 1)         if rev_val is not None else None,
                        })
                    if history:
                        return ticker, history
        except Exception:
            pass

        # ── 2차: quarterly_income_stmt 폴백 (추정치 없음) ──────────────
        qi = t.quarterly_income_stmt
        if qi is None or qi.empty:
            return ticker, None

        rev_series = None
        for key in ["Total Revenue", "TotalRevenue", "Operating Revenue"]:
            if key in qi.index:
                rev_series = qi.loc[key]
                break

        eps_series = None
        for key in ["Basic EPS", "Diluted EPS"]:
            if key in qi.index:
                eps_series = qi.loc[key]
                break

        if eps_series is None:
            for key in ["Net Income", "Net Income Common Stockholders"]:
                if key in qi.index:
                    try:
                        shares = (t.info or {}).get("sharesOutstanding") or \
                                 (t.info or {}).get("impliedSharesOutstanding")
                    except Exception:
                        shares = None
                    if shares and shares > 0:
                        eps_series = qi.loc[key] / shares
                    break

        if eps_series is None and rev_series is None:
            return ticker, None

        ref   = eps_series if eps_series is not None else rev_series
        dates = sorted(ref.index)
        history = []
        for date in dates:
            actual = revenue = None
            if eps_series is not None and date in eps_series.index:
                v = eps_series[date]
                if pd.notna(v):
                    actual = round(float(v), 0)
            if rev_series is not None and date in rev_series.index:
                v = rev_series[date]
                if pd.notna(v):
                    revenue = round(float(v) / 1e8, 1)
            if actual is None and revenue is None:
                continue
            d_str = date.strftime("%Y-%m-%d") if hasattr(date, "strftime") else str(date)[:10]
            history.append({"d": d_str, "actual": actual, "estimate": None, "surp": None, "revenue": revenue})

        return ticker, (history[-MAX_EPS_QUARTERS:] if history else None)

    except Exception:
        return ticker, None


def calc_eps_trend_kr(history):
    if not history or len(history) < 3:
        return None
    actuals = [q["actual"] for q in history if q["actual"] is not None]
    if len(actuals) < 3:
        return None
    n      = len(actuals)
    xs     = list(range(n))
    mx, my = sum(xs) / n, sum(actuals) / n
    num    = sum((x - mx) * (y - my) for x, y in zip(xs, actuals))
    den    = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return "stable"
    slope = num / den
    scale = max(abs(my), 1.0)
    if slope / scale > 0.05:
        return "improving"
    elif slope / scale < -0.05:
        return "declining"
    return "stable"


# ─────────────────────────────────────────
# 배치 다운로드 (대량 티커 안정화)
# ─────────────────────────────────────────

def _batch_download(tickers: list, period: str = "2y", chunk_size: int = 80) -> pd.DataFrame:
    """yfinance 단일 호출 한계 우회: chunk_size 단위로 분할 후 합산."""
    all_series: dict = {}
    chunks = [tickers[i:i + chunk_size] for i in range(0, len(tickers), chunk_size)]
    for idx, chunk in enumerate(chunks):
        print(f"  배치 {idx + 1}/{len(chunks)} ({len(chunk)}개)...", end=" ", flush=True)
        try:
            if len(chunk) == 1:
                raw = yf.download(chunk[0], period=period, auto_adjust=True, progress=False)
                if not raw.empty and "Close" in raw.columns:
                    all_series[chunk[0]] = raw["Close"]
            else:
                raw = yf.download(chunk, period=period, auto_adjust=True, progress=False, group_by="column")
                if isinstance(raw.columns, pd.MultiIndex) and "Close" in raw.columns.get_level_values(0):
                    close_df = raw["Close"]
                    for col in close_df.columns:
                        s = close_df[col].dropna()
                        if len(s) > 0:
                            all_series[col] = close_df[col]
                elif not raw.empty and "Close" in raw.columns:
                    all_series[chunk[0]] = raw["Close"]
            print(f"✓ (누적 {len(all_series)}개)")
        except Exception as e:
            print(f"⚠ {e}")
        time.sleep(random.uniform(0.5, 1.0))
    if not all_series:
        return pd.DataFrame()
    return pd.DataFrame(all_series)


# ─────────────────────────────────────────
# 메인
# ─────────────────────────────────────────

def main():
    today_str = datetime.now().strftime("%Y-%m-%d")
    print(f"\n{'='*65}")
    print(f"  한국 워치리스트 (코스피 기준)  |  {today_str}")
    print(f"{'='*65}\n")

    all_tickers  = list({t for s in SECTORS_KR for t in s["tickers"]})
    sector_etfs  = list({s["etf"] for s in SECTORS_KR})
    download_list = list(set(all_tickers + sector_etfs + [BENCHMARK]))

    # ── EPS 캐시 로드
    eps_cache_path = "public/data/eps_cache_kr.json"
    eps_cache: dict = {}
    if os.path.exists(eps_cache_path):
        try:
            with open(eps_cache_path, "r", encoding="utf-8") as f:
                eps_cache = json.load(f)
            print(f"📦 EPS 캐시(KR) 로드: {len(eps_cache)}개 종목")
        except Exception:
            print("  ⚠️  EPS 캐시(KR) 로드 실패 — 빈 캐시로 시작")

    # ── EPS 병렬 수집
    print(f"\n📊 EPS 수집 중... ({len(all_tickers)}개 종목, 병렬)")
    fresh_eps: dict = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = {executor.submit(fetch_eps_data_kr, t): t for t in all_tickers}
        try:
            for future in concurrent.futures.as_completed(futures, timeout=600):
                try:
                    tkr, hist = future.result(timeout=15)
                    fresh_eps[tkr] = hist
                except Exception:
                    fresh_eps[futures[future]] = None
        except concurrent.futures.TimeoutError:
            print("  ⚠️  EPS 수집 timeout — 완료된 것만 사용하고 계속 진행")
            for future, tkr in futures.items():
                if future.done() and tkr not in fresh_eps:
                    try:
                        _, hist = future.result()
                        fresh_eps[tkr] = hist
                    except Exception:
                        fresh_eps[tkr] = None

    eps_dict: dict = {}
    new_count = cache_used = merged_count = 0
    for ticker in all_tickers:
        fresh = fresh_eps.get(ticker)
        old   = eps_cache.get(ticker)
        if fresh:
            # 신규 데이터를 기존 캐시와 병합 → 과거 분기 데이터 보존
            merged = merge_eps_history(old, fresh)
            eps_dict[ticker]  = merged
            eps_cache[ticker] = merged
            if old:
                merged_count += 1
            else:
                new_count += 1
        elif old:
            eps_dict[ticker] = old
            cache_used += 1
        else:
            eps_dict[ticker] = None
    eps_ok = sum(1 for v in eps_dict.values() if v)
    print(f"   EPS 완료: {eps_ok}/{len(all_tickers)}개 (신규 {new_count}개 | 병합 {merged_count}개 | 캐시전용 {cache_used}개)")

    print(f"📥 {len(all_tickers)}개 종목 + {len(sector_etfs)}개 섹터 ETF + 코스피 ({len(download_list)}개 총) 배치 수집 중...")
    prices = _batch_download(download_list, period="2y", chunk_size=80)

    if BENCHMARK not in prices.columns:
        print(f"❌ {BENCHMARK} (코스피) 데이터 없음. 종료.")
        return

    benchmark_prices = prices[BENCHMARK].dropna()

    # ── 벤치마크 수익률 시리즈
    bench_returns_stock  = benchmark_prices.pct_change(RS_WINDOW_STOCK)  * 100
    bench_returns_sector = benchmark_prices.pct_change(RS_WINDOW_SECTOR) * 100
    bench_returns_60d    = benchmark_prices.pct_change(RS_WINDOW_60)     * 100
    bench_returns_20d    = benchmark_prices.pct_change(RS_WINDOW_20)     * 100

    # ── 코스피 시장 강도
    bench_ma100_series  = benchmark_prices.rolling(MA_PERIOD).mean().dropna()
    bench_ma100         = float(bench_ma100_series.iloc[-1])
    bench_price_now     = float(benchmark_prices.iloc[-1])
    kospi_ma_distance   = round((bench_price_now - bench_ma100) / bench_ma100 * 100, 2)
    kospi_slope_now     = float(bench_ma100_series.iloc[-1] - bench_ma100_series.iloc[-6])
    kospi_slope_dir     = "bullish" if kospi_slope_now > 0 else "bearish"

    market_regime = ("bull"  if kospi_ma_distance > 0 and kospi_slope_dir == "bullish"
                     else "bear" if kospi_ma_distance < 0 and kospi_slope_dir == "bearish"
                     else "mixed")
    market_context = {
        "kospi_price":    round(bench_price_now, 2),
        "kospi_ma100":    round(bench_ma100, 2),
        "kospi_ma_dist":  kospi_ma_distance,
        "kospi_slope":    kospi_slope_dir,
        "market_state":   market_regime,
    }
    print(f"📊 코스피 상태: {market_regime.upper()}  (MA100 대비 {kospi_ma_distance:+.1f}%, 기울기 {kospi_slope_dir})")

    # ── 섹터 ETF 강도 (vs 코스피, 60일)
    sector_rs_dict            = {}
    sector_rs_history_dict    = {}
    sector_rs_days_dict       = {}
    sector_rs_slope_dir_dict  = {}
    sector_rs_slope_days_dict = {}

    for etf in sector_etfs:
        if etf not in prices.columns:
            sector_rs_dict[etf]            = None
            sector_rs_history_dict[etf]    = []
            sector_rs_days_dict[etf]       = 0
            sector_rs_slope_dir_dict[etf]  = "flat"
            sector_rs_slope_days_dict[etf] = 0
            continue

        etf_ret = prices[etf].dropna().pct_change(RS_WINDOW_SECTOR) * 100
        aligned = etf_ret.reindex(bench_returns_sector.index)
        diff    = (aligned - bench_returns_sector).dropna()

        if len(diff) == 0:
            sector_rs_dict[etf] = None
            sector_rs_history_dict[etf]    = []
            sector_rs_days_dict[etf]       = 0
            sector_rs_slope_dir_dict[etf]  = "flat"
            sector_rs_slope_days_dict[etf] = 0
            continue

        sector_rs_dict[etf] = round(float(diff.iloc[-1]), 3)
        sector_rs_history_dict[etf] = [
            {"d": str(idx.date()), "v": round(float(val), 3)}
            for idx, val in diff.tail(60).items()
            if not np.isnan(float(val))
        ]

        # 현재 방향 연속 일수
        cur_sign = 1 if float(diff.iloc[-1]) >= 0 else -1
        days_in_dir = 0
        for v in reversed(diff.values):
            if (1 if v >= 0 else -1) == cur_sign:
                days_in_dir += 1
            else:
                break
        sector_rs_days_dict[etf] = days_in_dir

        # RS 기울기 방향
        if len(diff) >= RS_MA_PERIOD + 5:
            ema_now  = diff.ewm(span=RS_MA_PERIOD).mean()
            slope_rs = float(ema_now.iloc[-1] - ema_now.iloc[-6])
            rs_dir   = "up" if slope_rs > 0 else ("down" if slope_rs < 0 else "flat")
        else:
            rs_dir = "flat"
        sector_rs_slope_dir_dict[etf] = rs_dir

        days_in_slope = 0
        if rs_dir != "flat" and len(diff) >= RS_MA_PERIOD:
            ema_series = diff.ewm(span=RS_MA_PERIOD).mean()
            target_dir = 1 if rs_dir == "up" else -1
            for i in range(6, len(ema_series)):
                slope_i = float(ema_series.iloc[-i] - ema_series.iloc[-(i + 5)])
                if (1 if slope_i > 0 else (-1 if slope_i < 0 else 0)) != target_dir:
                    days_in_slope = i
                    break
            if days_in_slope == 0:
                days_in_slope = min(len(ema_series) - 6, 999)
        sector_rs_slope_days_dict[etf] = days_in_slope

    print(f"✅ 섹터 ETF {len(sector_etfs)}개 RS 계산 완료")

    # ── 종목별 처리
    sectors_out = []
    total_count = 0

    for sector in SECTORS_KR:
        s_name      = sector["name"]
        s_etf       = sector["etf"]
        s_emoji     = sector["emoji"]
        s_id        = sector["id"]
        s_tickers   = sector["tickers"]

        sector_rs_60d_val = sector_rs_dict.get(s_etf)
        sector_prices_col = prices[s_etf] if s_etf in prices.columns else None

        stocks_out = []
        for ticker in s_tickers:
            if ticker not in prices.columns:
                continue

            stock_prices = prices[ticker].dropna()
            if len(stock_prices) < MA_PERIOD:
                continue

            # ── 기본 MA
            ma100_series = stock_prices.rolling(MA_PERIOD).mean().dropna()
            if len(ma100_series) < 6:
                continue
            ma100         = float(ma100_series.iloc[-1])
            price_now     = float(stock_prices.iloc[-1])
            ma_distance   = round((price_now - ma100) / ma100 * 100, 2)

            ma150_series = stock_prices.rolling(MA_PERIOD_150).mean().dropna()
            ma150 = float(ma150_series.iloc[-1]) if len(ma150_series) >= 1 else None
            ma150_dist = round((price_now - ma150) / ma150 * 100, 2) if ma150 and ma150 > 0 else None

            ma_slope_val, slope_dir, days_since_slope_turn = calc_ma_slope_score(ma100_series)

            # ── RS (vs 코스피)
            try:
                stock_ret_252 = stock_prices.pct_change(RS_WINDOW_STOCK)
                stock_ret_60  = stock_prices.pct_change(RS_WINDOW_60)
                stock_ret_20  = stock_prices.pct_change(RS_WINDOW_20)

                bench_252 = bench_returns_stock.reindex(stock_ret_252.index)
                bench_60  = bench_returns_60d.reindex(stock_ret_60.index)
                bench_20  = bench_returns_20d.reindex(stock_ret_20.index)

                rs_252 = float(stock_ret_252.iloc[-1] - bench_252.iloc[-1]) if not np.isnan(stock_ret_252.iloc[-1]) and not np.isnan(bench_252.iloc[-1]) else None
                rs_60  = float(stock_ret_60.iloc[-1]  - bench_60.iloc[-1])  if not np.isnan(stock_ret_60.iloc[-1])  and not np.isnan(bench_60.iloc[-1])  else None
                rs_20  = float(stock_ret_20.iloc[-1]  - bench_20.iloc[-1])  if not np.isnan(stock_ret_20.iloc[-1])  and not np.isnan(bench_20.iloc[-1])  else None
            except Exception:
                rs_252 = rs_60 = rs_20 = None

            rs_weighted = calc_weighted_rs(rs_20, rs_60, rs_252)

            # RS 기울기
            try:
                bench_aligned = benchmark_prices.reindex(stock_prices.index)
                rs_ratio = (stock_prices / bench_aligned).dropna()
                if len(rs_ratio) >= RS_MA_PERIOD + 6:
                    rs_ema     = rs_ratio.ewm(span=RS_MA_PERIOD).mean()
                    rs_slope_n = float(rs_ema.iloc[-1] - rs_ema.iloc[-6])
                    rs_slope_d = "up" if rs_slope_n > 0 else ("down" if rs_slope_n < 0 else "flat")
                    rs_slope_days = 0
                    target = 1 if rs_slope_d == "up" else (-1 if rs_slope_d == "down" else 0)
                    for i in range(6, min(80, len(rs_ema))):
                        s_i = float(rs_ema.iloc[-i] - rs_ema.iloc[-(i + 5)])
                        if (1 if s_i > 0 else (-1 if s_i < 0 else 0)) != target:
                            rs_slope_days = i
                            break
                    if rs_slope_days == 0:
                        rs_slope_days = min(len(rs_ema) - 6, 999)
                else:
                    rs_slope_d    = "flat"
                    rs_slope_days = 0
            except Exception:
                rs_slope_d    = "flat"
                rs_slope_days = 0

            # ── 신고가/신저가
            try:
                highs         = {"w52": get_high_days(stock_prices, 252), "w26": get_high_days(stock_prices, 130), "w13": get_high_days(stock_prices, 65)}
                lows          = {"w52": get_low_days(stock_prices, 252),  "w26": get_low_days(stock_prices, 130),  "w13": get_low_days(stock_prices, 65)}
                near_highs    = {"w52": get_near_high_pct(stock_prices, 252), "w26": get_near_high_pct(stock_prices, 130), "w13": get_near_high_pct(stock_prices, 65)}
                breakout_onsets = {"w52": get_breakout_onset_days(stock_prices, 252), "w26": get_breakout_onset_days(stock_prices, 130), "w13": get_breakout_onset_days(stock_prices, 65)}
            except Exception:
                highs = lows = near_highs = breakout_onsets = {"w52": None, "w26": None, "w13": None}

            # ── RS 라인 (6개월, 정규화)
            try:
                rs_bench_line  = calc_rs_line(stock_prices, benchmark_prices, window=120)
                rs_sector_line = calc_rs_line_sector(stock_prices, sector_prices_col, window=120) if sector_prices_col is not None else []
            except Exception:
                rs_bench_line  = []
                rs_sector_line = []

            # ── 시그널
            bull = calc_bull_strength(rs_weighted, ma_distance, ma_slope_val, slope_dir, sector_rs_60d_val, kospi_ma_distance, kospi_slope_dir)
            bear = calc_bear_strength(rs_weighted, ma_distance, ma_slope_val, slope_dir, sector_rs_60d_val, kospi_ma_distance, kospi_slope_dir)
            net  = round(bull - bear, 1)

            signal    = classify_signal(bull, bear)
            signal    = apply_signal_gate(signal, ma_distance, slope_dir, market_regime)
            conflicts = calc_conflicts(signal, rs_weighted, ma_distance, slope_dir, sector_rs_60d_val, market_regime)
            signal    = downgrade_signal(signal, conflicts)

            stage = hint_stage(ma_distance, slope_dir, days_since_slope_turn)

            rs_20_ma = round(float(stock_prices.pct_change(RS_MA_PERIOD).iloc[-1] - benchmark_prices.pct_change(RS_MA_PERIOD).reindex(stock_prices.index).iloc[-1]), 3) if not np.isnan(stock_prices.pct_change(RS_MA_PERIOD).iloc[-1]) else None

            stocks_out.append({
                "ticker":          ticker,
                "score":           net,
                "signal":          signal,
                "stage":           stage,
                "rs_spy_line":     rs_bench_line,   # 필드명 유지 (프론트 호환)
                "rs_sector_line":  rs_sector_line,
                "highs":           highs,
                "lows":            lows,
                "near_highs":      near_highs,
                "breakout_onsets": breakout_onsets,
                "eps":             ({"history": eps_dict.get(ticker), "trend": calc_eps_trend_kr(eps_dict.get(ticker))} if eps_dict.get(ticker) else None),
                "breakdown": {
                    "bull_strength": bull,
                    "bear_strength": bear,
                    "net_direction": net,
                    "ma_slope":      round(ma_slope_val, 2),
                    "sector_rs_60d": round(sector_rs_60d_val, 3) if sector_rs_60d_val is not None else None,
                    "rs_fresh_bull": 0.0,
                    "rs_fresh_bear": 0.0,
                },
                "data": {
                    "price":                 round(price_now, 2),
                    "ma100":                 round(ma100, 2),
                    "ma_distance_pct":       ma_distance,
                    "ma150":                 round(ma150, 2) if ma150 else None,
                    "ma150_distance_pct":    ma150_dist,
                    "slope_dir":             slope_dir,
                    "days_since_slope_turn": days_since_slope_turn,
                    "rs_excess_pct":         round(rs_weighted, 3),
                    "rs_20d_ma":             rs_20_ma,
                    "sector_rs_excess":      round(sector_rs_60d_val, 3) if sector_rs_60d_val is not None else None,
                    "rs_slope_dir":          rs_slope_d,
                    "rs_slope_days":         rs_slope_days,
                },
            })

        # 섹터 내 종목 정렬 (net_direction 내림차순)
        stocks_out.sort(key=lambda x: x["breakdown"]["net_direction"], reverse=True)
        stocks_out = stocks_out[:15]
        total_count += len(stocks_out)

        sectors_out.append({
            "id":                   s_id,
            "name":                 s_name,
            "etf":                  s_etf,
            "emoji":                s_emoji,
            "sector_rs_excess":     round(sector_rs_dict.get(s_etf, 0) or 0, 3),
            "sector_rs_days":       sector_rs_days_dict.get(s_etf, 0),
            "sector_rs_slope_dir":  sector_rs_slope_dir_dict.get(s_etf, "flat"),
            "sector_rs_slope_days": sector_rs_slope_days_dict.get(s_etf, 0),
            "sector_rs_history":    sector_rs_history_dict.get(s_etf, []),
            "stocks":               stocks_out,
        })
        print(f"  ✓ {s_name:16s}  종목 {len(stocks_out):2d}개")

    # 섹터 정렬 (섹터 RS 내림차순, 코스피 시장 섹터는 마지막)
    non_market = [s for s in sectors_out if s["id"] != 26]
    market_sec = [s for s in sectors_out if s["id"] == 26]
    non_market.sort(key=lambda x: x["sector_rs_excess"] or 0, reverse=True)
    sectors_out = non_market + market_sec

    result = {
        "asOf":           today_str,
        "benchmark":      BENCHMARK,
        "ma_period":      MA_PERIOD,
        "rs_window_stock": RS_WINDOW_STOCK,
        "rs_window_sector": RS_WINDOW_SECTOR,
        "total":          total_count,
        "market_context": market_context,
        "sectors":        sectors_out,
    }

    # ── 저장
    out_path = os.path.join(os.path.dirname(__file__), "..", "public", "data", "watchlist_kr.json")
    out_path = os.path.normpath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, separators=(',', ':'))

    # ── EPS 캐시 저장
    with open(eps_cache_path, "w", encoding="utf-8") as f:
        json.dump(eps_cache, f, ensure_ascii=False, indent=2)
    print(f"💾 EPS 캐시(KR) 저장: {len(eps_cache)}개 종목 → {eps_cache_path}")

    print(f"\n✅ 완료!  총 {total_count}개 종목  →  {out_path}")
    print(f"   코스피 상태: {market_regime.upper()}  |  날짜: {today_str}\n")


if __name__ == "__main__":
    main()
