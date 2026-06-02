import "./globals.css";
import type { ReactNode } from "react";
import Link from "next/link";

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
    <html lang="ko">
      <body>
        <header>
          <nav aria-label="주요 메뉴">
            <span className="brand">OmniGuard</span>
            <Link href="/">대시보드</Link>
            <Link href="/services">서비스</Link>
            <Link href="/assets">자산</Link>
            <Link href="/findings">발견</Link>
            <Link href="/impact">영향도</Link>
            <Link href="/scan">스캔</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
