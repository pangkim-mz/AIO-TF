import { describe, it, expect } from "vitest";
import type { Asset, AssetRelationship, Finding } from "@omniguard/schema";
import type { ImpactRow } from "../lib/api";
import { buildAssetDetails } from "../lib/assets";

const T = "01HZZZZZZZZZZZZZZZZZZZZZZZZ";

function asset(id: string, name: string, type: Asset["attributes"]["type"]): Asset {
  const base = { id, tenantId: T, firstSeen: "", lastSeen: "", sourceIds: ["x"] };
  const attrs =
    type === "software_component"
      ? { type, purl: `pkg:npm/${name}@1`, ecosystem: "npm", version: "1", licenses: ["MIT"] }
      : { type: "service" as const, key: name };
  return { ...base, name, criticality: "HIGH", owner: null, tags: {}, attributes: attrs };
}

function finding(id: string, assetId: string, sev: Finding["severity"]): Finding {
  return {
    id, tenantId: T, firstSeen: "", lastSeen: "", sourceIds: ["x"],
    assetId, category: "vulnerability", sourceFindingId: `SRC-${id}`, title: `발견 ${id}`,
    description: "", severity: sev, cvss: null, status: "open",
    detectedAt: "", resolvedAt: null, raw: {},
  };
}

describe("buildAssetDetails", () => {
  const assets = [
    asset("svc", "checkout", "service"),
    asset("lib", "lodash", "software_component"),
  ];
  // checkout(service) -depends_on-> lodash
  const rels: AssetRelationship[] = [
    { id: "r1", tenantId: T, fromAssetId: "svc", toAssetId: "lib", type: "depends_on" },
  ];
  const findings = [
    finding("f1", "lib", "CRITICAL"),
    finding("f2", "lib", "LOW"),
  ];
  const impact: ImpactRow[] = [
    { assetId: "svc", asset: "checkout", ownScore: 0, impactScore: 82, inherited: true, rootCause: "lodash" },
    { assetId: "lib", asset: "lodash", ownScore: 82, impactScore: 82, inherited: false, rootCause: "lodash" },
  ];

  it("영향도 내림차순 → 발견 수 내림차순 → 이름순으로 정렬한다", () => {
    const rows = buildAssetDetails(assets, findings, impact, rels);
    // 둘 다 영향도 82 → 발견 수 많은 lodash(2) 먼저
    expect(rows.map((r) => r.name)).toEqual(["lodash", "checkout"]);
  });

  it("자산별 심각도 개수와 발견 목록을 모은다", () => {
    const rows = buildAssetDetails(assets, findings, impact, rels);
    const lib = rows.find((r) => r.name === "lodash")!;
    expect(lib.severityCounts.CRITICAL).toBe(1);
    expect(lib.severityCounts.LOW).toBe(1);
    expect(lib.severityCounts.total).toBe(2);
    expect(lib.findings[0]!.severity).toBe("CRITICAL"); // 심각도 내림차순
    const svc = rows.find((r) => r.name === "checkout")!;
    expect(svc.severityCounts.total).toBe(0);
    expect(svc.findings).toEqual([]);
  });

  it("나가는/들어오는 엣지 수를 센다", () => {
    const rows = buildAssetDetails(assets, findings, impact, rels);
    const svc = rows.find((r) => r.name === "checkout")!;
    expect(svc.dependencyCount).toBe(1); // checkout -> lodash
    expect(svc.dependentCount).toBe(0);
    const lib = rows.find((r) => r.name === "lodash")!;
    expect(lib.dependencyCount).toBe(0);
    expect(lib.dependentCount).toBe(1); // checkout가 의존
  });

  it("도메인별 속성과 식별자를 펼친다", () => {
    const rows = buildAssetDetails(assets, findings, impact, rels);
    const lib = rows.find((r) => r.name === "lodash")!;
    expect(lib.identifier).toBe("pkg:npm/lodash@1");
    expect(lib.attributes).toContainEqual({ label: "버전", value: "1" });
    expect(lib.attributes).toContainEqual({ label: "라이선스", value: "MIT" });
  });

  it("영향도 행이 없는 자산은 0으로 폴백한다", () => {
    const rows = buildAssetDetails(assets, findings, [], rels);
    expect(rows.every((r) => r.impactScore === 0 && r.ownScore === 0)).toBe(true);
  });
});
