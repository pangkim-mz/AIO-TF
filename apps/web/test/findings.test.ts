import { describe, it, expect } from "vitest";
import type { Asset, Finding, RiskScore } from "@omniguard/schema";
import type { ImpactRow } from "../lib/api";
import { buildFindingDetails } from "../lib/findings";

const TENANT = "01HZZZZZZZZZZZZZZZZZZZZZZZZ";

function asset(id: string, name: string, type: Asset["attributes"]["type"]): Asset {
  const base = { id, tenantId: TENANT, firstSeen: "", lastSeen: "", sourceIds: ["x"] };
  const attrs =
    type === "software_component"
      ? { type, purl: `pkg:npm/${name}@1`, ecosystem: "npm", version: "1", licenses: [] }
      : type === "web_asset"
        ? { type, url: `https://${name}`, hostname: name }
        : { type: "service" as const, key: name };
  return { ...base, name, criticality: "HIGH", owner: null, tags: {}, attributes: attrs };
}

function finding(id: string, assetId: string, sev: Finding["severity"], title: string): Finding {
  return {
    id, tenantId: TENANT, firstSeen: "", lastSeen: "", sourceIds: ["x"],
    assetId, category: "vulnerability", sourceFindingId: `SRC-${id}`, title,
    description: `${title} 설명`, severity: sev, cvss: null, status: "open",
    detectedAt: "2026-06-08T00:00:00.000Z", resolvedAt: null, raw: {},
  };
}

function score(findingId: string, value: number): RiskScore {
  return {
    id: `s-${findingId}`, tenantId: TENANT, findingId, score: value,
    factors: [{ name: "severity", weight: 0.7, value: 95, contribution: 66.5 }],
    scoringVersion: "1.0.0", computedAt: "",
  };
}

describe("buildFindingDetails", () => {
  const assets = [asset("a1", "lodash", "software_component"), asset("a2", "checkout", "service")];
  const findings = [
    finding("f1", "a1", "MEDIUM", "취약점 M"),
    finding("f2", "a1", "CRITICAL", "취약점 C"),
  ];
  const scores = [score("f1", 40), score("f2", 90)];
  const impact: ImpactRow[] = [
    { assetId: "a2", asset: "checkout", ownScore: 0, impactScore: 90, inherited: true, rootCause: "lodash" },
  ];

  it("심각도 내림차순으로 정렬한다(동일하면 점수순)", () => {
    const rows = buildFindingDetails(findings, assets, scores, impact);
    expect(rows.map((r) => r.severity)).toEqual(["CRITICAL", "MEDIUM"]);
  });

  it("자산 이름·종류·점수·factors를 채운다", () => {
    const rows = buildFindingDetails(findings, assets, scores, impact);
    const crit = rows.find((r) => r.id === "f2")!;
    expect(crit.assetName).toBe("lodash");
    expect(crit.assetType).toBe("software_component");
    expect(crit.score).toBe(90);
    expect(crit.factors).toHaveLength(1);
  });

  it("발견 자산을 근원으로 위험을 상속한 하위 자산을 모은다", () => {
    const rows = buildFindingDetails(findings, assets, scores, impact);
    const crit = rows.find((r) => r.id === "f2")!;
    expect(crit.impacted).toEqual([{ asset: "checkout", impactScore: 90 }]);
  });

  it("점수가 없는 발견은 score=null·factors=[]", () => {
    const rows = buildFindingDetails([finding("f3", "a1", "LOW", "무점수")], assets, [], []);
    expect(rows[0]!.score).toBeNull();
    expect(rows[0]!.factors).toEqual([]);
  });
});
