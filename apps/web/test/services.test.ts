import { describe, it, expect } from "vitest";
import type { Asset, AssetRelationship } from "@omniguard/schema";
import type { ImpactRow } from "../lib/api";
import { buildServiceViews } from "../lib/services";

const TS = "2026-01-01T00:00:00.000Z";

function service(id: string, name: string): Asset {
  return {
    id,
    tenantId: "t",
    firstSeen: TS,
    lastSeen: TS,
    sourceIds: ["connector-service"],
    name,
    criticality: "HIGH",
    owner: null,
    tags: { role: "service" },
    attributes: { type: "service", key: name },
  };
}

function pkg(id: string, name: string): Asset {
  return {
    id,
    tenantId: "t",
    firstSeen: TS,
    lastSeen: TS,
    sourceIds: ["connector-npm"],
    name,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: {
      type: "software_component",
      purl: `pkg:npm/${name}@1.0.0`,
      ecosystem: "npm",
      version: "1.0.0",
      licenses: [],
    },
  };
}

function vendor(id: string, name: string): Asset {
  return {
    id,
    tenantId: "t",
    firstSeen: TS,
    lastSeen: TS,
    sourceIds: ["connector-vendor"],
    name,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: { type: "vendor", domain: `${name}.com` },
  };
}

function edge(
  from: string,
  to: string,
  type: AssetRelationship["type"],
): AssetRelationship {
  return { id: `${from}-${to}`, tenantId: "t", fromAssetId: from, toAssetId: to, type };
}

function impactRow(assetId: string, asset: string, impactScore: number): ImpactRow {
  return { assetId, asset, ownScore: 0, impactScore, inherited: true, rootCause: asset };
}

describe("buildServiceViews", () => {
  it("서비스 자산만 추려 통합 영향도·근원과 함께 뷰로 만든다", () => {
    const assets = [service("s1", "checkout"), pkg("p1", "lodash")];
    const rels = [edge("s1", "p1", "depends_on")];
    const impact = [
      impactRow("s1", "checkout", 90),
      impactRow("p1", "lodash", 90),
    ];

    const views = buildServiceViews(assets, rels, impact);

    expect(views).toHaveLength(1);
    expect(views[0]!.name).toBe("checkout");
    expect(views[0]!.impactScore).toBe(90);
    expect(views[0]!.rootCause).toBe("checkout");
    expect(views[0]!.dependencies).toHaveLength(1);
    expect(views[0]!.dependencies[0]!.name).toBe("lodash");
    expect(views[0]!.dependencies[0]!.domain).toBe("software");
  });

  it("관계 종류를 도메인으로 분류하고 도메인별 개수를 집계한다", () => {
    const assets = [service("s1", "api"), pkg("p1", "left-pad"), vendor("v1", "acme")];
    const rels = [edge("s1", "p1", "depends_on"), edge("s1", "v1", "provided_by")];
    const views = buildServiceViews(assets, rels, []);

    expect(views[0]!.counts).toEqual({ software: 1, cloud: 0, vendor: 1, other: 0 });
  });

  it("의존성을 영향도 내림차순으로 정렬한다", () => {
    const assets = [service("s1", "api"), pkg("p1", "low"), pkg("p2", "high")];
    const rels = [edge("s1", "p1", "depends_on"), edge("s1", "p2", "depends_on")];
    const impact = [impactRow("p1", "low", 20), impactRow("p2", "high", 80)];

    const views = buildServiceViews(assets, rels, impact);

    expect(views[0]!.dependencies.map((d) => d.name)).toEqual(["high", "low"]);
  });

  it("서비스를 영향도 내림차순으로 정렬한다", () => {
    const assets = [service("s1", "low-svc"), service("s2", "high-svc")];
    const impact = [impactRow("s1", "low-svc", 10), impactRow("s2", "high-svc", 70)];

    const views = buildServiceViews(assets, [], impact);

    expect(views.map((v) => v.name)).toEqual(["high-svc", "low-svc"]);
  });

  it("자산 목록에 없는 의존 대상은 id로 폴백하고 영향도 0으로 둔다", () => {
    const assets = [service("s1", "api")];
    const rels = [edge("s1", "missing", "hosted_on")];

    const views = buildServiceViews(assets, rels, []);

    expect(views[0]!.dependencies[0]!.name).toBe("missing");
    expect(views[0]!.dependencies[0]!.impactScore).toBe(0);
    expect(views[0]!.dependencies[0]!.domain).toBe("cloud");
  });
});
