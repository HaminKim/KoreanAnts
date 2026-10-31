# REANT (KoreanAnts) — Claude 작업 가이드

한국 개인투자자(서학개미) 미국주식 매매 흐름 + 미국 매크로 지표 사이트. Next.js 16 (App Router) + Vercel 배포.
GitHub `HaminKim/KoreanAnts` (**공개 레포** — 비밀값·개인 정보는 커밋하지 말 것). 사용자와는 한국어(해요체)로 대화.

## 브랜치·배포
- 배포는 하루 2번 예약 (2026-10-31, Vercel Deployment Storage 10GB 초과 대응): `main` 에 푸시해도 바로 배포 안 됨. `scripts/vercel-ignore.sh` 가 `chore(deploy)` 커밋과 메시지에 `[deploy]` 가 있는 커밋만 빌드하고, `.github/workflows/deploy-daily.yml` 이 10:30·00:30 KST 에 빈 `chore(deploy)` 커밋으로 쌓인 변경을 배포. 급하면 커밋 메시지에 `[deploy]` 또는 deploy-daily 수동 실행. 매크로 리뉴얼은 `renewal` 브랜치로 시작했지만 지금은 `main` 과 같은 커밋으로 맞춰 운영 중 (main 푸시 후 `git push origin main:renewal` 로 동기화).
- 커밋 메시지 형식: `feat(macro): ...`, `chore(data): ...` 처럼 영역 접두어 + 한국어 설명.
- 로컬(Windows)에서는 `python` 이 스토어 바로가기라 동작하지 않음 → `py` 사용.

## 주요 경로
- `/` 새 랜딩(기본 5Y) · `/ants` 기존 메인(개미지수) · `/explore` 허브
- `/macro` 지표 목록 · `/macro/[id]` 지표 상세 · `/macro/workspace` 여러 지표 비교 (저장은 브라우저 localStorage)
- `/watchlist`, `/watchlist-kr`, `/sectors`, `/flow` 등 매매 흐름 페이지

## 매크로 데이터 파이프라인
- **단일 원천**: `scripts/macro/registry.py`
  - `CATEGORIES` 카테고리 · `series(...)` 시리즈(FRED/shiller/yahoo/derived) · `INDICATORS` 지표 카드 · `RELATIONS` 지표 관계 · `EVENTS` 위기 음영
- 쉬운 설명(해요체): `scripts/macro/explain.py` — `EXPLAIN`(지표 id), `SERIES_EXPLAIN`(보조 시리즈 key)
- 빌드: `py scripts/macro/build_macro.py [KEY ...]` → `public/data/macro/series/*.json`, `public/data/macro/catalog.json`, RAW 는 `processed/macro/raw/*.csv`
  - 계산 시리즈는 `build_macro.py` 의 `fetch_derived` 에 추가 (예: `REAL10Y_EST`, `HHDEBT_DPI`)
  - 받기 실패한 시리즈는 기존 JSON 유지 (빈 화면 방지)
- 자동 갱신: `.github/workflows/macro-sync.yml` (매일 07:10·23:40 KST). `FRED_API_KEY` 는 GitHub Secrets 에 있음.
- 프론트는 catalog.json 을 읽어 그리므로, 지표 추가는 보통 registry/explain 수정 + 빌드만으로 끝남.

### 사용자 확정 결정 (다시 묻거나 뒤집지 말 것)
- 차트는 1970년부터. 데이터가 늦게 시작하면 `since` 에 이유를 적어 화면에 표시
- ISM PMI → 지역 연준 서베이(필라델피아·엠파이어·댈러스)로 대체, AAII 제외 (라이선스)
- NBER 경기침체 + 위기 이벤트 음영 사용, 로그 축은 옵션으로만
- 분기 데이터는 월별로 보간하지 않음, RAW 는 덮어쓰지 않고 가공값은 별도 배열
- 원안 33개 지표 + 추가분 #34~36 (2026-10-18, 가계부채: `hh_debt`, `debt_service`, `mort_delinq`)

## 한국 부동산 (`/house`)
- 기획 `house/리앤트_한국부동산_신용사이클_개발요구사항.txt`, 데이터 확보성 조사 `house/데이터_확보성_조사.md`
- 레지스트리 `scripts/house/house_registry.py` (REGIONS 17개 시도·ECOS 코드, REGION_METRICS 지도 지표, 전국 SERIES, EVENTS) → `py scripts/house/build_house.py` → `public/data/house/{catalog,regions}.json`, `series/*.json` (macro 와 같은 형식이라 `MacroChart` 재사용)
- 지도 경계 `py scripts/house/build_map.py` → `public/data/house/map.json` (KOSTAT 2013, 경계 바뀔 때만)
- 키: `ECOS_API_KEY`, `RONE_API_KEY` (GitHub Secrets). 없으면 해당 지표는 화면에 '키 필요' + 발급 안내. R-ONE srcId 는 `통계표ID/분류ID/항목ID` (예: `A_2024_00045/500001/100001`, 500001 = 전국). 통계표 목록은 `SttsApiTbl.do`, 항목은 `SttsApiTblItm.do` 로 조회
- 2026-07 광주+전남 → 전남광주통합특별시. 과거 시계열은 광주·전남 따로, 통합 코드(V00 등)와 이어붙이지 않음
- 시군구·구 드릴다운 (전국 → 시군구 → 일반구, 예: 경기 → 고양시 → 일산서구)
  - 경계 `py scripts/house/build_local_map.py` → `local/geo_{시도}.json` (vuski/admdongkor sgg, MIT. 경계 바뀔 때만)
  - 데이터 `py scripts/house/build_local.py [--force]` → `local/{시도}.json`, `local/index.json`, RAW `processed/house/raw/local_*.csv`
  - 84㎡ 집값 = 최근 ㎡당 평균가격 × 84, 과거는 매매가격지수 비율로 환산 (평균가격은 표본 개편 때 끊김). 군 지역은 표본이 없어 거래량만
  - 상세 화면 순서(사용자 확정): 집값 + 상태(최고가 ±3% → '최고가', 3개월 연속 하락 → '하락 중', 그 외 '고점 대비 −N%') → 금액 흐름 차트(고점 표시) → YoY·MoM·전세가율·거래량
  - 프론트 `app/house/local.tsx` (지도·상세·차트), 클릭 = 상세, 더블클릭/상세 버튼 = 확대
  - 구 없는 시·광역시 군·세종은 '생활권'(행정동 묶음, 사용자 확인 완료): `scripts/house/living_areas.py` → 지도 단위 `{시군구코드}_{NN}` (kind='area'). 집값은 국토부 실거래가(`MOLIT_API_KEY`, 공공데이터포털 '아파트 매매 실거래가 상세 자료')
    - `py scripts/house/build_trades.py [--max-calls N]` (build_local.py 다음) → RAW `processed/house/raw/trades/{시군구}/{연도}.csv`, 결과는 `local/{시도}.json` 에 생활권 단위로 덧붙임
    - 시 전체와 따로 놀지 않게(사용자 요청): 생활권 집값 = 부동산원 시 84㎡ 집값(흐름) × 생활권/시 기준값 비율(3개월 평균) × 시별 수준 보정(최근 1년 실거래 ÷ 부동산원, 상수)
      - ㎡당 값: 최근 6개월(모자라면 12개월) 전용 75~95㎡ 실거래 가중 중앙값, 한 단지 비중 15% 상한 / 시 기준값: 생활권 값의 고정 가중(전체 기간 거래 비중) 평균
      - 단지별 중앙값(단지 1표)은 작은 구축 단지가 과대 대표돼 버림. 지방은 부동산원 평균가가 실거래보다 30~40% 낮아 수준 보정 필요
      - 부동산원 값 없는 군(군위·강화)은 실거래 중앙값 그대로. 2006년(실거래 신고제 시작)부터, 이번 달(신고 미완)은 제외. 자동 갱신은 하루 한도(1만) 안에서 07:10 실행이 9000번까지
    - 법정동→행정동 연결표 `processed/house/kikmix.csv` (행안부 jscode 의 KIKmix, 행정동 바뀌면 `--kikmix jscode.zip` 로 갱신). 여러 생활권에 걸친 법정동은 같은 이름 행정동 → `BJD_OVERRIDE` 순
    - 파주는 교하·운정이 법정동을 공유해서 '운정·교하' 하나로 묶음
- 수도권 단지별 지도 (2026-10-31, 사용자 요청): 맨 아래 단위(서울 구·경기 일반구/시/군·생활권) 더블클릭 또는 상세의 '단지별 지도로 보기' → 구 지도 안에 행정동 경계 + 아파트 단지
  - 동은 클릭 단위가 아니라 배경 (사용자 결정). 휠·드래그·핀치로 확대: 멀리선 동별 시세, 확대하면 단지 시세, 더 확대하면 단지 이름까지
  - `build_trades.py` 가 수도권은 모든 구·시·군 실거래를 받음 (apts.csv 에 umd·지번·도로명 추가) → `py scripts/house/build_apts.py [--geocode]` → `public/data/house/apt/{단위}.json`, `{단위}_h.json`, `index.json`
  - 단지 시세 = 직전 12개월 ㎡당 실거래 중앙값 × 84 (전용 30~200㎡, 3건 이상), 흐름은 분기 말마다. 최근 5년 거래 없는 단지 제외
  - 좌표: 브이월드 지오코더(`VWORLD_API_KEY`, EPSG:5179) 캐시 `processed/house/apt_xy.csv`. 파일은 위경도(자체 TM 역변환). 못 찾은 단지(`ap`)는 지도에 안 찍고 목록에만 (어긋나 보인다는 사용자 피드백)
  - 배경지도: 브이월드 white 타일(`NEXT_PUBLIC_VWORLD_KEY`, Vercel 환경변수) 을 흑백·반투명으로, 구 밖은 페이지 배경으로 가림 (사용자 결정: 그 구만, 사이트 톤 유지)
  - 프론트 `app/house/apts.tsx`
  - 전철 노선·역 (사용자 요청: 흐린 배경지도와 달리 노선 색 그대로): `py scripts/house/build_subway.py` → `public/data/house/subway.json` (OpenStreetMap Overpass, ODbL — 지도에 '전철 © OpenStreetMap' 표시. 노선 바뀔 때만)
- 경매 신청 (대법원 등기정보광장 Open API, 2010~, 집합건물): `py scripts/house/build_auction.py [--fetch-only|--no-fetch]` → RAW `processed/house/raw/auction/{auction|forced}_{시도코드}.csv`
  - 키: `IROS_AUCTION_KEY`(임의경매, 서비스 0000000083) · `IROS_FORCED_KEY`(강제경매, 0000000087). 키마다 하루 1,000번, 한 번에 12개월까지, **24개월마다 재발급**(2028-10 경), 3개월 미사용 시 삭제
  - 시도 코드: 서울 900·부산 800·대구 600·인천 1100·전남광주 1200·대전 700·울산 1000·세종 1700·경기 200·강원 100·충북 1600·충남 1500·전북 1300·경북 400·경남 300·제주 1400 (동시 호출 많으면 연결 끊김 → 천천히)
  - 전국 카드(KR_AUCTION·KR_AUCTION_FORCED)·시도 지도(auction_12m·auction_yoy)는 build_house 가 RAW 로(src=iros), 시군구·구는 build_auction 이 local/{시도}.json 에 `auc` 로 붙임
- 갱신은 `macro-sync.yml`: 경매 받기 → `build_house.py` → `build_local.py` → `build_trades.py` → 경매 붙이기 (모두 continue-on-error)

## 매매 흐름 데이터 파이프라인
- `scraper/` (구 reant_streamlit 레포를 subtree 로 통합) 가 Seibro(예탁결제원)를 Selenium 으로 스크랩
- `.github/workflows/daily-sync.yml` 이 하루 여러 번: 누락일 탐지(`scraper/find_missing_days.py`) → 날짜별 다운로드 → `combine_data.py` → `clean_and_enrich.py` → `public/data/**` JSON 재생성·커밋
- flow JSON 날짜는 원본 CSV 보다 영업일 2일 전으로 표시 (Seibro T+2 공시) — 정상
- 미국 채권 휴장 다음날 Seibro 1행 데이터는 신경 쓰지 않음 (사용자 지시)

## UI 원칙
- 데이터 로드 실패 시 "데이터 없음" 화면 금지 → localStorage 캐시로 폴백 (워치리스트 KR/US)
- 강조/비강조가 있는 차트: 비강조는 과감히 흐리게(opacity ≤ 0.1), 강조·기준선은 확실히 진하게 (유튜브 자료화면 용도)
- 워치리스트 캡처 모드: 흑배경, 히트맵은 강세 초록 / 약세 빨강

## 최근 매크로 분석 메모 (2026-10-18, 데이터 기준 2026년 2분기~10월)
- 가계부채: 가처분소득 대비 89% (2007년 정점 134%), 원리금 상환 부담 11.1% (2007년 15.8%), 주담대 연체율 1.86% → 건전. 다만 부채 증가율이 2.5% → 3.9% 로 가속, 주담대 연체율 소폭 상승
- 밸류에이션: CAPE 40.7 (1970년 이후 닷컴 정점 44.2 다음), 10Y 실질금리 2.9% (2003년 이후 최고권), 가계 주식 비중 48% (사상 최고), BAA 스프레드 1.46%p (역사적 하단)
- 과거 유사 국면: 다요인 기준 1999-12 · 2000-02 가 가장 비슷, 그다음 1998-06 · 1997-10. CAPE ≥ 30 일 때 다음 12개월 평균 +6.4% (전체 +9.4%), 하락 확률 33% (전체 26%), 중간 낙폭 중앙값 −11% (전체 −6%)
- 1999년과의 차이: 후행 PER 25 (당시 28~30), 3년 연평균 이익 증가 +17.7% (당시 +8%), 국민계정 기업이익도 +27% 로 동행 (2000년엔 +2%). "가격이 이익을 앞선 버블" 보다 "이익이 따라오는 고평가" 에 가까움
- 핵심 관찰 변수: 기업이익 증가세 둔화, 실질금리 추가 상승, 신용 스프레드 확대, 실업률·Sahm Rule
