'use client';

export default function Footer() {
  return (
    <footer className="bg-white text-gray-500 py-12 px-4 mt-20 border-t border-gray-200">
      <div className="max-w-5xl mx-auto">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
          <div>
            <h2 className="text-2xl font-extrabold text-gray-900 tracking-tighter mb-2">
              REANT
            </h2>
            <p className="text-sm text-gray-500">
              공포에 사고 탐욕에 파는, <br className="md:hidden"/>스마트한 개미들을 위한 데이터 분석
            </p>
          </div>
          
          <div className="flex flex-col md:items-end">
             <span className="text-xs font-bold text-gray-400 mb-1">Contact Us</span>
             {/* ✨ 수정: 밑줄 제거 & 색상 톤 통일 (회색) */}
             <a 
               href="mailto:reant.thanks@gmail.com" 
               className="text-sm font-medium text-gray-500 hover:text-gray-900 transition"
             >
                reant.thanks@gmail.com
             </a>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-px w-full bg-gray-100 mb-8"></div>

        {/* 하단 텍스트 */}
        <div className="text-[11px] leading-relaxed text-gray-400">
          <p className="mb-4">
            <span className="font-bold text-gray-600">⚠️ 투자 유의사항</span><br/>
            본 서비스는 미국 주식 시장의 수급 데이터를 시각화하여 제공하는 분석 도구입니다. 
            모든 투자의 책임은 투자자 본인에게 있으며, 제공되는 데이터는 오류가 있을 수 있습니다.
            본 서비스의 정보를 근거로 한 투자 결과에 대해 법적 책임을 지지 않습니다.
          </p>
          <p>
            © 2026 Reant. All rights reserved. <br className="md:hidden"/>
            Data provided by Seibro, Yahoo Finance & Custom Algorithms.
          </p>
        </div>

      </div>
    </footer>
  );
}