'use client'

import { useEffect, useId, useRef } from 'react'

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView: { widget: new (config: Record<string, any>) => void }
  }
}

interface Props {
  symbol:      string          // e.g. "SOXX", "XLK"
  height?:     number
  interval?:   string         // "D" | "W" | "M"
  showStudies?: boolean
  minimal?:    boolean         // 미리보기용: 툴바·범례·볼륨 숨김
}

// MA 5 · 20 · 50 · 100 · 150 (모두 일봉 기준)
const MA_STUDIES = [5, 20, 50, 100, 150].map(length => ({
  id:      'MASimple@tv-script-std',
  version: 60,
  inputs:  { length },
}))

export default function TradingViewChart({
  symbol,
  height      = 440,
  interval    = 'D',
  showStudies = true,
  minimal     = false,
}: Props) {
  const uid         = useId().replace(/:/g, '')
  const containerId = `tv_${symbol}_${uid}`
  const created     = useRef(false)

  useEffect(() => {
    if (created.current) return

    const build = () => {
      if (typeof window === 'undefined' || !window.TradingView) return
      created.current = true
      new window.TradingView.widget({
        autosize:            true,
        symbol,
        interval,
        timezone:            'America/New_York',
        theme:               'light',
        style:               '1',
        locale:              'kr',
        toolbar_bg:          '#f8fafc',
        enable_publishing:   false,
        hide_side_toolbar:   true,
        allow_symbol_change: false,
        save_image:          false,
        container_id:        containerId,
        studies:             showStudies ? MA_STUDIES : [],
        ...(minimal && {
          hide_top_toolbar:  true,
          hide_legend:       true,
          withdateranges:    false,
          overrides: {
            'volume.visible': false,
          },
        }),
      })
    }

    // 스크립트가 이미 로드된 경우
    if (window.TradingView) { build(); return }

    // 이미 같은 스크립트가 삽입 중인 경우 (다른 차트 인스턴스가 먼저 로드 중)
    const existing = document.getElementById('tv-script')
    if (existing) {
      existing.addEventListener('load', build)
      return () => existing.removeEventListener('load', build)
    }

    // 첫 로드
    const script = document.createElement('script')
    script.id    = 'tv-script'
    script.src   = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.addEventListener('load', build)
    document.head.appendChild(script)

    return () => script.removeEventListener('load', build)
  }, [symbol, containerId, interval])

  return (
    <div
      className="tradingview-widget-container w-full"
      style={{ height }}
    >
      <div id={containerId} style={{ height: '100%' }} />
    </div>
  )
}
