'use client';

import { useState, useEffect } from 'react';

// ⚠️ 첫 진입 인트로 모달 임시 OFF — 다시 켜려면 true 로 변경
const INTRO_MODAL_ENABLED = false;

export default function IntroModal() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!INTRO_MODAL_ENABLED) return;

    // 1. 세션 스토리지 확인 (브라우저 껐다 켜기 전까진 '이미 봄' 상태 유지)
    // 개발 중에는 매번 보고 싶으시면 이 if문을 잠시 주석 처리하세요!
    const hasVisited = sessionStorage.getItem('reant_visited');

    if (!hasVisited) {
      setShow(true);
    }
  }, []);

  const handleClose = () => {
    // 2. 닫으면서 "방문했음" 도장 쾅!
    sessionStorage.setItem('reant_visited', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    // 배경: 검은색 반투명 (backdrop-blur로 뒤에 내용을 흐리게)
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fadeIn">
      
      {/* 컨텐츠 박스 */}
      <div className="relative flex flex-col items-center max-w-sm w-full animate-bounceIn">
        
        {/* 👇 여기가 핵심! PNG 이미지 들어가는 곳 */}
        <div className="w-full flex justify-center mb-6">
            {/* 이미지가 너무 크면 화면 꽉 찰 수 있으니 max-width 제한 */}
            <img 
              src="/intro.png" 
              alt="Intro Warning" 
              className="w-auto h-auto max-h-[60vh] object-contain drop-shadow-2xl" 
            />
        </div>

        {/* 닫기(입장) 버튼 */}
        <button 
          onClick={handleClose}
          className="bg-white text-black font-bold py-3 px-10 rounded-full hover:bg-gray-200 transition-transform active:scale-95 shadow-lg text-lg border-2 border-transparent hover:border-white/50"
        >
          확인 (입장하기)
        </button>

      </div>
    </div>
  );
}