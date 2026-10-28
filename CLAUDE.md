# REANT (KoreanAnts) — Claude 작업 가이드

한국 개인투자자(서학개미) 미국주식 매매 흐름 + 미국 매크로 지표 사이트. Next.js 16 (App Router) + Vercel 배포.
GitHub `HaminKim/KoreanAnts` (**공개 레포** — 비밀값·개인 정보는 커밋하지 말 것). 사용자와는 한국어(해요체)로 대화.

## 브랜치·배포
- `main` 에 푸시하면 Vercel 이 자동 배포. 매크로 리뉴얼은 `renewal` 브랜치로 시작했지만 지금은 `main` 과 같은 커밋으로 맞춰 운영 중 (main 푸시 후 `git push origin main:renewal` 로 동기화).
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
  - 구 없는 시·광역시 군·세종은 '생활권'(행정동 묶음, 사용자 확인 완료): `scripts/house/living_areas.py` → 지도 단위 `{시군구코드}_{NN}` (kind='area'). 집값은 국토부 실거래가(`MOLIT_API_KEY`)로 채움
- 갱신은 `macro-sync.yml` 의 스텝 (`build_house.py`, `build_local.py`, 둘 다 continue-on-error)

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
