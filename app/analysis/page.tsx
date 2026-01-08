'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { funnyPhrases } from '../data/funny_loading'; // 경로 확인 필요

export default function AnalysisPage() {
  const [ticker, setTicker] = useState('');
  const [step, setStep] = useState<'input' | 'loading' | 'result' | 'error'>('input');
  const [loadingText, setLoadingText] = useState(funnyPhrases[0]);
  const [resultData, setResultData] = useState<any>(null); // 나중에 실제 데이터 타입으로 변경

  // 로딩 멘트 롤링 효과
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (step === 'loading') {
      interval = setInterval(() => {W
        const randomIdx = Math.floor(Math.random() * funnyPhrases.length);
        setLoadingText(funnyPhrases[randomIdx]);
      }, 700); // 0.7초마다 멘트 변경
    }
    return () => clearInterval(interval);
  }, [step]);

  const handleSearch = () => {
    if (!ticker.trim()) return;
    
    setStep('loading');

    // 🕵️‍♂️ 3초간 분석하는 척 (나중엔 여기서 실제 API 호출)
    setTimeout(() => {
      const target = ticker.toUpperCase().trim();
      
      // [임시 로직] 우리가 아는 티커면 성공, 모르면 잡주 취급
      // 실제로는 가지고 있는 JSON 파일 목록이나 API 응답으로 체크해야 함
      const knownTickers = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'SOXL', 'TQQQ', 'AMD', 'INTC', 'MU']; 
      
      if (knownTickers.includes(target)) {
        setResultData({
          ticker: target,
          price: "Loading...", // 실제 데이터 연동 필요
          score: Math.floor(Math.random() * 100), // 임시 점수
          comment: "세력이 매집 중인 흔적이 보입니다." // 임시 코멘트
        });
        setStep('result');
      } else {
        setStep('error');
      }
    }, 3000); // 3초 대기
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <main className="min-h-screen bg-white flex flex-col relative overflow-hidden">
      
      {/* 뒤로가기 헤더 */}
      <div className="p-4">
        <Link href="/" className="inline-flex items-center text-gray-500 hover:text-black transition">
          <svg className="w-6 h-6 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          메인으로
        </Link>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
        
        {/* 1단계: 입력 화면 */}
        {step === 'input' && (
          <div className="w-full max-w-md animate-fade-in-up">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2 text-center">
              어떤 주식을 <br/> <span className="text-blue-600">분석</span>해 드릴까요?
            </h1>
            <p className="text-center text-gray-400 mb-8 text-sm">
              AI가 수급과 심리를 분석해 드립니다.
            </p>

            {/* 검색창 */}
            <div className="relative mb-8">
              <input 
                type="text" 
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="티커를 입력하세요 (예: TSLA)"
                className="w-full text-2xl font-bold border-b-2 border-gray-200 py-4 px-2 focus:outline-none focus:border-black placeholder-gray-300 text-center uppercase transition-colors"
                autoFocus
              />
              <button 
                onClick={handleSearch}
                className="absolute right-2 bottom-4 text-blue-600 hover:scale-110 transition-transform"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              </button>
            </div>

            {/* 로고 예시 (친절한 가이드) */}
            <div className="grid grid-cols-3 gap-3">
               {[
                 { t: 'NVDA', n: '엔비디아' },
                 { t: 'TSLA', n: '테슬라' },
                 { t: 'AAPL', n: '애플' }
               ].map((item) => (
                 <button 
                   key={item.t}
                   onClick={() => setTicker(item.t)}
                   className="flex flex-col items-center justify-center p-3 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-100 transition"
                 >
                   <div className="w-10 h-10 rounded-full bg-white border border-gray-200 p-1 mb-2 shadow-sm">
                     <img 
                       src={`/logos/${item.t}.png`} 
                       alt={item.n}
                       className="w-full h-full object-contain rounded-full"
                       onError={(e) => { e.currentTarget.src = '/logos/_us.png'; }}
                     />
                   </div>
                   <span className="text-xs font-bold text-gray-600">{item.n}</span>
                   <span className="text-[10px] text-gray-400 font-mono">{item.t}</span>
                 </button>
               ))}
            </div>
          </div>
        )}

        {/* 2단계: 로딩 화면 (재미 요소) */}
        {step === 'loading' && (
          <div className="text-center animate-pulse flex flex-col items-center">
            <div className="w-20 h-20 mb-6 bg-blue-50 rounded-full flex items-center justify-center">
                <span className="text-4xl animate-spin">🤔</span>
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2 transition-all duration-300 min-h-[60px] break-keep px-4">
              "{loadingText}"
            </h2>
            <p className="text-sm text-gray-400 font-mono uppercase mt-4">
              Analyzing {ticker}...
            </p>
          </div>
        )}

        {/* 3단계: 결과 화면 (성공) */}
        {step === 'result' && (
          <div className="w-full max-w-lg animate-scale-in">
             <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden">
                
                {/* 헤더 */}
                <div className="bg-slate-900 text-white p-6 text-center relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="w-16 h-16 mx-auto bg-white rounded-full p-1 mb-3 shadow-lg">
                            <img src={`/logos/${ticker}.png`} className="w-full h-full object-cover rounded-full" onError={(e) => e.currentTarget.src='/logos/_us.png'}/>
                        </div>
                        <h2 className="text-2xl font-bold">{ticker}</h2>
                        <p className="text-blue-300 text-sm font-bold mt-1">분석 완료!</p>
                    </div>
                </div>

                {/* 차트 영역 (임시 이미지/컴포넌트) */}
                <div className="p-6">
                    <div className="bg-gray-100 rounded-xl h-48 flex items-center justify-center mb-6">
                        <span className="text-gray-400 text-sm">📈 여기에 주가+수급 차트 컴포넌트 들어감</span>
                    </div>
                    
                    {/* 해석 */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
                        <h3 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                            <span>🤖 AI 해석</span>
                        </h3>
                        <p className="text-gray-700 text-sm leading-relaxed">
                           현재 <strong>{ticker}</strong>의 수급은 {resultData.score > 50 ? '매수 우위' : '매도 우위'}입니다. 
                           개미들은 {resultData.score > 50 ? '공포에 질려 던지고 있지만' : '환호하며 매수하고 있지만'}, 
                           스마트 머니는 반대로 움직이고 있습니다. {resultData.comment}
                        </p>
                    </div>
                </div>

                {/* 하단 버튼 */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex gap-2">
                    <button onClick={() => setStep('input')} className="flex-1 py-3 bg-white border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50">
                        다른 종목 검색
                    </button>
                    <Link href="/" className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-center hover:bg-slate-800">
                        메인으로
                    </Link>
                </div>
             </div>
          </div>
        )}

        {/* 4단계: 에러 화면 (잡주 경고) */}
        {step === 'error' && (
          <div className="text-center max-w-sm animate-shake">
            <div className="text-6xl mb-4">🙅‍♂️</div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">데이터가 없습니다!</h2>
            <p className="text-gray-600 mb-6 break-keep">
              혹시 <strong>동전주</strong>나 <strong>잡주</strong>인가요?<br/>
              저희 AI는 근본 있는 주식만 분석합니다.<br/>
              (아니면 티커를 잘못 입력하셨을 수도...?)
            </p>
            <button 
              onClick={() => { setTicker(''); setStep('input'); }}
              className="px-6 py-3 bg-gray-900 text-white rounded-full font-bold hover:bg-gray-800 transition shadow-lg"
            >
              다시 검색하기
            </button>
          </div>
        )}

      </div>
    </main>
  );
}