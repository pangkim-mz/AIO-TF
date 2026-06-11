import { describe, it, expect } from "vitest";
import type { Severity } from "@omniguard/schema";
import type { FindingDetail } from "../lib/findings";
import type { DashboardSummary } from "../lib/format";
import { buildSecurityReportMarkdown, countBySeverity } from "../lib/report";

function detail(
  id: string,
  severity: Severity,
  title: string,
  overrides: Partial<FindingDetail> = {},
): FindingDetail {
  return {
    id,
    severity,
    category: "vulnerability",
    sourceFindingId: `SRC-${id}`,
    title,
    description: `${title} 설명`,
    cvss: null,
    status: "open",
    detectedAt: "2026-06-11T00:00:00.000Z",
    assetId: `a-${id}`,
    assetName: "gsap",
    assetType: "software_component",
    score: null,
    factors: [],
    impacted: [],
    ...overrides,
  };
}

const summary: DashboardSummary = {
  assetCount: 5,
  findingCount: 2,
  criticalCount: 0,
  topImpact: 68,
  inheritedCount: 1,
};

describe("countBySeverity", () => {
  it("심각도별 개수를 센다", () => {
    const counts = countBySeverity([
      detail("1", "HIGH", "a"),
      detail("2", "MEDIUM", "b"),
      detail("3", "MEDIUM", "c"),
    ]);
    expect(counts.HIGH).toBe(1);
    expect(counts.MEDIUM).toBe(2);
    expect(counts.LOW).toBe(0);
  });
});

describe("buildSecurityReportMarkdown", () => {
  it("제목·생성 시각·요약 지표를 포함한다", () => {
    const md = buildSecurityReportMarkdown({
      summary,
      findings: [detail("1", "HIGH", "Prototype pollution in gsap")],
      generatedAt: "2026. 6. 11. 오후 2:00:00",
    });
    expect(md).toContain("# OmniGuard 보안 점검 결과 리포트");
    expect(md).toContain("2026. 6. 11. 오후 2:00:00");
    expect(md).toContain("| 자산 | 5 |");
    expect(md).toContain("| 최고 영향도 | 68/100 |");
  });

  it("발견 상세에 심각도·자산·CVSS·위험 점수를 표기한다", () => {
    const md = buildSecurityReportMarkdown({
      summary,
      findings: [
        detail("1", "HIGH", "Prototype pollution in gsap", { cvss: 7.5, score: 68 }),
      ],
      generatedAt: "x",
    });
    expect(md).toContain("[높음(HIGH)] Prototype pollution in gsap");
    expect(md).toContain("| 대상 자산 | gsap (SW 패키지) |");
    expect(md).toContain("| CVSS | 7.5 |");
    expect(md).toContain("| 위험 점수 | 68/100 |");
  });

  it("영향 전파가 있으면 하위 자산을 나열한다", () => {
    const md = buildSecurityReportMarkdown({
      summary,
      findings: [
        detail("1", "HIGH", "x", { impacted: [{ asset: "megazone.digital", impactScore: 68 }] }),
      ],
      generatedAt: "x",
    });
    expect(md).toContain("↳ megazone.digital (영향도 68)");
  });

  it("발견이 없으면 안내 문구를 넣는다", () => {
    const md = buildSecurityReportMarkdown({
      summary: { ...summary, findingCount: 0 },
      findings: [],
      generatedAt: "x",
    });
    expect(md).toContain("발견된 항목이 없습니다");
  });
});
