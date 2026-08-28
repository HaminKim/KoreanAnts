'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthButton from './AuthButton';

// ✨ 캐시 방지 v=12 (사이즈 최적화)
const INTRO_IMAGES = [
  { id: 'slv', src: '/intro-slv.png?v=12', alt: '은 ETF 폭락' },
  { id: 'ionq', src: '/intro-ionq.png?v=12', alt: '아이온큐 반토막' },
  { id: 'msft', src: '/intro-msft.png?v=12', alt: '마이크로소프트 급락' },
  { id: 'tsla', src: '/intro-tsla.png?v=12', alt: '테슬라 지하실' },
];

// ⚠️ 첫 진입 강제 모달 임시 OFF — 다시 켜려면 true 로 변경
const INTRO_GATE_ENABLED = false;

export default function HeaderWithModal() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(0);
  const totalSteps = INTRO_IMAGES.length + 1;
  const pathname = usePathname();
  const isHeatmap = pathname?.startsWith('/watchlist');
  const isPricing = pathname?.startsWith('/pricing');

  useEffect(() => {
    if (!INTRO_GATE_ENABLED) return;

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
      {/* ================= 헤더 ================= */}
      <header
        className="flex items-center justify-between px-4 sm:px-6 h-[60px]"
        style={{ background: 'var(--surface)', borderBottom: '1px solid var(--ink)' }}
      >
        <Link href="/" className="serif text-lg font-bold tracking-tight shrink-0" style={{ color: 'var(--ink)' }}>
          REANT
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <button
            onClick={handleOpenManually}
            className="text-xs font-medium whitespace-nowrap pb-1 border-b-2 border-transparent transition-colors"
            style={{ color: 'var(--down-text)' }}
          >
            필독
          </button>
          <Link
            href="/watchlist"
            className="hidden sm:inline text-xs font-medium whitespace-nowrap pb-1 border-b-2 transition-colors"
            style={{
              color: isHeatmap ? 'var(--ink)' : 'var(--ink-2)',
              borderColor: isHeatmap ? 'var(--accent)' : 'transparent',
              fontWeight: isHeatmap ? 600 : 500,
            }}
          >
            히트맵
          </Link>
          <Link
            href="/pricing"
            className="text-xs font-medium whitespace-nowrap pb-1 border-b-2 transition-colors"
            style={{
              color: isPricing ? 'var(--ink)' : 'var(--ink-2)',
              borderColor: isPricing ? 'var(--accent)' : 'transparent',
              fontWeight: isPricing ? 600 : 500,
            }}
          >
            구독
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