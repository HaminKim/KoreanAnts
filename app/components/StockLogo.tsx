'use client';

import { useState, useEffect } from 'react';

type Props = {
  ticker: string;
  name_en?: string;
  name_kr?: string;
  className?: string;
};

export default function StockLogo({ ticker, name_en, name_kr, className }: Props) {
  // 시도해볼 이미지 경로 리스트
  const [candidates, setCandidates] = useState<string[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    // 1. 찾을 파일명 후보군 작성 (우선순위 순)
    const list: string[] = [];

    // (1) 티커명 (예: /logos/TSLA.png)
    if (ticker) {
        list.push(`/logos/${ticker}.png`);
        list.push(`/logos/${ticker.toLowerCase()}.png`);
    }

    // (2) 영어 풀네임 (예: /logos/TESLA INC.png)
    // 파일명에 공백이 있을 수 있으니 그대로 한 번, 공백 제거하고 한 번 시도
    if (name_en) {
        list.push(`/logos/${name_en}.png`);
        // 특수문자나 띄어쓰기 때문에 못 찾을까봐 안전장치 추가
        list.push(`/logos/${name_en.replace(/ /g, '_')}.png`); 
    }

    // (3) 한글 이름 (예: /logos/테슬라.png)
    if (name_kr) {
        list.push(`/logos/${name_kr}.png`);
    }

    // (4) 온라인 API (Financial Modeling Prep)
    if (ticker) {
        list.push(`https://financialmodelingprep.com/image-stock/${ticker}.png`);
    }
    
    // (5) 최후의 보루: 미국 국기
    list.push('/logos/_us.png');

    setCandidates(list);
    setCurrentIdx(0); // 티커나 이름이 바뀌면 인덱스 초기화
  }, [ticker, name_en, name_kr]);

  const handleError = () => {
    // 현재 시도한 이미지가 없으면 다음 후보로 넘어감
    if (currentIdx < candidates.length - 1) {
      setCurrentIdx((prev) => prev + 1);
    }
  };

  // 후보군이 아직 안 만들어졌으면 빈 div 리턴
  if (candidates.length === 0) return <div className={`bg-gray-100 ${className}`} />;

  return (
    <img
      src={candidates[currentIdx]}
      alt={name_kr || ticker}
      className={className}
      onError={handleError}
    />
  );
}