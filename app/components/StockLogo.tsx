'use client';

import { useState, useEffect } from 'react';

type Props = {
  ticker: string;     // 예: TSLA
  name_en?: string;   // 예: TESLA INC (파일명 1순위)
  name_kr?: string;   // 예: 테슬라
  className?: string;
};

export default function StockLogo({ ticker, name_en, name_kr, className }: Props) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    const list: string[] = [];

    // 1순위: 영어 풀네임 (KEYNAME) - 예: /logos/TESLA%20INC.png
    if (name_en) {
      list.push(`/logos/${encodeURIComponent(name_en)}.png`);
    }

    // 2순위: 티커 - 예: /logos/TSLA.png
    if (ticker) {
      list.push(`/logos/${ticker.toUpperCase()}.png`);
    }

    // 3순위: 한글 이름 - 예: /logos/테슬라.png
    if (name_kr) {
      list.push(`/logos/${encodeURIComponent(name_kr)}.png`);
    }
    
    // 4순위: 최후의 보루 (미국 국기)
    list.push('/logos/_us.png');

    setCandidates(list);
    setCurrentIdx(0); // 새 종목이 들어오면 인덱스 초기화
  }, [ticker, name_en, name_kr]);

  const handleError = () => {
    // 다음 후보가 있으면 넘어감
    if (currentIdx < candidates.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    }
  };

  // 아직 후보군 생성 전이면 빈 박스
  if (candidates.length === 0) return <div className={`bg-gray-100 ${className}`} />;

  return (
    <img
      src={candidates[currentIdx]}
      alt={name_kr || ticker}
      className={className}
      onError={handleError}
      loading="lazy" // 성능 최적화
    />
  );
}