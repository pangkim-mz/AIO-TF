import { describe, it, expect } from "vitest";
import { type Asset, newId, now } from "@omniguard/schema";
import { buildTopology, parseServiceManifestContent } from "../src/index";

const TENANT = newId();

function softwareAsset(name: string, purl: string): Asset {
  const ts = now();
  return {
    id: newId(),
    tenantId: TENANT,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["connector-npm"],
    name,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: { type: "software_component", purl, ecosystem: "npm", version: "1.0.0", licenses: [] },
  };
}
function cloudAsset(resourceId: string): Asset {
  const ts = now();
  return {
    id: newId(),
    tenantId: TENANT,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["connector-iac"],
    name: resourceId,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: { type: "cloud_resource", resourceId, provider: "aws", resourceType: "aws_db_instance", region: null },
  };
}
function vendorAsset(domain: string): Asset {
  const ts = now();
  return {
    id: newId(),
    tenantId: TENANT,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["connector-vendor"],
    name: domain,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: { type: "vendor", domain, serviceCategory: "saas", certifications: [] },
  };
}

const MANIFEST = `
services:
  - name: Checkout API
    key: checkout-api
    dependsOn: [pkg:npm/lodash@4.17.21]
    hostedOn: [aws_db_instance.main]
    providedBy: [acme.com]
`;

describe("parseServiceManifestContent", () => {
  it("매니페스트를 파싱하고 기본값을 채운다", () => {
    const entries = parseServiceManifestContent(MANIFEST);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.dependsOn).toEqual(["pkg:npm/lodash@4.17.21"]);
    expect(entries[0]!.providedBy).toEqual(["acme.com"]);
  });
});

describe("buildTopology", () => {
  const existing = [
    softwareAsset("lodash", "pkg:npm/lodash@4.17.21"),
    cloudAsset("aws_db_instance.main"),
    vendorAsset("acme.com"),
  ];

  it("서비스 자산과 3개 도메인 교차 엣지를 만든다", () => {
    const entries = parseServiceManifestContent(MANIFEST);
    const topo = buildTopology(entries, existing, TENANT);

    expect(topo.assets).toHaveLength(1);
    expect(topo.assets[0]!.attributes.type).toBe("service");

    const types = topo.relationships.map((r) => r.type).sort();
    expect(types).toEqual(["depends_on", "hosted_on", "provided_by"]);
    expect(topo.relationships.every((r) => r.fromAssetId === topo.assets[0]!.id)).toBe(true);
    expect(topo.unresolved).toEqual([]);
  });

  it("매칭 안 되는 참조는 unresolved로 보고하고 엣지를 만들지 않는다", () => {
    const topo = buildTopology(
      [
        {
          name: "X",
          key: "x",
          dependsOn: ["pkg:npm/missing@1.0.0"],
          hostedOn: [],
          providedBy: [],
        },
      ],
      existing,
      TENANT,
    );
    expect(topo.relationships).toHaveLength(0);
    expect(topo.unresolved).toEqual(["pkg:npm/missing@1.0.0"]);
  });

  it("software_component는 이름으로도 매칭된다", () => {
    const topo = buildTopology(
      [{ name: "Y", key: "y", dependsOn: ["lodash"], hostedOn: [], providedBy: [] }],
      existing,
      TENANT,
    );
    expect(topo.relationships).toHaveLength(1);
    expect(topo.relationships[0]!.type).toBe("depends_on");
  });
});
