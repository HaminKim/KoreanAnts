'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-white text-gray-500 py-12 px-4 mt-20 border-t border-gray-200">
      <div className="max-w-5xl mx-auto">
        
        {/* 상단: 로고 및 연락처 */}
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

        {/* 중단: 이용약관 및 개인정보처리방침 (PG사 심사 필수 항목) */}
        <div className="flex gap-6 mb-6 text-xs font-medium">
            {/* 아직 페이지 없으면 href="#" 로 두세요. 버튼 존재 여부가 중요합니다. */}
            <Link href="#" className="hover:text-gray-900">이용약관</Link>
            <Link href="#" className="font-bold hover:text-gray-900">개인정보처리방침</Link>
        </div>

        {/* 하단: 사업자 정보 (법적 필수 기재 사항) */}
        {/* 디자인 꼼수: 아주 작고 연하게 해서 눈에 잘 안 띄게 처리 */}
        <div className="text-[10px] leading-relaxed text-gray-400 font-light mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 gap-x-4">
                <p>상호명 : 리앤트 <span className="mx-1">|</span> 대표 : 김하민</p>
                {/* 사업자번호 나오면 숫자 채워넣으세요. 지금은 '발급 진행 중' 표기 OK */}
                <p>사업자등록번호 : 707-72-00694</p> 
                <p>주소 : 경기도 파주시 가재울로 99-10</p>
                <p>통신판매업신고 : 간이과세자 면제 대상</p>
                <p>유사투자자문업신고 : 해당 없음 / 단순 정보제공업</p>
            </div>
        </div>

        {/* 최하단: 투자 면책 조항 (방어막) */}
        <div className="text-[11px] leading-relaxed text-gray-400 bg-gray-50 p-4 rounded-lg">
          <p className="mb-2">
            <span className="font-bold text-gray-500">⚠️ 투자 유의사항</span><br/>
            본 서비스(리앤트)는 미국 주식 시장의 데이터를 시각화하여 제공하는 소프트웨어 도구입니다. 
            주식의 매수/매도를 추천하거나 권유하지 않으며, 투자에 대한 모든 책임은 사용자 본인에게 있습니다.
            본 서비스는 금융감독원에 신고된 유사투자자문업체가 아니며, 1:1 투자 자문을 제공하지 않습니다.
          </p>
          <p>
            © 2026 Reant Works. All rights reserved. 
            Data provided by Seibro, Yahoo Finance & Custom Algorithms.
          </p>
        </div>

      </div>
    </footer>
  );
}