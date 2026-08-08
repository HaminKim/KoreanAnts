import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import Script from 'next/script';
import HeaderWithModal from './components/HeaderWithModal'; // ✨ 이것만 있으면 됩니다!

// 🚀 [SEO & Google 인증]
export const metadata: Metadata = {
  title: '리앤트(REANT) | 주식 투자 심리 분석 & AI 리포트',
  description: '개미들의 반란, 리앤트(ReAnt). 리버스 개미 전략, AI 주식 분석, 공포/탐욕 지수, 미국 주식 투자 정보를 제공합니다.',
  keywords: ['리앤트', 'ReAnt', '리버스개미', '주식분석', '미국주식', 'AI투자', '투자심리', '공포탐욕지수'],
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  verification: {
    google: 'YxyiRFV2A7ub4mFChMZaJRr06Ybrs-TJJezPOjRtufY',
  },
  other: {
    'google-adsense-account': 'ca-pub-9107127166272654',
  },
  openGraph: {
    title: '리앤트(REANT) - 개미와 반대로 투자하라',
    description: '오늘 개미들은 뭘 샀을까? AI가 분석해주는 역발상 투자 전략.',
    url: 'https://www.reant.kr',
    siteName: 'REANT',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'REANT Preview',
      },
    ],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '리앤트(REANT) - 리버스 개미',
    description: '스마트한 개미들을 위한 데이터 분석',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <div className="max-w-5xl mx-auto">
          
          {/* ✨ 기존의 복잡한 <header>를 제거하고 이거 한 줄로 끝! */}
          <HeaderWithModal />

          {/* Page Content */}
          <main className="px-4 sm:px-6 py-6 pb-24">
            {children}
          </main>
        
        </div>

        {/* 구글 애즈 태그 */}
        <Script
          strategy="afterInteractive"
          src="https://www.googletagmanager.com/gtag/js?id=AW-17856168628"
        />
        <Script id="google-ads-tag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'AW-17856168628');
          `}
        </Script>

        <Analytics />
      </body>
    </html>
  );
}