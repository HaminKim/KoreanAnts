import './globals.css';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Analytics } from '@vercel/analytics/react';
import ShareButton from './components/ShareButton'; // 👈 1. 공유 버튼 불러오기

// ✨ 메타데이터 설정 (카톡 공유 미리보기 & SEO)
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
        url: '/og-image.png', // public 폴더에 이 이름으로 이미지를 넣으세요!
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
              <span className="text-lg">🇰🇷</span>
              <span>www.reant.kr</span>
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
              
              <Link
                href="#"
                className="hover:text-black transition"
              >
                About
              </Link>

              {/* ✨ 여기에 Share 추가! */}
              <span className="text-gray-300">|</span>
              <ShareButton />
              
            </nav>
          </header>

          {/* Page Content */}
          <main className="px-6 py-6 pb-24"> {/* 하단 버튼 공간 확보를 위해 pb-24 추가 */}
            {children}
          </main>
        
        </div>

        {/* ✨ Vercel Analytics (방문자 수 체크) */}
        <Analytics />
      </body>
    </html>
  );
}