import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";
import { Inter, Noto_Sans_KR } from "next/font/google";

// NordVPN 디자인 토큰의 타이포(Inter + 한글 Noto Sans KR)를 self-host로 로드
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

export const metadata = {
  title: "OmniGuard",
  description: "AI 기반 인프라/공급망 리스크 통합 관제",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="ko" className={`${inter.variable} ${notoSansKr.variable}`}>
      <body>
        <header>
          <nav aria-label="주요 메뉴">
            <Link href="/" className="brand">
              OmniGuard
            </Link>
            <Link href="/dashboard">대시보드</Link>
            <Link href="/services">서비스</Link>
            <Link href="/assets">자산</Link>
            <Link href="/findings">발견</Link>
            <Link href="/impact">영향도</Link>
            <Link href="/report">리포트</Link>
            <Link href="/scan">스캔</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
