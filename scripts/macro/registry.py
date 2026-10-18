"""
REANT 매크로 지표 레지스트리 (단일 원천)

- 원본: Macro/reant_macro_indicator_master.xlsx (33개 1차 후보) + reant_macro_project_prompt.txt
- build_macro.py 가 이 파일을 읽어 public/data/macro/ 아래 JSON 을 만든다.
- 설명 문구를 고치려면 여기만 수정하면 된다.

용어
  SERIES    : 실제로 내려받는 하나의 시계열 (FRED ID 등)
  INDICATOR : 화면에서 '지표 카드' 하나 = 메인 시리즈 1개 이상 + 보조 시리즈
  transform : level(원본) / yoy / mom / qoq / qoq_saar / chg(전기 대비 차이) / chg_3ma / avg_3m

원칙 (Project_Rules 시트)
  - RAW 는 덮어쓰지 않는다. 가공값은 별도 배열로 만든다.
  - 일/주 데이터는 RAW 보존 후 월 단위(avg 또는 last)로 변환. 방법은 series.agg 에 명시.
  - 분기 데이터는 월별로 보간하지 않는다.
"""

# ─────────────────────────────────────────────────────────────
# 카테고리 (표시 순서) — 이름·순서는 기획 v0.3 기준 '미확정'. 임시 배치.
# ─────────────────────────────────────────────────────────────
CATEGORIES = [
    {"id": "growth",    "name": "경기·성장",   "desc": "경제 전체와 기업 활동이 확장 중인가"},
    {"id": "labor",     "name": "고용",        "desc": "노동시장이 버티고 있는가"},
    {"id": "consumer",  "name": "소비자",      "desc": "소득 → 저축 → 소비 → 빚 → 연체의 흐름"},
    {"id": "inflation", "name": "물가",        "desc": "물가 수준과 그 원인(원자재·노동·수요)"},
    {"id": "rates",     "name": "금리",        "desc": "정책금리, 장기금리, 수익률곡선"},
    {"id": "credit",    "name": "신용",        "desc": "채권시장 가격과 은행 대출태도"},
    {"id": "housing",   "name": "주택",        "desc": "금리에 가장 민감한 실물 경기"},
    {"id": "liquidity", "name": "유동성",      "desc": "재무부·연준 대차대조표의 유동성 흡수/공급"},
    {"id": "sentiment", "name": "심리·자산배분", "desc": "금융시장 스트레스와 투자자 포지션"},
    {"id": "valuation", "name": "밸류에이션",  "desc": "주식 가격이 이익 대비 얼마나 낙관을 반영하는가"},
    {"id": "market",    "name": "주가지수",    "desc": "비교 기준이 되는 미국 대표 지수"},
]

# ─────────────────────────────────────────────────────────────
# SERIES
#   src : fred | shiller | yahoo
#   freq: D / W / M / Q  (원천 주기)
#   agg : D/W → 월 변환 방법. avg = 월평균, last = 월말 값
#   tf  : 제공할 변환값 (첫 번째가 기본)
#   dec : 표시 소수 자리 (level 기준)
# ─────────────────────────────────────────────────────────────
S = {}


def series(key, label, units, freq, tf, src="fred", src_id=None, agg=None, dec=1, note=None):
    S[key] = {
        "key": key, "label": label, "units": units, "freq": freq, "tf": tf,
        "src": src, "srcId": src_id or key, "agg": agg, "dec": dec, "note": note,
    }


# 경기·성장
series("GDPC1", "Real GDP", "십억 달러 (2017년 불변, SAAR)", "Q", ["yoy", "qoq_saar", "level"], dec=0)
series("CP", "Corporate Profits (세후)", "십억 달러 (SAAR)", "Q", ["yoy", "qoq", "level"], dec=0)
series("CMRMTSPL", "Real Manufacturing & Trade Sales", "백만 달러 (2017년 불변)", "M", ["yoy", "mom", "level"], dec=0)
series("INDPRO", "Industrial Production", "지수 (2017=100)", "M", ["yoy", "mom", "level"])
series("NEWORDER", "Core Capital Goods Orders", "백만 달러", "M", ["yoy", "mom", "level"], dec=0,
       note="비국방 자본재 (항공기 제외)")
series("ANXAUO", "Core Capital Goods Unfilled Orders", "백만 달러", "M", ["yoy", "mom", "level"], dec=0,
       note="비국방 자본재 (항공기 제외) 미충족 주문")

# 고용
series("UNRATE", "Unemployment Rate", "%", "M", ["level", "chg"])
series("SAHMREALTIME", "Sahm Rule (실시간)", "%p", "M", ["level"], dec=2,
       note="실업률 3개월 평균이 직전 12개월 최저 대비 얼마나 올랐는지. 0.5 이상이면 경기침체 초기 신호로 쓰임")
series("PAYEMS", "Nonfarm Payrolls", "천 명", "M", ["chg", "chg_3ma", "level", "yoy"], dec=0)
series("CES0500000003", "Average Hourly Earnings", "달러/시간", "M", ["yoy", "mom", "level"], dec=2)

# 소비자
series("DPCERA3M086SBEA", "Real PCE (지수)", "지수 (2017=100)", "M", ["yoy", "mom", "level"],
       note="FRED의 달러 표시 Real PCE(PCEC96)는 2007년부터만 있어서, 1959년부터 이어지는 실질 소비 지수를 메인으로 사용")
series("PCEC96", "Real PCE (달러)", "십억 달러 (2017년 불변, SAAR)", "M", ["yoy", "mom", "level"], dec=0)
series("PSAVERT", "Personal Saving Rate", "%", "M", ["level", "chg"])
series("DSPIC96", "Real Disposable Personal Income", "십억 달러 (2017년 불변, SAAR)", "M", ["yoy", "mom", "level"], dec=0)
series("DDURRA3M086SBEA", "Real Durable Goods PCE", "지수 (2017=100)", "M", ["yoy", "mom", "level"])
series("DFXARA3M086SBEA", "Real Food PCE (가정 내 식품)", "지수 (2017=100)", "M", ["yoy", "mom", "level"])
series("REVOLSL", "Revolving Consumer Credit", "백만 달러", "M", ["yoy", "chg", "level"], dec=0)
series("TOTALSL", "Total Consumer Credit", "백만 달러", "M", ["yoy", "chg", "level"], dec=0)
series("DRCCLACBS", "Credit Card Delinquency Rate", "%", "Q", ["level", "chg"], dec=2)
series("CORCCACBS", "Credit Card Charge-off Rate", "%", "Q", ["level", "chg"], dec=2)

# 물가
series("CPIAUCSL", "CPI", "지수 (1982-84=100)", "M", ["yoy", "mom", "level"], dec=2)
series("CPILFESL", "Core CPI", "지수 (1982-84=100)", "M", ["yoy", "mom", "level"], dec=2)
series("PCEPILFE", "Core PCE Price Index", "지수 (2017=100)", "M", ["yoy", "mom", "level"], dec=2)
series("TCU", "Capacity Utilization", "%", "M", ["level", "chg"])
series("WPSID62", "Unprocessed Goods PPI", "지수 (1982=100)", "M", ["yoy", "mom", "level"])
series("WPSID622", "Unprocessed Goods PPI (식품·에너지 제외)", "지수 (1982=100)", "M", ["yoy", "mom", "level"])
series("WTISPLC", "WTI Crude Oil", "달러/배럴", "M", ["level", "yoy", "mom"], dec=2)
series("WPSID61", "Processed Intermediate Goods PPI", "지수 (1982=100)", "M", ["yoy", "mom", "level"])
series("ULCNFB", "Unit Labor Cost (비농업)", "지수 (2017=100)", "Q", ["yoy", "qoq_saar", "level"],
       note="엑셀 원안의 PRS85006111 은 이미 '전기 대비 연율 %' 로 가공된 값이라, YoY/QoQ 를 직접 계산할 수 있도록 같은 통계의 지수(ULCNFB)를 RAW 로 사용")
series("OPHNFB", "Labor Productivity (비농업)", "지수 (2017=100)", "Q", ["yoy", "qoq_saar", "level"])

# 금리
series("FEDFUNDS", "Fed Funds Rate", "%", "M", ["level", "chg"], dec=2)
series("GS10", "10Y Treasury Yield", "%", "M", ["level", "chg"], dec=2, note="FRED 월평균 값")
series("T10Y2Y", "10Y-2Y Spread", "%p", "D", ["level"], agg="avg", dec=2)
series("T10Y3M", "10Y-3M Spread", "%p", "D", ["level"], agg="avg", dec=2)
series("DFII10", "10Y Real Yield (TIPS)", "%", "D", ["level", "chg"], agg="avg", dec=2)
series("T10YIE", "10Y Breakeven Inflation", "%", "D", ["level", "chg"], agg="avg", dec=2)

# 신용
series("BAMLH0A0HYM2", "High Yield OAS (ICE BofA)", "%p", "D", ["level", "chg"], agg="avg", dec=2,
       note="ICE 라이선스 정책으로 FRED 에는 최근 약 3년치만 공개됨")
series("BAA10Y", "Moody's BAA - 10Y Spread", "%p", "D", ["level", "chg"], agg="avg", dec=2,
       note="장기(1986~) 신용 스프레드 대용. 투자등급 하단 기준이라 HY 보다 폭이 작음")
series("DRTSCILM", "SLOOS: C&I 대출기준 강화 은행 비율", "% (순비율)", "Q", ["level", "chg"],
       note="대·중견기업 대상 상업·산업(C&I) 대출")
series("DRSDCILM", "SLOOS: C&I 대출수요 증가 은행 비율", "% (순비율)", "Q", ["level", "chg"])

# 주택
series("HOUST", "Housing Starts", "천 호 (SAAR)", "M", ["level", "avg_3m", "yoy", "mom"], dec=0)
series("PERMIT", "Building Permits", "천 호 (SAAR)", "M", ["level", "avg_3m", "yoy"], dec=0)
series("COMPUTSA", "Housing Completions", "천 호 (SAAR)", "M", ["level", "avg_3m", "yoy"], dec=0)
series("HSN1F", "New Home Sales", "천 호 (SAAR)", "M", ["level", "avg_3m", "yoy"], dec=0)

# 유동성
series("WTREGEN", "Treasury General Account", "백만 달러", "W", ["level", "chg"], agg="last", dec=0,
       note="주간(수요일) 잔액의 월말 값. 2002-12 이전 구 시리즈와는 잇지 않음")
series("WALCL", "Fed Total Assets", "백만 달러", "W", ["level", "chg", "yoy"], agg="last", dec=0)
series("RRPONTSYD", "Overnight Reverse Repo", "십억 달러", "D", ["level", "chg"], agg="avg", dec=1)

# 심리·자산배분
series("NFCIRISK", "NFCI Risk Subindex", "표준편차 (0=평균)", "W", ["level", "chg"], agg="avg", dec=2)
series("VIXCLS", "VIX", "지수", "D", ["level"], agg="avg", dec=1)
series("BOGZ1FL153064486Q", "Household Equity Exposure", "% (금융자산 대비 주식)", "Q", ["level", "chg"])

# 밸류에이션
series("CAPE", "Shiller CAPE", "배 (P/E10)", "M", ["level"], src="shiller", dec=1,
       note="Robert Shiller 공개 데이터 (월평균 가격 기준)")
series("PE_TTM", "S&P 500 Trailing P/E", "배 (가격 / 최근 12개월 EPS)", "M", ["level"], src="shiller", dec=1,
       note="Shiller 데이터의 S&P 종합지수 월평균 가격 ÷ 최근 12개월 보고 이익(E). "
            "E 는 분기 실적을 Shiller 가 월별로 보간한 값이며, 최신 분기 실적이 반영되기까지 몇 달 늦다")

# 주가지수 (비교 기준)
series("SPX", "S&P 500", "지수 (월말 종가)", "D", ["level", "yoy"], src="yahoo", src_id="^GSPC", agg="last", dec=0)
series("NDX", "Nasdaq-100", "지수 (월말 종가)", "D", ["level", "yoy"], src="yahoo", src_id="^NDX", agg="last", dec=0)


# ─────────────────────────────────────────────────────────────
# INDICATORS (33개 1차 후보 + 비교용 지수)
#   main  : 카드/상세의 기본 시리즈 (여러 개면 함께 표시: 예 10Y-2Y + 10Y-3M)
#   subs  : 보조/연결 지표
#   status: live | pending (데이터 미확보·라이선스)
#   what  : 설명하는 것 (엑셀)
#   read  : 핵심 해석 (엑셀)
#   caution: 오해 방지 문구
# ─────────────────────────────────────────────────────────────
INDICATORS = [
    # ── 경기·성장 ──
    dict(no=1, id="gdp", cat="growth", name="Real GDP", ko="실질 GDP", pri="A",
         main=["GDPC1"], subs=[],
         what="경제 전체 성장률과 경기 결과 확인",
         read="GDP는 '확인' 성격이 강한 지표다. 주식은 GDP보다 먼저 움직이는 경우가 많다.",
         caution="분기 데이터이며 월별로 보간하지 않는다. 발표 후에도 여러 차례 수정된다."),
    dict(no=2, id="ism_mfg", cat="growth", name="ISM Manufacturing PMI", ko="ISM 제조업 PMI", pri="A",
         main=[], subs=[], status="pending",
         what="제조업 확장/수축과 경기 전환",
         read="50 상회=확장, 하회=수축. 수준보다 방향과 New Orders가 중요하다.",
         caution="ISM 민간 데이터로 공개 재배포 라이선스 확인 전까지 준비 중."),
    dict(no=3, id="ism_svc", cat="growth", name="ISM Services PMI", ko="ISM 서비스업 PMI", pri="A",
         main=[], subs=[], status="pending",
         what="미국 서비스업 경기",
         read="미국 경제에서 서비스 비중이 커 제조업 PMI와 보완적으로 본다.",
         caution="ISM 민간 데이터로 공개 재배포 라이선스 확인 전까지 준비 중."),
    dict(no=17, id="corp_profits", cat="growth", name="Corporate Profits", ko="기업이익", pri="A",
         main=["CP"], subs=[],
         what="기업이익 사이클",
         read="주가와 실적 사이의 괴리, 그리고 어느 쪽이 먼저 움직이는지 확인한다.",
         caution="분기 데이터이며 월별로 보간하지 않는다."),
    dict(no=18, id="mt_sales", cat="growth", name="Real Manufacturing & Trade Sales", ko="실질 제조·유통 매출", pri="B",
         main=["CMRMTSPL"], subs=["INDPRO"],
         what="기업 실물 매출과 활동",
         read="분기 GDP·기업이익보다 빠르게 월별로 확인할 수 있는 실물 지표다."),
    dict(no=22, id="core_capex", cat="growth", name="Core Capital Goods Orders", ko="핵심 자본재 주문", pri="A",
         main=["NEWORDER"], subs=["ANXAUO"],
         what="기업의 설비투자 의지",
         read="항공기·국방을 제외해 대형 일회성 주문에 의한 왜곡을 줄였다.",
         caution="명목 금액이라 물가 상승분이 섞여 있다."),

    # ── 고용 ──
    dict(no=5, id="unrate", cat="labor", name="Unemployment Rate", ko="실업률", pri="A",
         main=["UNRATE"], subs=["SAHMREALTIME"],
         what="노동시장 악화/회복 확인",
         read="절대 수준뿐 아니라 최근 3개월 동안 오르고 있는지가 중요하다. Sahm Rule이 이를 수치화한다."),
    dict(no=6, id="nfp", cat="labor", name="Nonfarm Payrolls", ko="비농업 고용", pri="A",
         main=["PAYEMS"], subs=["CES0500000003"],
         what="고용 창출 속도",
         read="RAW 고용 수준보다 월간 증감(천 명)과 3개월 평균이 핵심이다.",
         caution="속보치는 이후 두 달에 걸쳐 수정된다."),

    # ── 소비자 ──
    dict(no=14, id="real_dpi", cat="consumer", name="Real Disposable Personal Income", ko="실질 가처분소득", pri="A",
         main=["DSPIC96"], subs=[],
         what="세금·물가 차감 후 실제 소비 여력",
         read="소득↑+소비↑가 건강한 조합. 소득↓+소비↑는 신용·저축에 기대고 있을 수 있다."),
    dict(no=13, id="saving_rate", cat="consumer", name="Personal Saving Rate", ko="개인 저축률", pri="A",
         main=["PSAVERT"], subs=[],
         what="가처분소득 중 저축 비중",
         read="급등은 방어적 행동이나 정부 이전지출 영향일 수 있어 단독으로 해석하지 않는다."),
    dict(no=12, id="real_pce", cat="consumer", name="Real PCE", ko="실질 개인소비지출", pri="A",
         main=["DPCERA3M086SBEA"], subs=["PCEC96"],
         what="물가를 제거한 실제 소비",
         read="소비자 사이클의 중심 지표다."),
    dict(no=20, id="durable_pce", cat="consumer", name="Real Durable Goods PCE", ko="실질 내구재 소비", pri="B",
         main=["DDURRA3M086SBEA"], subs=[],
         what="자동차·가전 등 큰돈 쓰는 소비",
         read="경기가 나빠지면 필수소비보다 먼저 미뤄질 수 있다."),
    dict(no=21, id="food_pce", cat="consumer", name="Real Food PCE", ko="실질 식품 소비", pri="B",
         main=["DFXARA3M086SBEA"], subs=[],
         what="필수소비 스트레스 확인",
         read="필수소비까지 줄어들면 소비자 압박이 심하다는 확인 신호가 된다."),
    dict(no=15, id="revolving", cat="consumer", name="Revolving Consumer Credit", ko="리볼빙 소비자신용", pri="B",
         main=["REVOLSL"], subs=["TOTALSL"],
         what="카드·리볼빙 부채 사용",
         read="증가 자체가 악재는 아니다. 연체율과 같이 본다."),
    dict(no=16, id="cc_delinq", cat="consumer", name="Credit Card Delinquency Rate", ko="신용카드 연체율", pri="A",
         main=["DRCCLACBS"], subs=["CORCCACBS"],
         what="소비자 상환 스트레스",
         read="리볼빙 증가보다 실제 스트레스를 확인하는 데 유용한 후행 지표다.",
         caution="분기 데이터이며 월별로 보간하지 않는다."),

    # ── 물가 ──
    dict(no=4, id="cpi", cat="inflation", name="CPI", ko="소비자물가지수", pri="A",
         main=["CPIAUCSL"], subs=["CPILFESL", "PCEPILFE"],
         what="소비자물가 메인 지표",
         read="YoY로 장기 흐름을, MoM으로 최근 가속/둔화를 본다."),
    dict(no=28, id="capacity", cat="inflation", name="Capacity Utilization", ko="설비가동률", pri="B",
         main=["TCU"], subs=["INDPRO"],
         what="수요가 생산능력을 얼마나 압박하는지 (수요 압력)",
         read="절대 임계치보다 수준과 방향을 같이 본다."),
    dict(no=29, id="ppi_unproc", cat="inflation", name="Unprocessed Goods PPI", ko="원자재 생산자물가", pri="A",
         main=["WPSID62"], subs=["WTISPLC", "WPSID622"],
         what="원자재발 인플레이션 압력",
         read="CPI보다 공급망 상류에 있다. 변동성이 크다. WTI로 원유 영향을 분리해 본다."),
    dict(no=31, id="ppi_inter", cat="inflation", name="Processed Intermediate Goods PPI", ko="중간재 생산자물가", pri="B",
         main=["WPSID61"], subs=[],
         what="가공 중간재·생산요소 비용",
         read="원자재 압력이 생산 과정으로 전이되는 단계다."),
    dict(no=30, id="ulc", cat="inflation", name="Unit Labor Cost", ko="단위노동비용", pri="A",
         main=["ULCNFB"], subs=["OPHNFB"],
         what="생산성 대비 노동비용 압력",
         read="임금만이 아니라 생산성과 같이 봐야 한다.",
         caution="분기 데이터이며 월별로 보간하지 않는다."),

    # ── 금리 ──
    dict(no=7, id="fedfunds", cat="rates", name="Fed Funds Rate", ko="연방기금금리", pri="A",
         main=["FEDFUNDS"], subs=[],
         what="Fed 정책 방향",
         read="상승=긴축, 하락=완화. 하지만 주가 방향과 1:1로 대응하지 않는다."),
    dict(no=8, id="ust10y", cat="rates", name="10Y Treasury Yield", ko="미국 10년물 국채금리", pri="A",
         main=["GS10"], subs=["DFII10", "T10YIE"],
         what="장기 할인율과 성장·물가 기대",
         read="금리가 '왜' 오르는지를 실질금리와 기대인플레로 분해해서 본다. 금리 상승이 기계적으로 주식 악재는 아니다."),
    dict(no=9, id="yield_curve", cat="rates", name="Yield Curve: 10Y-2Y + 10Y-3M", ko="수익률곡선", pri="A",
         main=["T10Y2Y", "T10Y3M"], subs=[],
         what="수익률곡선과 경기침체 위험",
         read="역전 자체보다 역전 → 다시 가팔라짐(정상화)까지의 흐름을 확인한다."),
    dict(no=33, id="real_yield", cat="rates", name="10Y Real Yield + 10Y Breakeven", ko="실질금리 + 기대인플레", pri="A",
         main=["DFII10", "T10YIE"], subs=["GS10"],
         what="10년 명목금리를 실질금리와 기대인플레로 분해",
         read="Nasdaq·CAPE 해석에 특히 중요하다. Breakeven에는 위험 프리미엄 등도 섞여 있다.",
         caution="TIPS 기반이라 2003년부터 사용 가능."),

    # ── 신용 ──
    dict(no=10, id="hy_spread", cat="credit", name="High Yield Spread", ko="하이일드 스프레드", pri="A",
         main=["BAMLH0A0HYM2"], subs=["BAA10Y"],
         what="회사채 시장이 가격으로 나타내는 신용위험·Risk-off",
         read="급격한 확대 = 스트레스. SLOOS와 세트로 해석한다.",
         caution="ICE BofA 데이터는 FRED에 최근 약 3년만 공개된다. 장기 비교는 BAA-10Y 스프레드를 함께 본다."),
    dict(no=11, id="sloos", cat="credit", name="SLOOS Lending Standards", ko="은행 대출태도 (SLOOS)", pri="A",
         main=["DRTSCILM"], subs=["DRSDCILM"],
         what="은행이 대출을 얼마나 조이거나 푸는가",
         read="높은 양수 = 대출기준 긴축. 신용 공급 측면을 본다.",
         caution="분기 설문이며 월별로 보간하지 않는다."),

    # ── 주택 ──
    dict(no=19, id="housing", cat="housing", name="Housing Starts", ko="주택 착공", pri="A",
         main=["HOUST"], subs=["PERMIT", "COMPUTSA", "HSN1F"],
         what="금리에 민감한 주택 경기",
         read="변동성이 커서 3개월 평균을 함께 보는 것이 유용하다."),

    # ── 유동성 ──
    dict(no=32, id="tga", cat="liquidity", name="Treasury General Account (TGA)", ko="재무부 일반계정", pri="B",
         main=["WTREGEN"], subs=["WALCL", "RRPONTSYD"],
         what="재무부 현금관리에 따른 유동성 흡수/공급 방향",
         read="TGA 증가 = 시중 유동성 흡수 방향. Fed 대차대조표·역레포와 함께 본다.",
         caution="Fed 정책과 같은 개념이 아니며 단독 매매 신호가 아니다. 2002-12 이후 현행 시리즈만 사용."),

    # ── 심리·자산배분 ──
    dict(no=24, id="nfci_risk", cat="sentiment", name="NFCI Risk Subindex", ko="NFCI 위험 하위지수", pri="A",
         main=["NFCIRISK"], subs=["VIXCLS"],
         what="실제 금융시장 위험·스트레스",
         read="0보다 높을수록 평소보다 위험이 높은 방향이다."),
    dict(no=23, id="aaii", cat="sentiment", name="AAII Bull-Bear Spread", ko="AAII 강세-약세 스프레드", pri="B",
         main=[], subs=[], status="pending",
         what="개인투자자 낙관/비관",
         read="극단값은 역발상 정보가 될 수 있으나 단독 신호로 쓰지 않는다.",
         caution="AAII 민간 데이터로 재배포 조건 확인 전까지 준비 중."),
    dict(no=25, id="hh_equity", cat="sentiment", name="Household Equity Exposure", ko="가계 주식 노출도", pri="B",
         main=["BOGZ1FL153064486Q"], subs=[],
         what="가계 금융자산 중 주식 비중",
         read="신규 매수뿐 아니라 주가 상승에 따른 평가 효과가 섞여 있다.",
         caution="분기 데이터이며 월별로 보간하지 않는다."),

    # ── 밸류에이션 ──
    dict(no=26, id="cape", cat="valuation", name="Shiller CAPE", ko="쉴러 CAPE", pri="A",
         main=["CAPE"], subs=["DFII10"],
         what="장기 밸류에이션과 시장 낙관의 가격 반영 정도",
         read="높다고 곧 하락한다는 뜻이 아니다. 장기 기대수익률 관점에서 10Y 실질금리와 함께 본다."),
    dict(no=27, id="trailing_pe", cat="valuation", name="S&P 500 Trailing P/E", ko="S&P500 후행 PER", pri="C",
         main=["PE_TTM"], subs=["CAPE"],
         what="최근 12개월 이익 대비 가격",
         read="CAPE와 중복도가 높아 삭제 후보. 경기침체기에는 이익(E)이 급감해 PER이 일시적으로 치솟을 수 있다.",
         caution="Shiller 공개 데이터로 계산. 이익은 분기 실적을 월별로 보간한 값이라 최신 실적 반영이 몇 달 늦다."),

    # ── 비교 기준 지수 (33개 외) ──
    dict(no=None, id="sp500", cat="market", name="S&P 500", ko="S&P 500", pri="-",
         main=["SPX"], subs=[],
         what="미국 대형주 500개 지수",
         read="모든 매크로 지표의 기본 비교 대상.",
         caution="매크로 비교용은 월말 종가. 1970년부터."),
    dict(no=None, id="ndx", cat="market", name="Nasdaq-100", ko="나스닥 100", pri="-",
         main=["NDX"], subs=[],
         what="나스닥 상장 비금융 대형주 100개 지수",
         read="금리·실질금리에 민감한 성장주 중심 지수.",
         caution="매크로 비교용은 월말 종가. 1985년 10월부터."),
]

# ─────────────────────────────────────────────────────────────
# KNOWLEDGE (지표 관계) — 1차 초안. 화면에서는 '초안'으로 표기.
#   type: drives(원인) / leads(선행) / lags(후행) / confirms(확인) / decomposes(구성요소) / affects(영향)
# ─────────────────────────────────────────────────────────────
RELATIONS = [
    ("ppi_unproc", "drives", "ppi_inter"),
    ("ppi_inter", "drives", "cpi"),
    ("capacity", "drives", "cpi"),
    ("ulc", "drives", "cpi"),
    ("cpi", "affects", "fedfunds"),
    ("fedfunds", "affects", "ust10y"),
    ("real_yield", "decomposes", "ust10y"),
    ("real_yield", "affects", "ndx"),
    ("real_yield", "affects", "cape"),
    ("ust10y", "affects", "housing"),
    ("fedfunds", "affects", "yield_curve"),
    ("yield_curve", "leads", "unrate"),
    ("hy_spread", "confirms", "sloos"),
    ("sloos", "leads", "core_capex"),
    ("nfci_risk", "confirms", "hy_spread"),
    ("real_dpi", "drives", "real_pce"),
    ("saving_rate", "affects", "real_pce"),
    ("real_pce", "decomposes", "gdp"),
    ("durable_pce", "decomposes", "real_pce"),
    ("food_pce", "decomposes", "real_pce"),
    ("revolving", "affects", "real_pce"),
    ("cc_delinq", "lags", "revolving"),
    ("nfp", "confirms", "unrate"),
    ("core_capex", "leads", "gdp"),
    ("corp_profits", "affects", "sp500"),
    ("cape", "affects", "sp500"),
    ("hh_equity", "confirms", "cape"),
    ("tga", "affects", "nfci_risk"),
    ("housing", "leads", "gdp"),
]


# ─────────────────────────────────────────────────────────────
# 위기·시장 이벤트 (차트 음영) — 월 단위. from~to 는 해당 월 전체를 덮는다.
#   경기침체(NBER) 음영은 FRED USREC 에서 자동 생성되므로 여기엔 '시장 사건'만 둔다.
#   기간 기준: 주가 고점~저점 또는 사건 발생 월 (note 에 근거 표기)
# ─────────────────────────────────────────────────────────────
EVENTS = [
    dict(id="oil1",    name="1차 오일쇼크",        frm="1973-10", to="1974-03", note="OPEC 석유 금수 (1973.10~1974.03)"),
    dict(id="volcker", name="볼커 긴축",           frm="1979-10", to="1982-08", note="Fed 고금리 정책 시작(1979.10) ~ 주식 강세장 시작(1982.08). 2차 오일쇼크 겹침"),
    dict(id="bm87",    name="블랙먼데이",          frm="1987-10", to="1987-10", note="1987.10.19 S&P500 하루 -20%"),
    dict(id="asia97",  name="아시아 외환위기",     frm="1997-07", to="1998-01", note="태국 바트화 폭락(1997.07) ~ 한국 IMF 구제금융(1997.12)"),
    dict(id="ltcm",    name="LTCM·러시아",         frm="1998-08", to="1998-10", note="러시아 디폴트(1998.08), LTCM 구제(1998.09)"),
    dict(id="dotcom",  name="닷컴버블 붕괴",       frm="2000-03", to="2002-10", note="Nasdaq 고점(2000.03) ~ S&P500 저점(2002.10)"),
    dict(id="sep11",   name="9·11",               frm="2001-09", to="2001-09", note="2001.09.11 테러, 미국 증시 4거래일 휴장"),
    dict(id="gfc",     name="글로벌 금융위기",     frm="2007-10", to="2009-03", note="S&P500 고점(2007.10) ~ 저점(2009.03)"),
    dict(id="lehman",  name="리먼 파산",           frm="2008-09", to="2008-09", note="2008.09.15 리먼브러더스 파산"),
    dict(id="euro11",  name="유럽 재정위기·美 강등", frm="2011-07", to="2011-10", note="S&P의 미국 신용등급 강등(2011.08), 유럽 재정위기 확산"),
    dict(id="cny15",   name="위안화 쇼크",         frm="2015-08", to="2016-02", note="중국 위안화 절하(2015.08), 유가 급락 동반"),
    dict(id="q418",    name="2018 Q4 긴축 쇼크",   frm="2018-10", to="2018-12", note="Fed 금리 인상·양적긴축 우려로 S&P500 약 -20%"),
    dict(id="covid",   name="코로나19",            frm="2020-02", to="2020-04", note="S&P500 고점(2020.02.19) ~ 저점(2020.03.23), 경기침체 2020.02~04"),
    dict(id="bear22",  name="인플레·금리 급등",    frm="2022-01", to="2022-10", note="Fed 급격한 금리 인상기 약세장 (S&P500 저점 2022.10)"),
    dict(id="svb",     name="SVB 은행위기",        frm="2023-03", to="2023-03", note="2023.03 실리콘밸리은행 파산"),
    dict(id="tariff25", name="트럼프 관세 쇼크",   frm="2025-03", to="2025-04", note="상호관세 발표(2025.04.02) 전후 급락, S&P500 저점 2025.04.08"),
]
