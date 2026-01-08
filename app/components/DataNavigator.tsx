// components/DateNavigator.tsx
import { useState } from 'react';

export default function DateNavigator() {
  // 현재 날짜 상태 관리
  const [currentDate, setCurrentDate] = useState(new Date());

  // 오늘 날짜인지 확인 (시간 정보 제외하고 날짜만 비교)
  const today = new Date();
  const isToday =
    currentDate.getDate() === today.getDate() &&
    currentDate.getMonth() === today.getMonth() &&
    currentDate.getFullYear() === today.getFullYear();

  // 날짜 포맷팅 (예: 2026. 01. 09 (금))
  const formatDate = (date: Date) => {
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dayName = days[date.getDay()];
    return `${year}. ${month}. ${day} (${dayName})`;
  };

  // 이전 날짜로 이동
  const handlePrev = () => {
    const prev = new Date(currentDate);
    prev.setDate(prev.getDate() - 1);
    setCurrentDate(prev);
    // TODO: 여기서 과거 데이터 불러오는 API 호출!
    console.log(`${formatDate(prev)} 데이터 불러오기...`);
  };

  // 다음 날짜로 이동
  const handleNext = () => {
    if (isToday) return; // 오늘이면 미래로 못 감
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    setCurrentDate(next);
    // TODO: 여기서 데이터 불러오는 API 호출!
    console.log(`${formatDate(next)} 데이터 불러오기...`);
  };

  return (
    <div className="flex flex-col items-center justify-center my-6 gap-1">
      <div className="flex items-center gap-4">
        {/* 이전 버튼 */}
        <button
          onClick={handlePrev}
          className="p-2 text-gray-500 transition-colors rounded-full hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white active:scale-95"
          aria-label="이전 날짜"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* 날짜 표시 */}
        <h3 className="text-xl font-bold tracking-tight text-gray-900 font-mono dark:text-white min-w-[180px] text-center">
          {formatDate(currentDate)}
        </h3>

        {/* 다음 버튼 */}
        <button
          onClick={handleNext}
          disabled={isToday}
          className={`p-2 rounded-full transition-colors active:scale-95 ${
            isToday
              ? 'text-gray-300 cursor-not-allowed dark:text-gray-700 opacity-50'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
          }`}
          aria-label="다음 날짜"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* 과거 기록 뱃지 (오늘이 아닐 때만 보임) */}
      {!isToday && (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 animate-pulse">
          🕒 과거 예측 기록
        </span>
      )}
    </div>
  );
}