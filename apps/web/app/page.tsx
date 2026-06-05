import type { ReactNode } from "react";
import Link from "next/link";

interface Feature {
  icon: ReactNode;
  title: string;
  body: string;
}

const PackageIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m7.5 4.27 9 5.15" />
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
);
const VendorIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21h18" />
    <path d="M5 21V7l8-4v18" />
    <path d="M19 21V11l-6-4" />
    <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
  </svg>
);
const CloudIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M17.5 19a4.5 4.5 0 1 0 0-9h-1.8A7 7 0 1 0 4 16.5" />
  </svg>
);
const LinkIcon = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);

const FEATURES: Feature[] = [
  {
    icon: PackageIcon,
    title: "SW 공급망",
    body: "npm lockfile를 정밀 분석하고 OSV.dev로 CVSS v3 점수를 매겨 취약 의존성을 찾아냅니다.",
  },
  {
    icon: VendorIcon,
    title: "벤더 / 서드파티",
    body: "외부 벤더의 컴플라이언스·인증 상태를 정규화해 공급망 밖의 위험까지 포착합니다.",
  },
  {
    icon: CloudIcon,
    title: "클라우드 (IaC)",
    body: "Terraform plan을 읽어 배포 전에 클라우드 리소스의 설정 위험을 진단합니다.",
  },
  {
    icon: LinkIcon,
    title: "서비스 통합 리스크",
    body: "자산 그래프 전파로 세 도메인의 위험을 서비스 단위 최악값으로 통합 산출합니다.",
  },
];

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "정규화",
    body: "세 도메인의 입력을 하나의 Asset / Finding / RiskScore 스키마로 흡수합니다.",
  },
  {
    title: "그래프 전파",
    body: "depends_on · hosted_on · provided_by 엣지를 따라 위험을 상위 자산으로 전파합니다.",
  },
  {
    title: "통합 점수",
    body: "결정론적 스코어링으로 서비스 단위 통합 리스크를 재현 가능하게 산출합니다.",
  },
];

export default function HomePage(): ReactNode {
  return (
    <div className="landing">
      <section className="hero">
        <span className="hero-eyebrow">외부 의존 · 인프라 위험 통합 관제</span>
        <h1 className="hero-title">
          공급망 · 벤더 · 클라우드 위험을
          <br />
          하나의 점수로 관제하세요
        </h1>
        <p className="hero-lede">
          OmniGuard는 SW 공급망, 서드파티 벤더, 클라우드(IaC)를 단일 스키마로
          흡수하고, 자산 그래프 전파로 서비스 단위 통합 리스크를 산출합니다.
        </p>
        <div className="hero-cta">
          <Link href="/dashboard" className="btn btn-primary">
            대시보드 보기
          </Link>
          <Link href="/scan" className="btn btn-outline">
            스캔 시작
          </Link>
        </div>
      </section>

      <section className="features" aria-label="핵심 기능">
        {FEATURES.map((f) => (
          <article className="feature" key={f.title}>
            <span className="feature-icon">{f.icon}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <section className="steps" aria-label="동작 방식">
        <h2 className="section-title">동작 방식</h2>
        <div className="steps-grid">
          {STEPS.map((s, i) => (
            <div className="step" key={s.title}>
              <span className="step-num">{i + 1}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-band">
        <h2>지금 첫 스캔을 실행하세요</h2>
        <p>
          package.json · vendors.yaml · Terraform plan을 올리면 통합 리스크
          점수가 바로 산출됩니다.
        </p>
        <Link href="/scan" className="btn btn-onaccent">
          스캔 시작
        </Link>
      </section>

      <footer className="site-footer">
        <span>© 2026 OmniGuard</span>
        <nav aria-label="푸터 메뉴">
          <Link href="/dashboard">대시보드</Link>
          <Link href="/services">서비스</Link>
          <Link href="/findings">발견</Link>
          <Link href="/scan">스캔</Link>
        </nav>
      </footer>
    </div>
  );
}
