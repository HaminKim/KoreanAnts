'use client';

import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-white text-gray-500 py-12 px-4 mt-20 border-t border-gray-200">
      <div className="max-w-5xl mx-auto">
        
        {/* 1. 상단: 로고 및 고객센터 */}
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
             <span className="text-xs font-bold text-gray-400 mb-1">Customer Center</span>
             <a 
               href="mailto:reant.thanks@gmail.com" 
               className="text-sm font-medium text-gray-500 hover:text-gray-900 transition"
             >
               reant.thanks@gmail.com
             </a>
             <span className="text-[10px] text-gray-400 mt-1">평일 10:00 - 18:00 (주말/공휴일 휴무)</span>
          </div>
        </div>

        {/* 구분선 */}
        <div className="h-px w-full bg-gray-100 mb-8"></div>

        {/* 2. 중단: 약관 링크 (심사 필수 - 통합 페이지 연결) */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-6 text-xs font-medium">
            <Link href="/policy" className="hover:text-gray-900">서비스 이용약관</Link>
            <Link href="/policy" className="font-bold hover:text-gray-900">개인정보처리방침</Link>
            <Link href="/policy" className="hover:text-gray-900">환불 및 취소 규정</Link>
        </div>

        {/* 3. ★ 핵심: PG사 심사 필수 3종 세트 (배송/교환/환불) ★ */}
        {/* ※ 대표님이 주신 코드에는 이 부분이 없어서 제가 다시 넣었습니다. 이게 없으면 심사 반려됩니다! */}
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-100 text-[11px] text-gray-400 leading-relaxed">
            <p className="font-bold text-gray-500 mb-1">📢 서비스 정책 안내</p>
            <ul className="list-disc pl-4 space-y-1">
                <li>
                    <span className="font-semibold text-gray-500">배송/제공 기간 :</span> 결제 즉시 서비스 이용 권한이 부여되며, 별도의 실물 배송은 없습니다.
                </li>
                <li>
                    <span className="font-semibold text-gray-500">취소/해지 규정 :</span> 언제든지 해지 예약이 가능하며, 다음 결제일부터 청구되지 않습니다.
                </li>
                <li>
                    <span className="font-semibold text-gray-500">교환/환불 정책 :</span> 결제일로부터 7일 이내 서비스 이용 이력이 없는 경우 전액 환불 가능합니다. (상세 내용은 약관 참조)
                </li>
            </ul>
        </div>

        {/* 4. 하단: 사업자 정보 (대표님이 작성해주신 실전 데이터 반영 완료) */}
        <div className="text-[10px] leading-relaxed text-gray-400 font-light mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-1 gap-x-4">
                <p>상호명 : 리앤트 <span className="mx-1">|</span> 대표 : 김하민</p>
                <p>사업자등록번호 : 707-72-00694</p> 
                <p>주소 : 경기도 파주시 가재울로 99-10</p>
                <p>통신판매업신고 : 간이과세자 면제 대상</p>
                <p>유사투자자문업신고 : 해당 없음 / 단순 정보제공업</p>
            </div>
        </div>

        {/* 5. 최하단: 투자 면책 조항 (법적 방어막) */}
        <div className="text-[10px] leading-relaxed text-gray-300">
          <p className="mb-2">
            ⚠️ <strong>투자 유의사항:</strong> 본 서비스(리앤트)는 미국 주식 데이터를 시각화하는 분석 도구(Tool)입니다. 
            주식의 매수/매도를 추천하거나 권유하지 않으며, 투자 결과에 대한 법적 책임은 투자자 본인에게 있습니다.
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