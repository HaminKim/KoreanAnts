"""
REANT 한국 부동산·가계신용 레지스트리 (단일 원천)

- 기획: house/리앤트_한국부동산_신용사이클_개발요구사항.txt
- 데이터 확보성 조사: house/데이터_확보성_조사.md
- build_house.py 가 이 파일을 읽어 public/data/house/ 아래 JSON 을 만든다.

원천
  fred : FRED (BIS·OECD 한국 시계열) — 키 없이 fredgraph CSV 로 동작
  ecos : 한국은행 ECOS — ECOS_API_KEY 필요
  rone : 한국부동산원 R-ONE — RONE_API_KEY 필요 (통계표 ID 는 키 발급 후 확정)

원칙 (매크로와 동일)
  - RAW 는 processed/house/raw/ 에 원본 주기 그대로 저장, 가공값은 별도 배열
  - 분기 데이터는 월별로 보간하지 않는다
  - 받기 실패하거나 키가 없으면 기존 JSON 을 그대로 둔다
  - 광주·전남은 2026-07 통합(전남광주통합특별시) 이후 값을 과거 시계열에 임의로 이어붙이지 않는다
"""

START = "1975-01-01"

# ─────────────────────────────────────────────────────────────
# API 키 안내 (화면의 '키 필요' 툴팁·안내 패널)
# ─────────────────────────────────────────────────────────────
APIS = {
    "ECOS": {
        "name": "한국은행 ECOS",
        "env": "ECOS_API_KEY",
        "url": "https://ecos.bok.or.kr/api/",
        "steps": [
            "ecos.bok.or.kr/api 접속 → 회원가입(무료)",
            "로그인 → 「인증키 신청」 → 사용 목적 입력 → 즉시 발급",
            "GitHub 레포 Settings → Secrets → Actions 에 ECOS_API_KEY 로 등록",
        ],
        "unlocks": "지역별 집값(실거래가지수)·주택대출·연체율·미분양, 대출태도·대출수요, 주담대 금리",
    },
    "RONE": {
        "name": "한국부동산원 R-ONE",
        "env": "RONE_API_KEY",
        "url": "https://www.reb.or.kr/r-one/portal/openapi/openApiIntroPage.do",
        "steps": [
            "reb.or.kr/r-one 접속 → 회원가입(무료)",
            "Open API → 「인증키 신청」",
            "GitHub Secrets 에 RONE_API_KEY 로 등록",
        ],
        "unlocks": "2003년부터의 아파트 매매·전세가격지수, 아파트 거래량, 시군구 단위",
    },
}

# ─────────────────────────────────────────────────────────────
# 17개 시도
#   geo  : KOSTAT 2013 시도 코드 (지도 경계 파일)
#   loan : ECOS 151Y003 / 151Y006 / 141Y005 지역코드
#   rtx  : ECOS 901Y089 (아파트 매매 실거래가격지수) 항목코드
#   uns  : ECOS 901Y074 (미분양주택현황) 항목코드
# ─────────────────────────────────────────────────────────────
REGIONS = [
    dict(id="seoul",     ko="서울", name="서울특별시",       geo="11", loan="A00", rtx="200", uns="I410B"),
    dict(id="busan",     ko="부산", name="부산광역시",       geo="21", loan="B00", rtx="500", uns="I410C"),
    dict(id="daegu",     ko="대구", name="대구광역시",       geo="22", loan="C00", rtx="600", uns="I410D"),
    dict(id="incheon",   ko="인천", name="인천광역시",       geo="23", loan="D00", rtx="700", uns="I410E"),
    dict(id="gwangju",   ko="광주", name="광주광역시",       geo="24", loan="F00", rtx="800", uns="I410F"),
    dict(id="daejeon",   ko="대전", name="대전광역시",       geo="25", loan="E00", rtx="900", uns="I410G"),
    dict(id="ulsan",     ko="울산", name="울산광역시",       geo="26", loan="G00", rtx="A00", uns="I410H"),
    dict(id="sejong",    ko="세종", name="세종특별자치시",   geo="29", loan="H00", rtx="B00", uns="I410L"),
    dict(id="gyeonggi",  ko="경기", name="경기도",           geo="31", loan="L00", rtx="C00", uns="I410I"),
    dict(id="gangwon",   ko="강원", name="강원특별자치도",   geo="32", loan="M00", rtx="D00", uns="I410J"),
    dict(id="chungbuk",  ko="충북", name="충청북도",         geo="33", loan="N00", rtx="E00", uns="I410K"),
    dict(id="chungnam",  ko="충남", name="충청남도",         geo="34", loan="P00", rtx="F00", uns="I410S"),
    dict(id="jeonbuk",   ko="전북", name="전북특별자치도",   geo="35", loan="Q00", rtx="G00", uns="I410M"),
    dict(id="jeonnam",   ko="전남", name="전라남도",         geo="36", loan="R00", rtx="H00", uns="I410N"),
    dict(id="gyeongbuk", ko="경북", name="경상북도",         geo="37", loan="S00", rtx="I00", uns="I410O"),
    dict(id="gyeongnam", ko="경남", name="경상남도",         geo="38", loan="T00", rtx="J00", uns="I410P"),
    dict(id="jeju",      ko="제주", name="제주특별자치도",   geo="39", loan="U00", rtx="K00", uns="I410Q"),
]
MERGED_NOTE = "2026년 7월 광주·전남이 전남광주통합특별시로 합쳐져서, 이후 값은 통합 코드로 따로 집계돼요"

# ─────────────────────────────────────────────────────────────
# 지도 지표 (시도별)
#   fetch : ECOS 호출 목록 — 여러 개면 합산 (예: 은행 + 비은행 주택대출)
#   item  : 지역 코드를 끼울 자리는 {loan} / {rtx} / {uns}
#   tf    : 지도 색칠에 쓰는 값 (level | yoy | dd = 고점 대비 하락률)
#   good  : up = 오르면 초록, down = 오르면 빨강 (연체율·미분양)
# ─────────────────────────────────────────────────────────────
REGION_METRICS = [
    dict(id="price_yoy", label="아파트 실거래가 1년 변화", short="집값 YoY", unit="%", tf="yoy", good="up", dec=1,
         need="ECOS", start="200601", cycle="M",
         fetch=[("901Y089", "{rtx}")],
         desc="한국부동산원 아파트 매매 실거래가격지수의 1년 전 대비 변화예요. 실제 신고된 거래로 계산해서 표본 지수보다 움직임이 커요."),
    dict(id="price_dd", label="아파트 실거래가 고점 대비", short="고점 대비", unit="%", tf="dd", good="up", dec=1,
         need="ECOS", start="200601", cycle="M",
         fetch=[("901Y089", "{rtx}")],
         desc="2006년 이후 가장 높았던 달과 비교해 지금 몇 % 아래에 있는지예요. 0% 면 지금이 신고가예요."),
    dict(id="loan_yoy", label="주택관련대출 1년 증가율", short="주택대출 YoY", unit="%", tf="yoy", good="none", dec=1,
         need="ECOS", start="200712", cycle="M",
         fetch=[("151Y003", "11110A0/{loan}"), ("151Y006", "11A00A0/{loan}")],
         desc="예금은행 + 비은행(저축은행·상호금융·새마을금고 등) 주택관련대출 잔액의 1년 증가율이에요. 지역은 금융기관 소재지 기준이라 담보 주택이 있는 곳과 다를 수 있어요."),
    dict(id="delinq", label="은행 주택관련대출 연체율", short="연체율", unit="%", tf="level", good="down", dec=2,
         need="ECOS", start="201912", cycle="M",
         fetch=[("141Y005", "R5AB0C/{loan}/0960")],
         desc="국내은행 주택관련대출 중 1개월 이상 연체된 비율이에요. 2019년 12월부터만 공개돼요."),
    dict(id="unsold", label="미분양 주택", short="미분양", unit="호", tf="level", good="down", dec=0,
         need="ECOS", start="200701", cycle="M",
         fetch=[("901Y074", "{uns}")],
         desc="분양하고도 팔리지 않은 주택 수예요. 늘어나면 공급 과잉이나 수요 위축 신호예요."),
]

# ─────────────────────────────────────────────────────────────
# 전국 시리즈 (macro 와 같은 SeriesData 형식으로 출력 → 같은 차트 엔진 사용)
#   src: fred | ecos | rone
# ─────────────────────────────────────────────────────────────
S = {}


def series(key, label, units, freq, tf, src, src_id, dec=1, note=None, since=None, need=None):
    S[key] = {
        "key": key, "label": label, "units": units, "freq": freq, "tf": tf, "src": src, "srcId": src_id,
        "agg": None, "dec": dec, "note": note, "since": since, "backfill": None, "need": need,
    }


# 키 없이 (FRED: BIS·OECD)
series("KR_HPI_REAL", "한국 실질 주택가격 (BIS)", "지수 (2010=100)", "Q", ["yoy", "level"], "fred", "QKRR628BIS",
       note="BIS 주거용 부동산 가격, 소비자물가로 나눈 실질 지수. 전국 단위")
series("KR_HPI_NOM", "한국 명목 주택가격 (BIS)", "지수 (2010=100)", "Q", ["yoy", "level"], "fred", "QKRN628BIS",
       note="BIS 주거용 부동산 가격, 명목. 전국 단위")
series("KR_HHCREDIT_GDP", "가계신용 / GDP (BIS)", "% of GDP", "Q", ["level", "chg"], "fred", "QKRHAM770A",
       note="BIS 가계(및 비영리단체) 부문 신용 잔액을 명목 GDP 로 나눈 값")
series("KR_CALL", "콜금리 (단기 시장금리)", "%", "M", ["level", "chg"], "fred", "IRSTCI01KRM156N", dec=2,
       note="OECD 집계 한국 익일물 콜금리. 기준금리와 거의 같이 움직여요",
       since="OECD 월간 콜금리 시계열이 1991년부터 있어요")
series("KR_10Y", "국고채 10년 금리", "%", "M", ["level", "chg"], "fred", "IRLTLT01KRM156N", dec=2,
       since="OECD 월간 국고채 10년 시계열이 2000년 10월부터 있어요")
series("KR_UNEMP", "실업률", "%", "M", ["level", "chg"], "fred", "LRHUTTTTKRM156S",
       note="OECD 계절조정 실업률", since="OECD 월간 실업률 시계열이 1990년부터 있어요")

# ECOS 키 필요
series("KR_LEND_ATT", "은행 대출태도 — 가계 주택", "지수 (+완화 / −강화)", "Q", ["level", "chg"], "ecos", "514Y001/Q/AA04",
       dec=0, need="ECOS", note="한국은행 대출행태서베이. 은행 여신 담당자 설문이라 실제 승인율은 아니에요",
       since="한국은행 대출행태서베이가 2002년 1분기부터 있어요")
series("KR_LEND_DEM", "가계 주택대출 수요", "지수 (+증가 / −감소)", "Q", ["level", "chg"], "ecos", "514Y003/Q/CC04",
       dec=0, need="ECOS", since="한국은행 대출행태서베이가 2002년 1분기부터 있어요")
series("KR_MORT_RATE", "주담대 금리 (신규취급)", "연 %", "M", ["level", "chg"], "ecos", "121Y006/M/BECBLA0302",
       dec=2, need="ECOS", since="예금은행 주담대 신규취급 금리가 2001년 9월부터 공표돼요")
series("KR_RTX_NATION", "아파트 실거래가격지수 — 전국", "지수", "M", ["yoy", "level"], "ecos", "901Y089/M/100",
       need="ECOS", since="실거래 신고제가 2006년에 시작돼서 지수도 2006년 1월부터 있어요")
series("KR_RTX_SEOUL", "아파트 실거래가격지수 — 서울", "지수", "M", ["yoy", "level"], "ecos", "901Y089/M/200",
       need="ECOS", since="실거래 신고제가 2006년에 시작돼서 지수도 2006년 1월부터 있어요")
series("KR_KB_SEOUL_APT", "KB 서울 아파트 매매가격지수", "지수", "M", ["yoy", "level"], "ecos", "901Y062/M/P63ACA",
       need="ECOS", since="KB 주택가격동향 조사가 1986년 1월부터 있어요")
series("KR_UNSOLD", "미분양 주택 — 전국", "호", "M", ["level", "yoy"], "ecos", "901Y074/M/I410A",
       dec=0, need="ECOS", since="월간 미분양 통계가 2007년 1월부터 있어요")
series("KR_HH_MORT_LOAN", "주택관련대출 잔액 — 예금은행 전국", "십억 원", "M", ["yoy", "level"], "ecos", "151Y003/M/11110A0/X00",
       dec=0, need="ECOS", since="지역별 주택관련대출 통계가 2006년 12월부터 있어요")

# R-ONE 키 필요 (통계표 ID 는 키 발급 후 확정 → 그 전까지 안내만 표시)
series("KR_RONE_APT_IDX", "아파트 매매가격지수 (부동산원)", "지수", "M", ["yoy", "level"], "rone", None,
       need="RONE", since="부동산원 월간 아파트 지수는 2003년 11월부터예요 (키 발급 후 확인)")
series("KR_RONE_APT_VOL", "아파트 매매 거래량", "건", "M", ["level", "yoy"], "rone", None,
       dec=0, need="RONE", since="실거래 신고제 이후인 2006년부터예요 (키 발급 후 확인)")
series("KR_RONE_JEONSE_RATIO", "아파트 전세가율 (전세/매매)", "%", "M", ["level", "chg"], "rone", None,
       need="RONE")

# ─────────────────────────────────────────────────────────────
# 화면 카드 (그룹별) — main 의 첫 시리즈가 카드 값
# ─────────────────────────────────────────────────────────────
GROUPS = [
    {"id": "price",  "name": "집값",       "desc": "전국 주택가격 사이클"},
    {"id": "credit", "name": "빚과 대출",   "desc": "얼마나 빌렸고, 은행이 얼마나 빌려주려 하나"},
    {"id": "rates",  "name": "금리",       "desc": "대출 이자 부담의 방향"},
    {"id": "stress", "name": "부실·수급",   "desc": "안 팔리는 집, 못 갚는 빚"},
]

INDICATORS = [
    dict(id="hpi_real", group="price", ko="실질 주택가격", main=["KR_HPI_REAL"],
         what="물가를 뺀 전국 집값이에요. 1975년부터 길게 볼 수 있는 유일한 공개 시계열이라 큰 사이클을 보기에 좋아요."),
    dict(id="hpi_nom", group="price", ko="명목 주택가격", main=["KR_HPI_NOM"],
         what="물가를 빼지 않은 전국 집값이에요. 뉴스에서 말하는 '집값'에 가까워요."),
    dict(id="rtx_seoul", group="price", ko="서울 아파트 실거래가", main=["KR_RTX_SEOUL"], subs=["KR_RTX_NATION"],
         what="실제로 신고된 아파트 거래로 만든 지수예요. 표본조사 지수보다 빠르고 크게 움직여요."),
    dict(id="kb_seoul", group="price", ko="KB 서울 아파트", main=["KR_KB_SEOUL_APT"],
         what="1986년부터 이어지는 KB 서울 아파트 지수예요. 1990년대 초 하락, 2008년 이후 조정까지 비교할 수 있어요."),
    dict(id="rone_idx", group="price", ko="아파트 매매가격지수", main=["KR_RONE_APT_IDX"],
         what="한국부동산원 표본조사 지수예요. 시도·시군구별로 2003년부터 볼 수 있어요."),
    dict(id="rone_vol", group="price", ko="아파트 거래량", main=["KR_RONE_APT_VOL"],
         what="거래량은 보통 가격보다 먼저 돌아서요. 바닥 확인에 가장 많이 쓰는 지표예요."),
    dict(id="jeonse", group="price", ko="전세가율", main=["KR_RONE_JEONSE_RATIO"],
         what="매매가 대비 전세가 비율이에요. 높을수록 적은 돈으로 살 수 있어서(갭) 매수 수요가 붙기 쉬워요."),

    dict(id="hh_gdp", group="credit", ko="가계신용 / GDP", main=["KR_HHCREDIT_GDP"],
         what="나라 경제 규모 대비 가계 빚이에요. 한국은 세계 최상위권이에요. 이 비율이 빠르게 오를 때 집값도 같이 올랐어요."),
    dict(id="mort_loan", group="credit", ko="주택관련대출 잔액", main=["KR_HH_MORT_LOAN"],
         what="은행 주택관련대출이 1년 동안 얼마나 늘었는지예요. 집값 상승기에 빠르게 늘어요."),
    dict(id="lend_att", group="credit", ko="은행 대출태도", main=["KR_LEND_ATT"],
         what="은행이 주택대출을 쉽게 내주려는지(+) 깐깐하게 하려는지(−) 설문한 값이에요. 정책 규제가 바로 반영돼요."),
    dict(id="lend_dem", group="credit", ko="주택대출 수요", main=["KR_LEND_DEM"],
         what="은행이 느끼는 가계 주택대출 수요예요. 매수 심리를 거의 실시간으로 보여줘요."),

    dict(id="call", group="rates", ko="콜금리", main=["KR_CALL"],
         what="기준금리와 거의 같이 움직이는 단기 금리예요. 집값 사이클의 가장 큰 바깥 요인이에요."),
    dict(id="mort_rate", group="rates", ko="주담대 금리", main=["KR_MORT_RATE"],
         what="실제로 새로 받는 주택담보대출 금리예요. 매수자의 이자 부담을 직접 보여줘요."),
    dict(id="ktb10", group="rates", ko="국고채 10년", main=["KR_10Y"],
         what="장기 금리예요. 고정금리 주담대 금리의 기준이 돼요."),

    dict(id="unsold", group="stress", ko="미분양", main=["KR_UNSOLD"],
         what="팔리지 않은 새 집이에요. 쌓이면 건설사·지방 시장 부담이 커지고, 줄어들기 시작하면 바닥 신호로 봐요."),
    dict(id="unemp", group="stress", ko="실업률", main=["KR_UNEMP"],
         what="일자리를 잃으면 대출을 못 갚아요. 연체·경매로 이어지는 첫 단계예요."),
]

# ─────────────────────────────────────────────────────────────
# 한국 부동산·금융 이벤트 (차트 음영)
# ─────────────────────────────────────────────────────────────
EVENTS = [
    dict(id="kr_imf",   name="IMF 외환위기",          frm="1997-11", to="1998-12", note="외환위기, 금리 급등. 1998년 실질 집값 급락"),
    dict(id="kr_card",  name="카드대란",              frm="2003-03", to="2004-03", note="신용카드 부실 사태"),
    dict(id="kr_dti",   name="DTI 수도권 확대",        frm="2006-11", to="2007-02", note="2006.11.15 대책, 2007년 DTI 수도권 확대 적용"),
    dict(id="kr_gfc",   name="글로벌 금융위기",        frm="2008-09", to="2009-03", note="리먼 사태, 한은 기준금리 5.25% → 2.0%"),
    dict(id="kr_ease14", name="LTV·DTI 완화",         frm="2014-08", to="2014-08", note="2014.08 LTV 70%·DTI 60% 로 일원화 완화"),
    dict(id="kr_82",    name="8·2 대책",              frm="2017-08", to="2017-08", note="투기지역 지정, LTV·DTI 40% 강화"),
    dict(id="kr_913",   name="9·13 대책",             frm="2018-09", to="2018-09", note="다주택자 주담대 금지, 종부세 강화"),
    dict(id="kr_1216",  name="12·16 대책",            frm="2019-12", to="2019-12", note="15억 초과 주택 주담대 금지"),
    dict(id="kr_covid", name="코로나 초저금리",        frm="2020-03", to="2021-07", note="기준금리 0.5%, 영끌 매수 정점"),
    dict(id="kr_hike",  name="금리 인상기",            frm="2021-08", to="2023-01", note="기준금리 0.5% → 3.5%, 2022년 집값 급락"),
    dict(id="kr_sdsr",  name="스트레스 DSR",           frm="2024-02", to="2025-07", note="1단계 2024.02 → 2단계 2024.09 → 3단계 2025.07"),
    dict(id="kr_627",   name="6·27 대출 규제",         frm="2025-06", to="2025-06", note="수도권 주담대 6억 원 상한"),
    dict(id="kr_1015",  name="10·15 대책",            frm="2025-10", to="2025-10", note="서울 전역 규제지역·토지거래허가구역 지정"),
]
