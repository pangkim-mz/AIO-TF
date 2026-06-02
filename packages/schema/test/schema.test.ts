import { describe, it, expect } from "vitest";
import { Asset, Finding, newId, now } from "../src/index";

describe("newId", () => {
  it("26자 ULID를 생성한다", () => {
    const id = newId();
    expect(id).toHaveLength(26);
  });

  it("매번 다른 값을 생성한다", () => {
    expect(newId()).not.toBe(newId());
  });
});

describe("Asset 스키마", () => {
  it("software_component 자산을 검증한다", () => {
    const parsed = Asset.parse({
      id: newId(),
      tenantId: newId(),
      firstSeen: now(),
      lastSeen: now(),
      sourceIds: ["connector-npm"],
      name: "lodash",
      owner: null,
      attributes: {
        type: "software_component",
        purl: "pkg:npm/lodash@4.17.21",
        ecosystem: "npm",
        version: "4.17.21",
      },
    });
    expect(parsed.criticality).toBe("MEDIUM"); // 기본값
    expect(parsed.tags).toEqual({});
    if (parsed.attributes.type === "software_component") {
      expect(parsed.attributes.licenses).toEqual([]);
    }
  });

  it("잘못된 attributes type은 거부한다", () => {
    expect(() =>
      Asset.parse({
        id: newId(),
        tenantId: newId(),
        firstSeen: now(),
        lastSeen: now(),
        sourceIds: ["x"],
        name: "x",
        owner: null,
        attributes: { type: "unknown" },
      }),
    ).toThrow();
  });
});

describe("Finding 스키마", () => {
  it("status 기본값은 open 이다", () => {
    const finding = Finding.parse({
      id: newId(),
      tenantId: newId(),
      firstSeen: now(),
      lastSeen: now(),
      sourceIds: ["enrich-osv"],
      assetId: newId(),
      category: "vulnerability",
      sourceFindingId: "CVE-2024-0001",
      title: "test",
      description: "test",
      severity: "HIGH",
      cvss: null,
      detectedAt: now(),
      resolvedAt: null,
      raw: {},
    });
    expect(finding.status).toBe("open");
  });
});
