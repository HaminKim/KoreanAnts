import './globals.css';
import Link from 'next/link';

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
              <span>www.reant.kr>ㅈ>ㅈㅈ>ㅈ
            </Link>

            {/* Navigation */}
            <nav className="flex gap-4 text-sm text-gray-600">
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
            </nav>
          </header>

          {/* Page Content */}
          <main className="px-6 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
