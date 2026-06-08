import type { Asset, Finding, Severity } from "@omniguard/schema";
import type { ImpactRow } from "./api";

/** 자산의 도메인별 자연키(식별자) 표시값. */
export function assetIdentifier(asset: Asset): string {
  switch (asset.attributes.type) {
    case "software_component":
      return asset.attributes.purl;
    case "vendor":
      return asset.attributes.domain;
    case "cloud_resource":
      return asset.attributes.resourceId;
    case "service":
      return asset.attributes.key;
    case "web_asset":
      return asset.attributes.url;
  }
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1,
};

/** 심각도 정렬용 순위 (높을수록 심각). */
export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

/** 심각도 내림차순으로 정렬한 새 배열을 반환한다. */
export function sortFindingsBySeverity(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
}

export interface DashboardSummary {
  assetCount: number;
  findingCount: number;
  criticalCount: number;
  /** 가장 높은 영향도 점수 (그래프 전파 반영). */
  topImpact: number;
  /** 상속(전파)으로 리스크가 올라간 자산 수. */
  inheritedCount: number;
}

export function summarize(
  assetCount: number,
  findings: readonly Finding[],
  impact: readonly ImpactRow[],
): DashboardSummary {
  return {
    assetCount,
    findingCount: findings.length,
    criticalCount: findings.filter((f) => f.severity === "CRITICAL").length,
    topImpact: impact.reduce((max, r) => Math.max(max, r.impactScore), 0),
    inheritedCount: impact.filter((r) => r.inherited).length,
  };
}
