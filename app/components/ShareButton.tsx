'use client';

import { useState } from 'react';

export default function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    // 1. 모바일: 공유 시트
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'REANT - 리버스 개미',
          text: '공포에 사고 탐욕에 파는, 스마트한 개미들을 위한 데이터 분석',
          url: window.location.href,
        });
        return;
      } catch (err) {
        console.log('공유 취소됨');
      }
    }

    // 2. PC: 클립보드 복사
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert('주소 복사에 실패했습니다.');
    }
  };

  return (
    <button
      onClick={handleShare}
      className="hover:text-black transition" // ✨ 배경색 삭제, 헤더 스타일 적용
    >
      {copied ? 'Copied!' : 'Share'} 
    </button>
  );
}