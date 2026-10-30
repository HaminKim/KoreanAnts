'use client'

// 개미지수 화면 공통 — 매크로 카테고리 섹션과 같은 머리(제목 + 검은 밑줄)

export function Section({ title, desc, right, children }: {
  title: string; desc?: string; right?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="mt-9">
      <div className="flex items-end justify-between gap-2 pb-2 flex-wrap" style={{ borderBottom: '1px solid var(--ink)' }}>
        <div className="flex items-baseline gap-2 flex-wrap">
          <h2 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{title}</h2>
          {desc && <span className="text-[11px]" style={{ color: 'var(--ink-mute)' }}>{desc}</span>}
        </div>
        {right}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

// 종목 로고: 원본 종목명 → 티커 → 기본 이미지 순으로 시도
export function Logo({ fileTicker, ticker, size = 28 }: { fileTicker: string; ticker: string; size?: number }) {
  return (
    <img
      src={`/logos/${encodeURIComponent(fileTicker)}.png`} alt="" width={size} height={size}
      className="shrink-0 rounded-full object-cover" style={{ width: size, height: size, border: '1px solid var(--hairline)', background: '#fff' }}
      onError={e => {
        const img = e.currentTarget
        const t = `/logos/${encodeURIComponent(ticker)}.png`
        if (!img.src.endsWith(t) && !img.src.includes('_us.png')) img.src = t
        else if (!img.src.includes('_us.png')) img.src = '/logos/_us.png'
      }}
    />
  )
}
