'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import AuthButton from './AuthButton';
// ShareButton import 삭제함

export default function HeaderWithModal() {
  const [showModal, setShowModal] = useState(false);

  // 1. 첫 방문 체크
  useEffect(() => {
    const hasVisited = localStorage.getItem('reant_visited_intro');
    if (!hasVisited) {
      setShowModal(true);
    }
  }, []);

  // 2. 모달 닫기
  const handleClose = () => {
    localStorage.setItem('reant_visited_intro', 'true');
    setShowModal(false);
  };

  return (
    <>
      {/* ================= 헤더 영역 ================= */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b bg-white relative z-40 h-[70px]">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 text-xl font-bold tracking-tight shrink-0"
        >
          <span>REANT</span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-2 sm:gap-4 text-sm text-gray-600">
          
          {/* ✨ [수정 1 & 3] 텍스트 변경 + 높이/크기 '구독하기'와 동일하게 맞춤 */}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center justify-center gap-1 font-bold text-red-600 bg-red-50 hover:bg-red-100 transition animate-pulse rounded-full px-2.5 py-1.5 sm:px-3 sm:py-1.5 text-xs sm:text-sm shrink-0"
          >
            <span>🔥필독🔥</span>
          </button>
          
          <span className="hidden sm:block text-gray-300">|</span>
          
          {/* ShareButton 삭제됨 */}

          {/* 구독하기 버튼 (기준 높이) */}
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

      {/* ================= 이미지 모달 (전체 화면) ================= */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-fade-in">
          <div className="relative w-full max-w-lg bg-transparent flex flex-col items-center">
            
            {/* 닫기 버튼 */}
            <button 
              onClick={handleClose}
              className="absolute -top-10 right-0 text-white/80 hover:text-white transition"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            {/* 이미지 */}
            <div className="w-full overflow-hidden rounded-2xl shadow-2xl bg-white/5">
               <Image 
                 src="/intro.png" 
                 alt="폭락 사례 필독" 
                 width={1080} 
                 height={1350}
                 className="w-full h-auto object-cover"
                 priority
               />
            </div>

            {/* 하단 버튼 */}
            <button 
              onClick={handleClose}
              className="w-full mt-5 py-4 bg-[#FEE500] hover:bg-[#FDDD00] text-[#3C1E1E] font-black text-xl rounded-xl shadow-lg shadow-yellow-500/20 active:scale-95 transition-all animate-bounce"
            >
              확인했습니다 (입장하기) 👉
            </button>
          </div>
        </div>
      )}
    </>
  );
}