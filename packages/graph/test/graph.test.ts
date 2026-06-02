import { describe, it, expect } from "vitest";
import type { Asset, AssetRelationship } from "@omniguard/schema";
import { newId, now } from "@omniguard/schema";
import { propagateRisk } from "../src/index";

function asset(id: string): Asset {
  const ts = now();
  return {
    id,
    tenantId: "t",
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["x"],
    name: id,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: {
      type: "software_component",
      purl: `pkg:npm/${id}@1.0.0`,
      ecosystem: "npm",
      version: "1.0.0",
      licenses: [],
    },
  };
}

function edge(from: string, to: string): AssetRelationship {
  return {
    id: newId(),
    tenantId: "t",
    fromAssetId: from,
    toAssetId: to,
    type: "depends_on",
  };
}

describe("propagateRisk", () => {
  it("의존성의 리스크가 상위로 전파된다", () => {
    // app -> lib -> vuln(취약)
    const assets = [asset("app"), asset("lib"), asset("vuln")];
    const rels = [edge("app", "lib"), edge("lib", "vuln")];
    const own = new Map([["vuln", 80]]);

    const result = propagateRisk(assets, rels, own);

    expect(result.get("vuln")!.impactScore).toBe(80);
    expect(result.get("lib")!.impactScore).toBe(80);
    expect(result.get("app")!.impactScore).toBe(80);
    expect(result.get("app")!.inherited).toBe(true);
    expect(result.get("app")!.rootCauseAssetId).toBe("vuln");
    expect(result.get("vuln")!.inherited).toBe(false);
  });

  it("여러 의존성 중 최대값을 취한다", () => {
    const assets = [asset("app"), asset("a"), asset("b")];
    const rels = [edge("app", "a"), edge("app", "b")];
    const own = new Map([
      ["a", 30],
      ["b", 70],
    ]);

    const result = propagateRisk(assets, rels, own);
    expect(result.get("app")!.impactScore).toBe(70);
    expect(result.get("app")!.rootCauseAssetId).toBe("b");
  });

  it("자신의 리스크가 더 크면 상속이 아니다", () => {
    const assets = [asset("app"), asset("dep")];
    const rels = [edge("app", "dep")];
    const own = new Map([
      ["app", 90],
      ["dep", 40],
    ]);

    const result = propagateRisk(assets, rels, own);
    expect(result.get("app")!.impactScore).toBe(90);
    expect(result.get("app")!.inherited).toBe(false);
    expect(result.get("app")!.rootCauseAssetId).toBe("app");
  });

  it("순환이 있어도 무한루프 없이 처리한다", () => {
    const assets = [asset("a"), asset("b")];
    const rels = [edge("a", "b"), edge("b", "a")]; // 순환
    const own = new Map([["a", 50]]);

    const result = propagateRisk(assets, rels, own);
    expect(result.get("a")!.impactScore).toBe(50);
    expect(result.get("b")!.impactScore).toBe(50);
  });

  it("리스크가 없으면 0, rootCause는 null", () => {
    const assets = [asset("app"), asset("dep")];
    const result = propagateRisk(assets, [edge("app", "dep")], new Map());
    expect(result.get("app")!.impactScore).toBe(0);
    expect(result.get("app")!.rootCauseAssetId).toBeNull();
  });
});
