import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import Script from 'next/script';
import ShareButton from './components/ShareButton';
import AuthButton from './components/AuthButton';

// 🚀 [SEO & Google 인증] 검색 엔진 최적화 설정
export const metadata: Metadata = {
  title: '리앤트(REANT) | 주식 투자 심리 분석 & AI 리포트',
  description: '개미들의 반란, 리앤트(ReAnt). 리버스 개미 전략, AI 주식 분석, 공포/탐욕 지수, 미국 주식 투자 정보를 제공합니다.',
  keywords: ['리앤트', 'ReAnt', '리버스개미', '주식분석', '미국주식', 'AI투자', '투자심리', '공포탐욕지수'],
  
  // 👇 [추가됨] 구글 검색 결과 및 탭에 뜰 아이콘(로고) 설정
  icons: {
    icon: '/icon.png',      // app 폴더 혹은 public 폴더에 있는 icon.png
    shortcut: '/icon.png',
    apple: '/icon.png',     // 아이폰 홈 화면 추가 시 뜰 아이콘
  },

  // 구글 소유권 인증 번호
  verification: {
    google: 'YxyiRFV2A7ub4mFChMZaJRr06Ybrs-TJJezPOjRtufY', 
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
      <body className="bg-white text-black">
        <div className="max-w-5xl mx-auto">
          
          {/* Header */}
          <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
            {/* Brand */}
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold tracking-tight"
            >
              <span>REANT</span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center gap-3 sm:gap-4 text-sm text-gray-600">
              {/* Home (모바일에서는 공간 부족하면 숨기거나 아이콘으로 대체 가능하지만 일단 유지) */}
              <Link
                href="/"
                className="hidden sm:block hover:text-black transition"
              >
                Home
              </Link>
              
              <span className="hidden sm:block text-gray-300">|</span>
              
              <ShareButton />

              {/* ✨ [NEW] 구독하기 버튼 (세련된 골드 그라데이션 적용) */}
              <Link 
                href="/pricing"
                className="px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold shadow-sm hover:shadow-md hover:from-amber-600 hover:to-orange-700 transition-all transform hover:-translate-y-0.5 text-xs sm:text-sm flex items-center gap-1"
              >
                <span>구독하기</span>
                <span className="hidden sm:inline">👑</span>
              </Link>
              
              <AuthButton />
              
            </nav>
          </header>

          {/* Page Content */}
          <main className="px-4 sm:px-6 py-6 pb-24">
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