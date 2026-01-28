'use client';

import Link from 'next/link';

export default function PricingPage() {
  return (
    <div className="pb-24 bg-white">
      
{/* =====================================================================================
          섹션 1. [도입부] 팩트 폭격 & 공감
      ===================================================================================== */}
      <section className="relative py-16 md:py-24 px-4 text-center overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-amber-50 via-white to-white -z-10"></div>
        
        <div className="max-w-4xl mx-auto space-y-6 md:space-y-8 relative z-10">
          <span className="inline-flex items-center gap-1.5 py-1.5 px-4 rounded-full bg-red-50 text-red-600 text-xs font-bold border border-red-100 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            긴급 투자 점검
          </span>
          
          {/* 메인 카피 */}
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-extrabold text-slate-900 leading-tight tracking-tight break-keep">
            "뉴스 보고 매수하면,<br />
            <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600">
              이미 늦습니다.
              {/* 밑줄 장식 */}
              <svg className="absolute w-full h-2 -bottom-1 left-0 text-orange-200 -z-10" viewBox="0 0 100 10" preserveAspectRatio="none"><path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" /></svg>
            </span>"
          </h1>
          
          {/* 서브 카피: 줄바꿈 & 키워드 강조 */}
          <p className="text-base sm:text-lg text-slate-500 leading-relaxed max-w-xl mx-auto break-keep font-medium mt-4">
            모두가 아는 <span className="font-bold text-slate-700">호재</span>는 더 이상 정보가 아닙니다.<br />
            남들보다 먼저 <span className="text-slate-900 font-bold bg-amber-100 px-1">시장 수급</span>을 확인하세요.
          </p>
        </div>
      </section>

{/* =====================================================================================
          섹션 2. [문제 제기] 호재에 물리는 이유 (VS 구조로 직관적 변경)
      ===================================================================================== */}
      <section className="py-16 md:py-24 px-4 bg-slate-50 border-y border-slate-100">
        <div className="max-w-5xl mx-auto">
          
          {/* 1. 헤드라인: 의문 던지기 */}
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-6 leading-tight break-keep">
              "실적 대박, 호재 뉴스 떴는데<br />
              <span className="text-blue-600">왜 내 주식만 떨어질까?</span>"
            </h2>
            <div className="bg-white inline-block px-6 py-3 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-sm md:text-base text-slate-600 font-bold">
                이유는 간단합니다. <span className="text-red-500 border-b-2 border-red-200">이미 반영되었기 때문</span>입니다.
              </p>
            </div>
          </div>
          
          {/* 2. VS 구조: 개미의 시선 vs 시장의 진실 */}
          <div className="relative grid md:grid-cols-2 gap-4 md:gap-8 items-stretch">
            
            {/* VS 배지 (데스크탑 중앙) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:flex w-12 h-12 bg-slate-900 rounded-full items-center justify-center text-white font-black border-4 border-slate-50 shadow-lg">
              VS
            </div>

            {/* 왼쪽: 개미가 사는 이유 (Late) */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-200 flex flex-col items-center text-center opacity-80 hover:opacity-100 transition-opacity">
               {/* 이모지 변경: 듣고 샀다는 의미로 귀👂 */}
               <div className="text-4xl md:text-5xl mb-4 grayscale">👂</div>
               <h3 className="text-lg md:text-xl font-bold text-slate-500 mb-2">당신이 매수한 이유</h3>
               <div className="flex flex-wrap justify-center gap-2 mb-6">
                  <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded">뉴스 호재</span>
                  <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded">FOMO</span>
                  <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded">옆집 영기엄마 추천</span>
                  <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded">주식 열풍</span>
                  <span className="bg-slate-100 text-slate-500 text-xs px-2 py-1 rounded">급등하는 차트</span>
               </div>
               <div className="mt-auto w-full bg-slate-100 rounded-xl p-4">
                  <p className="text-xs text-slate-400 font-bold mb-1">결과</p>
                  <p className="text-slate-600 font-bold text-lg">"설거지 당함 (고점 매수)"</p>
               </div>
            </div>

            {/* 오른쪽: 시장의 진실 (Real) */}
            <div className="bg-gradient-to-b from-blue-600 to-blue-800 p-6 md:p-8 rounded-3xl border border-blue-500 shadow-xl flex flex-col items-center text-center text-white transform md:scale-105 z-0">
               <div className="text-4xl md:text-5xl mb-4 drop-shadow-md">🧠</div>
               <h3 className="text-lg md:text-xl font-bold text-white mb-2">주가를 움직이는 진짜</h3>
               <div className="flex flex-wrap justify-center gap-2 mb-6">
                  <span className="bg-blue-500/50 text-blue-50 text-xs px-2 py-1 rounded border border-blue-400">투자 심리</span>
                  <span className="bg-blue-500/50 text-blue-50 text-xs px-2 py-1 rounded border border-blue-400">수급(돈의 흐름)</span>
                  <span className="bg-blue-500/50 text-blue-50 text-xs px-2 py-1 rounded border border-blue-400">광기 & 공포</span>
                  <span className="bg-blue-500/50 text-blue-50 text-xs px-2 py-1 rounded border border-blue-400">기업 분석</span>
               </div>
               <div className="mt-auto w-full bg-blue-500/30 rounded-xl p-4 border border-blue-400/30 backdrop-blur-sm">
                  <p className="text-xs text-blue-200 font-bold mb-1">결과</p>
                  <p className="text-white font-bold text-lg">"선취매 & 저점 매수"</p>
               </div>
            </div>

          </div>

          {/* 3. 마무리 멘트 */}
          <p className="text-center text-slate-500 text-sm mt-12 md:mt-16">
            뉴스는 과거를 말하고, <b>데이터는 현재를 말합니다.</b><br />
            이제 후행성 정보 말고, <span className="text-slate-900 font-bold underline decoration-amber-400 decoration-2">살아있는 데이터</span>를 보세요.
          </p>

        </div>
      </section>

{/* =====================================================================================
          섹션 3. [해결책] 리버스 앤트의 솔루션 (설명 줄이고 팩트만 전달)
      ===================================================================================== */}
      <section className="py-16 md:py-24 px-4 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12 md:mb-16">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-gray-900 mb-4 md:mb-6 break-keep">
              종목 추천이 아닙니다.<br />
              <span className="relative inline-block">
                <span className="relative z-10">데이터 '팩트 체크'입니다.</span>
                <span className="absolute bottom-1 left-0 w-full h-3 bg-amber-100 -z-0"></span>
              </span>
            </h2>
            <p className="text-sm md:text-base text-gray-500 max-w-2xl mx-auto md:text-lg break-keep leading-relaxed">
              감으로 투자하는 습관을 멈추세요.<br />
              개인 투자자들의 쏠림 현상을 분석해 <b>객관적인 위치</b>만 보여드립니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 md:gap-8">
            {/* 카드 1: 과열 감지 (텍스트 다이어트) */}
            <div className="group p-5 md:p-8 rounded-[2rem] border border-orange-100 bg-gradient-to-br from-white to-orange-50 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex justify-between items-start mb-4 md:mb-6">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full bg-orange-100 text-base md:text-lg">🔥</span>
                    <span className="font-bold text-orange-800 text-xs md:text-sm bg-orange-100 px-2 md:px-3 py-1 rounded-full">과열 시그널</span>
                </div>
                <span className="text-[10px] md:text-xs font-bold text-orange-400 mt-1">AI 분석 중</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 break-keep">"지금, 너무 뜨겁습니다"</h3>
              <p className="text-gray-600 text-xs md:text-sm leading-relaxed mb-4 md:mb-6 break-keep">
                개인 매수세가 비정상적으로 폭발했습니다.<br />
                모두가 환호할 때, 데이터는 <b>조정 가능성</b>을 경고하고 있습니다.
              </p>
              <div className="bg-white rounded-xl p-3 md:p-4 border border-orange-100 flex items-center gap-3 md:gap-4">
                 <div className="flex-1">
                    <div className="text-[10px] md:text-xs text-gray-400 mb-1">현재 시장 분위기</div>
                    <div className="h-2.5 md:h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-orange-400 to-red-600 w-[95%]"></div>
                    </div>
                 </div>
                 <div className="text-red-600 font-extrabold text-base md:text-lg whitespace-nowrap">광기의 풀매수</div>
              </div>
            </div>

            {/* 카드 2: 과매도 감지 (텍스트 다이어트) */}
            <div className="group p-5 md:p-8 rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white to-blue-50 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              <div className="flex justify-between items-start mb-4 md:mb-6">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-full bg-blue-100 text-base md:text-lg">🧊</span>
                    <span className="font-bold text-blue-800 text-xs md:text-sm bg-blue-100 px-2 md:px-3 py-1 rounded-full">과매도 시그널</span>
                </div>
                <span className="text-[10px] md:text-xs font-bold text-blue-400 mt-1">AI 분석 중</span>
              </div>
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-2 break-keep">"공포가 극에 달했습니다"</h3>
              <p className="text-gray-600 text-xs md:text-sm leading-relaxed mb-4 md:mb-6 break-keep">
                집단적인 패닉 셀링(투매)이 포착되었습니다.<br />
                남들이 던질 때가 <b>가장 싸게 살 기회</b>일지도 모릅니다.
              </p>
              <div className="bg-white rounded-xl p-3 md:p-4 border border-blue-100 flex items-center gap-3 md:gap-4">
                 <div className="flex-1">
                    <div className="text-[10px] md:text-xs text-gray-400 mb-1">현재 시장 분위기</div>
                    <div className="h-2.5 md:h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-600 w-[90%]"></div>
                    </div>
                 </div>
                 <div className="text-blue-600 font-extrabold text-base md:text-lg whitespace-nowrap">집단 패닉셀</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =====================================================================================
          섹션 4. [가격 설득] 앵커링 효과
      ===================================================================================== */}
      <section className="py-16 md:py-24 px-4 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-8 md:mb-12 leading-tight break-keep">
            한 번의 뇌동매매로 잃은 돈,<br />
            기억하시나요?
          </h2>
          
          <div className="flex flex-col md:flex-row justify-center items-center gap-6 sm:gap-12">
            {/* 왼쪽: 손실 */}
            <div className="w-full max-w-sm bg-slate-800/50 backdrop-blur-sm p-6 md:p-8 rounded-3xl border border-slate-700">
              <div className="text-4xl mb-4 grayscale opacity-50">💸</div>
              <h3 className="text-base md:text-lg font-medium text-slate-400">한 번의 뇌동매매 손실</h3>
              <p className="text-3xl md:text-4xl font-bold text-blue-400/90 mt-4 line-through decoration-slate-500 decoration-2">-1,103,512원</p>
              <p className="text-xs md:text-sm text-slate-500 mt-4">"수업료 냈다 치자..." (반복됨)</p>
            </div>

            <div className="text-xl font-bold text-slate-600">VS</div>

            {/* 오른쪽: 이득 */}
            <div className="w-full max-w-sm bg-gradient-to-b from-slate-800 to-slate-900 p-6 md:p-8 rounded-3xl border-2 border-amber-500 relative shadow-[0_0_40px_rgba(245,158,11,0.2)] transform hover:scale-105 transition-transform duration-300">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-slate-900 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
                Smart Choice
              </div>
              <div className="text-4xl mb-4">🛡️</div>
              <h3 className="text-base md:text-lg font-bold text-white">리앤트 1개월 구독</h3>
              <p className="text-3xl md:text-4xl font-bold text-amber-400 mt-4">33,000원</p>
              <p className="text-xs md:text-sm text-slate-300 mt-4 leading-relaxed break-keep">
                리앤트로 스스로 분석하고,<br/>
                한 달에 딱 한 번, 상투에 물리지만 맙시다!
              </p>
            </div>
          </div>

          <p className="mt-8 md:mt-12 text-slate-400 text-xs md:text-sm max-w-lg mx-auto leading-relaxed break-keep">
            투자의 1원칙은 '잃지 않는 것'입니다.<br />
            내 소중한 자산을 지키는 최소한의 안전장치를 마련하세요.
          </p>
        </div>
      </section>

{/* =====================================================================================
          섹션 5. [CTA] 가격 정책 (구글 폼 연결 버전)
      ===================================================================================== */}
      <section className="py-16 md:py-24 px-4 bg-white" id="plans">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 md:mb-16">
            <span className="text-amber-500 font-bold tracking-wider text-xs uppercase mb-2 block">Membership Plans</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-gray-900">
              스마트한 투자자의 선택
            </h2>
            <p className="text-sm md:text-base text-gray-500 mt-2">가장 합리적인 플랜으로 시작하세요.</p>
          </div>

          {/* ✨ 2x2 그리드 배열 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 items-stretch">
            
            {/* Plan 0: Free */}
            <div className="p-4 md:p-6 rounded-2xl border border-gray-100 bg-gray-50 text-gray-500 flex flex-col">
              <h3 className="font-bold text-gray-600 text-sm md:text-lg">무료 회원</h3>
              <div className="text-xl md:text-3xl font-bold text-gray-900 mt-2 md:mt-4">0원</div>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1 font-normal">(평생 무료)</p>
              
              <ul className="text-[11px] md:text-sm space-y-2 md:space-y-4 mt-4 md:mt-8 mb-4 md:mb-8 flex-1 leading-tight">
                <li className="flex items-center gap-1.5"><CheckIcon /> <b>AI 패턴 분석</b></li>
                <li className="flex items-center gap-1.5"><CheckIcon /> 실시간 랭킹(일부)</li>
                <li className="flex items-center gap-1.5"><CheckIcon /> 내 종목 분석</li>
                <li className="flex items-start gap-1.5 opacity-60">
                    <span className="text-amber-500 shrink-0 mt-0.5 text-[10px]">🔒</span> 
                    <span>Top 30 잠금</span>
                </li>
              </ul>
              
              <button className="w-full py-2 md:py-3 rounded-xl border border-gray-300 text-gray-400 text-xs md:text-sm font-bold cursor-not-allowed bg-white">
                이용 중
              </button>
            </div>

            {/* Plan 1: 1개월 (블루) */}
            <div className="p-4 md:p-6 rounded-2xl border-2 border-blue-100 bg-white hover:border-blue-400 hover:shadow-lg transition-all flex flex-col">
              <h3 className="font-bold text-blue-600 text-sm md:text-lg">1개월권</h3>
              <div className="mt-2 md:mt-4">
                <span className="text-xl md:text-3xl font-bold text-gray-900">33,000원</span>
              </div>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1 font-normal">(월 33,000원)</p>
              
              <ul className="text-[11px] md:text-sm space-y-2 md:space-y-4 mt-4 md:mt-8 mb-4 md:mb-8 text-gray-600 flex-1 leading-tight">
                <li className="flex items-center gap-1.5"><CheckIcon color="text-blue-500" /> 무료 기능 포함</li>
                <li className="flex items-start gap-1.5 bg-blue-50 p-1.5 rounded-md -mx-1.5">
                    <span className="text-blue-500 shrink-0 text-[10px] mt-0.5">🔓</span> 
                    <b>랭킹 전체 해제</b>
                </li>
              </ul>
              
              {/* 👇 구글폼 링크 넣는 곳 */}
              <a href="https://forms.gle/2NWcC2uLo91dYDBY6" target="_blank" rel="noopener noreferrer" className="w-full">
                <button className="w-full py-2 md:py-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 text-xs md:text-sm font-bold hover:bg-blue-100 transition">
                  시작하기
                </button>
              </a>
            </div>

            {/* Plan 2: 2개월 (그린) */}
            <div className="p-4 md:p-6 rounded-2xl border-2 border-green-100 bg-white hover:border-green-400 hover:shadow-lg transition-all flex flex-col relative overflow-hidden">
               <div className="absolute top-0 right-0 bg-green-100 text-green-700 text-[9px] md:text-[10px] font-bold px-2 py-1 rounded-bl-xl">
                  SAVE 21%
               </div>
              <h3 className="font-bold text-green-600 text-sm md:text-lg">2개월권</h3>
              <div className="mt-2 md:mt-4">
                <span className="text-xl md:text-3xl font-bold text-gray-900">52,000원</span>
              </div>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1 font-normal">(월 26,000원)</p>
              
              <ul className="text-[11px] md:text-sm space-y-2 md:space-y-4 mt-4 md:mt-8 mb-4 md:mb-8 text-gray-600 flex-1 leading-tight">
                <li className="flex items-center gap-1.5"><CheckIcon color="text-green-500" /> 무료 기능 포함</li>
                <li className="flex items-start gap-1.5 bg-green-50 p-1.5 rounded-md -mx-1.5">
                    <span className="text-green-600 shrink-0 text-[10px] mt-0.5">🔓</span> 
                    <b>랭킹 전체 해제</b>
                </li>
              </ul>
              
              {/* 👇 구글폼 링크 넣는 곳 */}
              <a href="https://forms.gle/2NWcC2uLo91dYDBY6" target="_blank" rel="noopener noreferrer" className="w-full">
                <button className="w-full py-2 md:py-3 rounded-xl bg-green-50 text-green-600 border border-green-100 text-xs md:text-sm font-bold hover:bg-green-100 transition">
                  시작하기
                </button>
              </a>
            </div>

            {/* Plan 3: 3개월 (오렌지) */}
            <div className="p-4 md:p-6 rounded-2xl border-2 border-amber-400 bg-white hover:shadow-xl transition-all flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-red-100 text-red-600 text-[9px] md:text-[10px] font-bold px-2 py-1 rounded-bl-xl">
                  30% SALE
               </div>
              <h3 className="font-bold text-amber-500 text-sm md:text-lg">3개월권</h3>
              <div className="mt-2 md:mt-4">
                <span className="text-xl md:text-3xl font-bold text-gray-900">69,000원</span>
              </div>
              <p className="text-[10px] md:text-xs text-gray-400 mt-1 font-normal">(월 23,000원)</p>
              
              <ul className="text-[11px] md:text-sm space-y-2 md:space-y-4 mt-4 md:mt-8 mb-4 md:mb-8 text-gray-700 font-medium flex-1 leading-tight">
                <li className="flex items-center gap-1.5"><CheckIcon color="text-amber-500" /> 무료 기능 포함</li>
                <li className="flex items-start gap-1.5 bg-amber-50 p-1.5 rounded-md -mx-1.5">
                    <span className="text-amber-500 shrink-0 text-[10px] mt-0.5">🔓</span> 
                    <b>랭킹 전체 해제</b>
                </li>
                <li className="flex items-center gap-1.5"><CheckIcon color="text-amber-500" /> 가장 저렴한 요금</li>
              </ul>
              
              {/* 👇 구글폼 링크 넣는 곳 */}
              <a href="https://forms.gle/2NWcC2uLo91dYDBY6" target="_blank" rel="noopener noreferrer" className="w-full">
                <button className="w-full py-2 md:py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white text-xs md:text-sm font-bold shadow-md hover:shadow-lg hover:from-amber-600 hover:to-orange-700 transition-all">
                  시작하기
                </button>
              </a>
            </div>

          </div>

          <div className="mt-12 md:mt-16 pt-8 border-t border-gray-100 text-center space-y-1 md:space-y-2">
            <p className="text-[10px] md:text-xs text-gray-400">
               * 본 서비스는 투자를 권유하거나 종목을 추천하지 않습니다. 모든 투자 판단의 책임은 사용자 본인에게 있습니다.
            </p>
            <p className="text-[10px] md:text-xs text-gray-400">
               * 결제 후 7일 이내 사용 이력이 없는 경우 전액 환불 가능합니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ✅ 체크 아이콘 컴포넌트
function CheckIcon({ color = "text-gray-400" }: { color?: string }) {
  return (
    <svg className={`w-3 h-3 md:w-5 md:h-5 ${color} flex-shrink-0`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}