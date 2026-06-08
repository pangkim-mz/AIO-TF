import { describe, it, expect } from "vitest";
import type { Asset, AssetRelationship, Finding } from "@omniguard/schema";
import type { ImpactRow } from "../lib/api";
import { buildImpactDetails } from "../lib/impact";

const T = "01HZZZZZZZZZZZZZZZZZZZZZZZZ";

function asset(id: string, name: string, type: Asset["attributes"]["type"]): Asset {
  const base = { id, tenantId: T, firstSeen: "", lastSeen: "", sourceIds: ["x"] };
  const attrs =
    type === "software_component"
      ? { type, purl: `pkg:npm/${name}@1`, ecosystem: "npm", version: "1", licenses: [] }
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

describe("buildImpactDetails", () => {
  const assets = [
    asset("svc", "checkout", "service"),
    asset("lib", "lodash", "software_component"),
  ];
  // checkout(service) -depends_on-> lodash
  const rels: AssetRelationship[] = [
    { id: "r1", tenantId: T, fromAssetId: "svc", toAssetId: "lib", type: "depends_on" },
  ];
  const findings = [finding("f1", "lib", "CRITICAL")];
  // lodash 자체 82, checkout은 own 0이지만 lodash로부터 82 상속
  const impact: ImpactRow[] = [
    { assetId: "svc", asset: "checkout", ownScore: 0, impactScore: 82, inherited: true, rootCause: "lodash" },
    { assetId: "lib", asset: "lodash", ownScore: 82, impactScore: 82, inherited: false, rootCause: "lodash" },
  ];

  it("영향도 내림차순 정렬 + 상속 델타를 계산한다", () => {
    const rows = buildImpactDetails(impact, assets, rels, findings);
    expect(rows.map((r) => r.assetName)).toEqual(["checkout", "lodash"]);
    const svc = rows.find((r) => r.assetName === "checkout")!;
    expect(svc.inherited).toBe(true);
    expect(svc.inheritedDelta).toBe(82); // 0 → 82
    expect(svc.rootCause).toBe("lodash");
  });

  it("나가는 의존(전파 경로)을 대상 영향도순으로 모은다", () => {
    const rows = buildImpactDetails(impact, assets, rels, findings);
    const svc = rows.find((r) => r.assetName === "checkout")!;
    expect(svc.dependencies).toEqual([
      { relType: "depends_on", name: "lodash", type: "software_component", impactScore: 82 },
    ]);
  });

  it("자산에 직접 걸린 발견을 모은다", () => {
    const rows = buildImpactDetails(impact, assets, rels, findings);
    const lib = rows.find((r) => r.assetName === "lodash")!;
    expect(lib.directFindings).toHaveLength(1);
    expect(lib.directFindings[0]!.severity).toBe("CRITICAL");
    // checkout은 자체 발견 없음(전적으로 상속)
    const svc = rows.find((r) => r.assetName === "checkout")!;
    expect(svc.directFindings).toEqual([]);
  });
});
