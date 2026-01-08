'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 text-center">
      
      {/* 1. 비주얼 (문제 인식) */}
      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6 text-5xl shadow-inner animate-bounce">
        👻
      </div>

      <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900 mb-3">
        상장 폐지된 페이지인가요?
      </h2>

      {/* 2. 감정 케어 (위트 있는 멘트) */}
      <p className="text-gray-500 mb-10 leading-relaxed max-w-md break-keep">
        입력하신 주소는 지구상에 없거나 삭제된 페이지입니다.<br className="hidden md:block"/>
        마치 <strong>고점에 물린 내 주식</strong>처럼 사라져 버렸네요...<br/>
        하지만 걱정 마세요. <strong>구조대</strong>가 왔습니다! 🚁
      </p>

      {/* 3. 행동 유도 (버튼 그룹) */}
      <div className="flex gap-3 w-full max-w-xs">
        {/* 이전으로 버튼 */}
        <button 
          onClick={() => router.back()}
          className="flex-1 py-3 px-4 rounded-xl bg-gray-100 text-gray-700 font-bold hover:bg-gray-200 transition active:scale-95"
        >
          뒤로가기
        </button>

        {/* 홈으로 버튼 */}
        <Link 
          href="/"
          className="flex-1 py-3 px-4 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800 transition shadow-lg active:scale-95 flex items-center justify-center gap-2"
        >
          홈으로 복귀 🏠
        </Link>
      </div>

    </div>
  );
}