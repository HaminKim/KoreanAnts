import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import Script from 'next/script';
import ShareButton from './components/ShareButton';
import AuthButton from './components/AuthButton';

// 메타데이터 설정
export const metadata: Metadata = {
  title: 'REANT - 리버스 개미',
  description: '공포에 사고 탐욕에 파는, 스마트한 개미들을 위한 미국 주식 데이터 분석',
  openGraph: {
    title: 'REANT - 리버스 개미',
    description: '지금 개미들은 뭘 사고 있을까? 수급 데이터로 보는 진짜 주식 흐름.',
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
    title: 'REANT - 리버스 개미',
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
      <body className="bg-white text-black">
        <div className="max-w-5xl mx-auto">
          
          {/* Header */}
          <header className="flex items-center justify-between px-6 py-4 border-b">
            {/* Brand */}
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold tracking-tight"
            >
              <span>REANT</span>
            </Link>

            {/* Navigation */}
            <nav className="flex gap-4 text-sm text-gray-600 items-center">
              <Link
                href="/"
                className="hover:text-black transition"
              >
                Home
              </Link>
              
              <span className="text-gray-300">|</span>
              
              {/* About 삭제됨 */}

              <ShareButton />
              
              <span className="text-gray-300">|</span>
              
              <AuthButton />
              
            </nav>
          </header>

          {/* Page Content */}
          <main className="px-6 py-6 pb-24">
            {children}
          </main>
        
        </div>

        {/* 구글 애즈 태그 (Google Ads) */}
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

        {/* Vercel Analytics (방문자 수 체크) */}
        <Analytics />
      </body>
    </html>
  );
}