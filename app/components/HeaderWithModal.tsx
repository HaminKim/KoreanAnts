'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import AuthButton from './AuthButton';

// ✨ 캐시 방지 v=12 (사이즈 최적화)
const INTRO_IMAGES = [
  { id: 'slv', src: '/intro-slv.png?v=12', alt: '은 ETF 폭락' },
  { id: 'ionq', src: '/intro-ionq.png?v=12', alt: '아이온큐 반토막' },
  { id: 'msft', src: '/intro-msft.png?v=12', alt: '마이크로소프트 급락' },
  { id: 'tsla', src: '/intro-tsla.png?v=12', alt: '테슬라 지하실' },
];

export default function HeaderWithModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(0); 
  const totalSteps = INTRO_IMAGES.length + 1;

  useEffect(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const lastSeenDate = localStorage.getItem('reant_intro_date');

    if (lastSeenDate !== todayStr) {
      setIsModalOpen(true);
      setStep(0);
    }
  }, []);

  const handleClose = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    localStorage.setItem('reant_intro_date', todayStr);
    setIsModalOpen(false);
  };

  const handleNext = () => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    } else {
      handleClose();
    }
  };

  const handleOpenManually = () => {
    setStep(0);
    setIsModalOpen(true);
  };

  return (
    <>
      {/* ================= 헤더 (기존 동일) ================= */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b bg-white relative z-40 h-[70px]">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight shrink-0">
          <span>REANT</span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-4 text-sm text-gray-600">
          <button
            onClick={handleOpenManually}
            className="flex items-center justify-center gap-1 font-bold text-red-600 bg-red-50 hover:bg-red-100 transition animate-pulse rounded-full px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm shrink-0"
          >
            <span>🔥필독🔥</span>
          </button>
          <span className="hidden sm:block text-gray-300">|</span>
          <Link
            href="/watchlist"
            className="hidden sm:flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-50"
          >
            📊 히트맵
          </Link>
          <Link
            href="/short-tracker"
            className="hidden sm:flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors px-2 py-1.5 rounded-lg hover:bg-gray-50"
          >
            📉 숏트래커
          </Link>
          <span className="hidden sm:block text-gray-300">|</span>
          <Link
            href="/pricing"
            className="px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-sm hover:shadow-md hover:from-amber-600 hover:to-orange-700 transition-all transform hover:-translate-y-0.5 text-xs sm:text-sm flex items-center gap-1 shrink-0"
          >
            <span>구독</span>
            <span className="hidden sm:inline">하기</span>
            <span>👑</span>
          </Link>
          <AuthButton />
        </nav>
      </header>

      {/* ================= 🛑 강제 5단 슬라이드 모달 ================= */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-black/90 backdrop-blur-md animate-fade-in">
          <div className="flex min-h-screen items-center justify-center p-4 py-12">
            
            {/* 👇 [수정됨] max-w-md 로 변경! (PC에서 너무 커지지 않게) */}
            <div className="w-full max-w-md flex flex-col items-center relative transition-all">
              
              {/* 이미지 비율 (4:5) */}
              <div className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden shadow-2xl mb-4 bg-gray-900 border border-gray-800">
                
                  {step < 4 ? (
                    // [Step 1~4] 이미지
                    <img
                      src={INTRO_IMAGES[step].src}
                      alt={INTRO_IMAGES[step].alt}
                      className="w-full h-full object-contain" 
                    />
                  ) : (
                    // [Step 5] 마지막 경고
                    <div className="w-full h-full flex flex-col items-center justify-center text-center p-6 bg-gradient-to-br from-gray-900 to-black text-white">
                      <div className="text-5xl sm:text-6xl mb-4 animate-pulse">✋</div>
                      <h2 className="text-2xl sm:text-3xl font-black leading-tight mb-4 text-white">
                        설마,<br />
                        확인 안 하고<br />
                        <span className="text-yellow-400">그냥 사시게요?</span>
                      </h2>
                      <p className="text-gray-400 text-xs sm:text-sm leading-relaxed mb-6">
                        내 돈 지키려면 <strong>'3초'</strong>면 됩니다.<br />
                        개미들이 몰려간 위험한 종목인지,<br />
                        <strong>지금 바로 확인하세요.</strong>
                      </p>
                      <div className="animate-bounce text-2xl text-red-500">⬇️</div>
                    </div>
                  )}

                  {/* 페이지 번호 */}
                  <div className="absolute top-3 right-3 bg-black/60 px-2.5 py-1 rounded-full text-xs font-bold text-white backdrop-blur-md border border-white/10 z-10">
                    {step + 1} / {totalSteps}
                  </div>
              </div>

              {/* 하단 버튼 */}
              <button
                onClick={handleNext}
                className={`
                  w-full py-4 rounded-xl font-black text-lg shadow-xl transition-all active:scale-95 shrink-0
                  ${step === 4 
                    ? 'bg-red-600 text-white hover:bg-red-500 ring-4 ring-red-500/30 animate-pulse' 
                    : 'bg-white text-gray-900 hover:bg-gray-50'}
                `}
              >
                {step === 4 ? '확인했습니다 (입장하기) 👉' : '다음 폭락 사례 보기 😱'}
              </button>

            </div>
          </div>
        </div>
      )}
    </>
  );
}