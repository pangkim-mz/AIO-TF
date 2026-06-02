import { describe, it, expect } from "vitest";
import type { Finding } from "@omniguard/schema";
import type { ImpactRow } from "../lib/api";
import { severityRank, sortFindingsBySeverity, summarize } from "../lib/format";

function finding(severity: Finding["severity"]): Finding {
  return {
    id: severity,
    tenantId: "t",
    firstSeen: "2026-01-01T00:00:00.000Z",
    lastSeen: "2026-01-01T00:00:00.000Z",
    sourceIds: ["x"],
    assetId: "a",
    category: "vulnerability",
    sourceFindingId: severity,
    title: "t",
    description: "d",
    severity,
    cvss: null,
    status: "open",
    detectedAt: "2026-01-01T00:00:00.000Z",
    resolvedAt: null,
    raw: {},
  };
}

describe("severityRank", () => {
  it("CRITICAL이 가장 높고 INFO가 가장 낮다", () => {
    expect(severityRank("CRITICAL")).toBeGreaterThan(severityRank("HIGH"));
    expect(severityRank("LOW")).toBeGreaterThan(severityRank("INFO"));
  });
});

describe("sortFindingsBySeverity", () => {
  it("심각도 내림차순으로 정렬한다", () => {
    const sorted = sortFindingsBySeverity([
      finding("LOW"),
      finding("CRITICAL"),
      finding("MEDIUM"),
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(["CRITICAL", "MEDIUM", "LOW"]);
  });
});

describe("summarize", () => {
  it("자산/발견/critical/영향도 요약을 계산한다", () => {
    const findings = [finding("CRITICAL"), finding("LOW")];
    const impact: ImpactRow[] = [
      { assetId: "a", asset: "app", ownScore: 0, impactScore: 82, inherited: true, rootCause: "lib" },
      { assetId: "b", asset: "lib", ownScore: 82, impactScore: 82, inherited: false, rootCause: "lib" },
    ];
    const summary = summarize(5, findings, impact);
    expect(summary).toEqual({
      assetCount: 5,
      findingCount: 2,
      criticalCount: 1,
      topImpact: 82,
      inheritedCount: 1,
    });
  });
});
