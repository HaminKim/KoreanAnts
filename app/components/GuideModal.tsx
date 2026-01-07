'use client';

export default function GuideModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-scale-in" onClick={(e) => e.stopPropagation()}>
        
        {/* 닫기 버튼 */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-900">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {/* 제목 */}
        <h3 className="text-xl font-bold text-gray-900 mb-2">🧭 놈놈놈 분석이란?</h3>
        <p className="text-sm text-gray-500 mb-6">주가 흐름과 개미들의 수급을 비교해 포지션을 제안합니다.</p>

        {/* 4분면 설명 */}
        <div className="space-y-3">
          
          <div className="flex gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
            <div className="text-2xl">🔥</div>
            <div>
              <h4 className="font-bold text-red-600 text-sm">불타기 (Hot)</h4>
              <p className="text-xs text-gray-600 mt-0.5">주가는 오르는데 개미는 팔고 있음. <br/>세력이 끌어올리는 찐 상승 구간!</p>
            </div>
          </div>

          <div className="flex gap-3 p-3 bg-orange-50 rounded-xl border border-orange-100">
            <div className="text-2xl">🚨</div>
            <div>
              <h4 className="font-bold text-orange-600 text-sm">상투 (Warn)</h4>
              <p className="text-xs text-gray-600 mt-0.5">주가 폭등 + 개미 풀매수. <br/>설거지 당할 수 있으니 조심!</p>
            </div>
          </div>

          <div className="flex gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
            <div className="text-2xl">💰</div>
            <div>
              <h4 className="font-bold text-blue-600 text-sm">하따 (Buy)</h4>
              <p className="text-xs text-gray-600 mt-0.5">주가는 폭락 + 개미 손절. <br/>공포에 질려 던질 때가 기회?</p>
            </div>
          </div>

          <div className="flex gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-2xl">🔪</div>
            <div>
              <h4 className="font-bold text-gray-600 text-sm">칼날 (Stop)</h4>
              <p className="text-xs text-gray-600 mt-0.5">주가 하락 + 개미 물타기. <br/>지하실 갈 수 있으니 잡지 마세요.</p>
            </div>
          </div>

        </div>

        <button onClick={onClose} className="w-full mt-6 bg-gray-900 text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition">
          확인했습니다
        </button>

      </div>
    </div>
  );
}