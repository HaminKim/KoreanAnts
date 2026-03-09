// 미국 주요 종목 한글 이름
export const KOREAN_NAMES: Record<string, string> = {
  // 빅테크
  AAPL: '애플', MSFT: '마이크로소프트', GOOGL: '알파벳', GOOG: '알파벳',
  AMZN: '아마존', META: '메타', NVDA: '엔비디아', TSLA: '테슬라',
  NFLX: '넷플릭스', UBER: '우버', LYFT: '리프트',

  // 반도체
  AMD: 'AMD', INTC: '인텔', QCOM: '퀄컴', AVGO: '브로드컴',
  MU: '마이크론', AMAT: '어플라이드머티리얼즈', LRCX: '램리서치',
  KLAC: 'KLA코퍼레이션', ASML: 'ASML', MRVL: '마벨테크놀로지',
  TXN: '텍사스인스트루먼트', ADI: '아날로그디바이시스', NXPI: 'NXP반도체',
  ON: '온세미컨덕터', SWKS: '스카이웍스', QRVO: 'Qorvo',
  WOLF: '울프스피드', MPWR: '몰렉시스', ENTG: '엔테그리스',
  ACLS: '엑셀리스', FORM: '폼팩터', ICHR: '아이코어홀딩스',
  TSM: 'TSMC', SLAB: '실리콘랩',

  // AI·소프트웨어
  CRM: '세일즈포스', NOW: '서비스나우', SNOW: '스노우플레이크',
  PLTR: '팔란티어', DDOG: '데이터독', ZS: '지스케일러',
  CRWD: '크라우드스트라이크', PANW: '팔로알토네트웍스',
  FTNT: '포티넷', NET: '클라우드플레어', OKTA: '옥타',
  TEAM: '아틀라시안', MDB: '몽고DB', CFLT: '컨플루언트',
  HUBS: '허브스팟', VEEV: '비바시스템즈', WDAY: '워크데이',
  ADBE: '어도비', INTU: '인튜잇', ANSS: '앤시스',
  TWLO: '트윌리오', DOCN: '디지털오션', FSLY: '패스틀리',
  ESTC: '엘라스틱', GTLB: '깃랩', PATH: 'UiPath',

  // 바이오·헬스케어
  JNJ: '존슨앤존슨', PFE: '화이자', MRK: '머크', ABBV: '애브비',
  LLY: '일라이릴리', BMY: '브리스톨마이어스', AMGN: '암젠',
  GILD: '길리어드', BIIB: '바이오젠', REGN: '리제네론',
  VRTX: '버텍스파마슈티컬스', MRNA: '모더나', BNTX: '바이오엔텍',
  ILMN: '일루미나', ISRG: '인튜이티브서지컬', MDT: '메드트로닉',
  ABT: '애보트', TMO: '서모피셔', DHR: '다나허', SYK: '스트라이커',
  DXCM: '덱스컴', PODD: '인슐릿', INSP: '인스피어메디컬',
  NTRA: '나테라', RXRX: '레커시온', EXAS: '이그젝트사이언시스',

  // 금융
  JPM: '제이피모건', BAC: '뱅크오브아메리카', WFC: '웰스파고',
  GS: '골드만삭스', MS: '모건스탠리', C: '시티그룹',
  BLK: '블랙록', V: '비자', MA: '마스터카드', AXP: '아메리칸익스프레스',
  PYPL: '페이팔', SQ: '블록', AFRM: '어펌', HOOD: '로빈후드',
  COIN: '코인베이스', NU: '누홀딩스',

  // 에너지
  XOM: '엑슨모빌', CVX: '셰브론', COP: '코노코필립스',
  SLB: '슐럼버거', HAL: '할리버튼', BKR: '베이커휴즈',
  OXY: '옥시덴탈', DVN: '데본에너지', FANG: '다이아몬드백에너지',
  MPC: '마라톤페트롤리엄', PSX: '필립스66',

  // 전기차·자동차
  RIVN: '리비안', LCID: '루시드모터스',
  GM: 'GM', F: '포드', TM: '토요타', NIO: '니오',
  LI: '리오토', XPEV: '샤오펑',

  // 소비재·유통
  WMT: '월마트', COST: '코스트코', TGT: '타깃',
  HD: '홈디포', LOW: '로우스', NKE: '나이키', LULU: '룰루레몬',
  SBUX: '스타벅스', MCD: '맥도날드', CMG: '치폴레',
  ABNB: '에어비앤비', BKNG: '부킹홀딩스', EXPE: '익스피디아',

  // 통신·미디어
  T: 'AT&T', VZ: '버라이즌', TMUS: 'T모바일',
  DIS: '디즈니', CMCSA: '컴캐스트', PARA: '파라마운트',
  SPOT: '스포티파이', RBLX: '로블록스', TTWO: '테이크투인터렉티브',
  EA: 'EA',

  // 산업재·방산
  BA: '보잉', RTX: '레이시온', LMT: '록히드마틴', NOC: '노스롭그루먼',
  GD: '제너럴다이나믹스', CAT: '캐터필러', DE: '디어앤컴퍼니',
  HON: '허니웰', MMM: '3M', GE: 'GE', ETN: '이튼',
  URI: '유나이티드렌탈스', CARR: '캐리어', TT: '트레인테크놀로지스',

  // 원자재·소재
  FCX: '프리포트맥모란', NEM: '뉴몬트', GOLD: '배릭골드',
  AA: '알코아', CLF: '클리블랜드클리프스', NUE: '뉴코어',
  CF: 'CF인더스트리즈', MOS: '모자이크',

  // 부동산 REIT
  AMT: '아메리칸타워', PLD: '프롤로지스', EQIX: '에퀴닉스',
  SPG: '사이먼프로퍼티', O: '리얼티인컴', VICI: '비씨아이프로퍼티',

  // 유틸리티
  NEE: '넥스트에라에너지', DUK: '듀크에너지', SO: '서던컴퍼니',
  AEP: '아메리칸일렉트릭파워', EXC: '엑셀론', XEL: '엑셀에너지',

  // ETF
  SPY: 'S&P500 ETF', QQQ: '나스닥100 ETF', IWM: '러셀2000 ETF',
  SOXX: '반도체 ETF', SMH: '반도체 ETF', XLK: '기술섹터 ETF',
  XLF: '금융섹터 ETF', XLV: '헬스케어 ETF', XLE: '에너지 ETF',
  XLI: '산업재 ETF', XLY: '경기소비재 ETF', XLP: '필수소비재 ETF',
  XLU: '유틸리티 ETF', XLRE: '부동산 ETF', XLB: '소재 ETF',
  XLC: '커뮤니케이션 ETF', GDX: '금광주 ETF', IBB: '바이오테크 ETF',
  XHB: '홈빌더 ETF', XRT: '소매 ETF', XME: '금속광업 ETF',
  ARKK: 'ARK혁신 ETF', TAN: '태양광 ETF', ICLN: '청정에너지 ETF',
}

// 섹터 ETF → 한글 섹터명
export const SECTOR_NAMES: Record<string, string> = {
  XLK: '기술', XLF: '금융', XLV: '헬스케어', XLE: '에너지',
  XLI: '산업재', XLY: '경기소비재', XLP: '필수소비재',
  XLU: '유틸리티', XLRE: '부동산', XLB: '소재', XLC: '커뮤니케이션',
  SOXX: '반도체', SMH: '반도체', IBB: '바이오테크',
  XHB: '홈빌더', XRT: '소매', XME: '금속·광업',
  GDX: '금광', TAN: '태양광', ICLN: '청정에너지', ARKK: 'ARK혁신',
}
