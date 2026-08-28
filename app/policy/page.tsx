export default function PolicyPage() {
  return (
    <div className="max-w-3xl mx-auto py-20 px-6 text-gray-700">
      <h1 className="text-3xl font-bold mb-10 text-gray-900">서비스 정책 및 약관</h1>

      {/* 섹션 1: 이용약관 */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4 border-b pb-2">제1조 (이용약관의 준칙)</h2>
        <p className="text-sm leading-relaxed">
          본 서비스(리앤트)는 공정거래위원회가 고시한 <strong>&lt;전자상거래 표준약관&gt;</strong>을 준수합니다.
          <br />
          자세한 서비스 이용에 관한 조항은 대한민국 관련 법령 및 상관례에 따릅니다.
        </p>
      </section>

      {/* 섹션 2: 개인정보처리방침 */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4 border-b pb-2">제2조 (개인정보처리방침)</h2>
        <p className="text-sm leading-relaxed">
          회사는 이용자의 개인정보를 중요시하며, <strong>&quot;개인정보 보호법&quot;</strong>을 준수하고 있습니다.
          <br />
          수집된 개인정보(이메일, 결제정보 등)는 서비스 제공 및 결제 처리 목적으로만 사용되며, 
          제3자에게 제공되지 않습니다. 상세한 처리는 관련 법령의 개인정보보호 규정을 따릅니다.
        </p>
      </section>

      {/* 섹션 3: 환불 및 취소 규정 (가장 중요 ★) */}
      <section className="mb-12">
        <h2 className="text-xl font-bold mb-4 border-b pb-2">제3조 (환불 및 취소 규정)</h2>
        <div className="bg-gray-50 p-6 rounded-lg text-sm space-y-2 border">
          <p><strong>1. 구독 해지:</strong> 사용자는 언제든지 구독을 해지할 수 있으며, 해지 시 다음 결제일부터 청구되지 않습니다.</p>
          <p><strong>2. 환불 규정:</strong> 전자상거래법 제17조에 의거하여, 결제 후 <strong>7일 이내</strong>에 서비스 이용 이력이 없는 경우 전액 환불이 가능합니다.</p>
          <p><strong>3. 예외 사항:</strong> 디지털 콘텐츠 특성상, 데이터를 열람하거나 사용한 이후에는 환불이 제한될 수 있습니다.</p>
        </div>
      </section>

      <div className="mt-20 pt-10 border-t text-center text-xs text-gray-400">
        <p>리앤트 (REANT)</p>
        <p>문의: reant.thanks@gmail.com</p>
      </div>
    </div>
  );
}