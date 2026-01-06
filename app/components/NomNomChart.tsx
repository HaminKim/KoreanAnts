'use client';

// Props 타입은 유지 (에러 방지용)
type StockData = {
  ticker: string;
  name: string;
};

type Props = {
  fire?: StockData;
  top?: StockData;
  bottom?: StockData;
  knife?: StockData;
};

export default function NomNomChart({ fire, top, bottom, knife }: Props) {
  
  // 🎨 스타일 정의: 높이를 h-32(약 128px)로 줄이고, 더 심플하게 변경
  const commonCardStyle = "relative z-10 rounded-xl flex flex-col items-center justify-center p-2 text-center h-28 md:h-32 bg-gray-50 border border-gray-200 cursor-not-allowed opacity-60 hover:opacity-100 transition-opacity";
  const commonLogo = <span className="text-2xl md:text-3xl mb-1 grayscale">🚧</span>; // 이모티콘 크기도 축소
  const commonTitle = "Coming Soon";
  const commonDesc = "준비 중입니다";

  return (
    <section className="max-w-5xl mx-auto px-4 mb-8">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
           <h2 className="text-base font-bold text-gray-400">🧭 불타기 물타기 알림</h2>
           <span className="text-[10px] text-white bg-gray-300 px-1.5 py-0.5 rounded-full">SOON</span>
        </div>
      </div>

      {/* 2x2 격자 (간격도 gap-2로 좁힘) */}
      <div className="grid grid-cols-2 gap-2">
        
        {/* 🔥 1. 불타기 */}
        <div className={commonCardStyle}>
          <span className="absolute top-2 left-2 text-[9px] font-bold text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">Hot</span>
          {commonLogo}
          <h3 className="text-sm font-bold text-gray-500 mt-1">{commonTitle}</h3>
          <p className="text-[10px] text-gray-400">{commonDesc}</p>
        </div>

        {/* 🚨 2. 상투 */}
        <div className={commonCardStyle}>
          <span className="absolute top-2 right-2 text-[9px] font-bold text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">Warn</span>
          {commonLogo}
          <h3 className="text-sm font-bold text-gray-500 mt-1">{commonTitle}</h3>
          <p className="text-[10px] text-gray-400">{commonDesc}</p>
        </div>

        {/* 💰 3. 하따 */}
        <div className={commonCardStyle}>
          <span className="absolute bottom-2 left-2 text-[9px] font-bold text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">Buy</span>
          {commonLogo}
          <h3 className="text-sm font-bold text-gray-500 mt-1">{commonTitle}</h3>
          <p className="text-[10px] text-gray-400">{commonDesc}</p>
        </div>

        {/* 🔪 4. 칼날 */}
        <div className={commonCardStyle}>
           <span className="absolute bottom-2 right-2 text-[9px] font-bold text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">Stop</span>
          {commonLogo}
          <h3 className="text-sm font-bold text-gray-500 mt-1">{commonTitle}</h3>
          <p className="text-[10px] text-gray-400">{commonDesc}</p>
        </div>

      </div>
    </section>
  );
}