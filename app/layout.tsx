import './globals.css';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import Script from 'next/script';
import HeaderWithModal from './components/HeaderWithModal'; // ✨ 이것만 있으면 됩니다!

// 🚀 [SEO & Google 인증]
export const metadata: Metadata = {
  title: 'REANT | My Economics Professor',
  description: "You made it here, you're a lucky guy. Check the data, and get some ideas.",
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
    title: 'REANT | My Economics Professor',
    description: "You made it here, you're a lucky guy. Check the data, and get some ideas.",
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
    title: 'REANT | My Economics Professor',
    description: "You made it here, you're a lucky guy. Check the data, and get some ideas.",
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