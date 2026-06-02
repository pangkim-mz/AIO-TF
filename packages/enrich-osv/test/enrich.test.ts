import { describe, it, expect, vi } from "vitest";
import { type Asset, newId, now } from "@omniguard/schema";
import { enrichWithOsv, normalizeSeverity } from "../src/index";

function makeAsset(name: string, version: string): Asset {
  const ts = now();
  return {
    id: newId(),
    tenantId: newId(),
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["connector-npm"],
    name,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: {
      type: "software_component",
      purl: `pkg:npm/${name}@${version}`,
      ecosystem: "npm",
      version,
      licenses: [],
    },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("normalizeSeverity", () => {
  it("OSV/GHSA 라벨을 공통 Severity로 매핑한다", () => {
    expect(normalizeSeverity("CRITICAL")).toBe("CRITICAL");
    expect(normalizeSeverity("MODERATE")).toBe("MEDIUM");
    expect(normalizeSeverity("low")).toBe("LOW");
    expect(normalizeSeverity(undefined)).toBe("INFO");
  });
});

describe("enrichWithOsv", () => {
  it("OSV 응답을 Finding으로 변환한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        vulns: [
          {
            id: "GHSA-test-0001",
            summary: "Prototype pollution",
            details: "details here",
            database_specific: { severity: "HIGH" },
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const tenantId = newId();
    const asset = makeAsset("lodash", "4.17.20");
    const findings = await enrichWithOsv([asset], tenantId, { fetchImpl });

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.sourceFindingId).toBe("GHSA-test-0001");
    expect(finding.severity).toBe("HIGH");
    expect(finding.assetId).toBe(asset.id);
    expect(finding.tenantId).toBe(tenantId);
    expect(finding.category).toBe("vulnerability");
  });

  it("취약점이 없으면 빈 배열을 반환한다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch;
    const findings = await enrichWithOsv(
      [makeAsset("safe-pkg", "1.0.0")],
      newId(),
      { fetchImpl },
    );
    expect(findings).toEqual([]);
  });

  it("일시적 실패 후 재시도로 성공한다", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls === 1) throw new Error("network blip");
      return jsonResponse({ vulns: [{ id: "GHSA-retry" }] });
    }) as unknown as typeof fetch;

    const findings = await enrichWithOsv([makeAsset("x", "1.0.0")], newId(), {
      fetchImpl,
      retries: 2,
    });
    expect(calls).toBe(2);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("INFO"); // 라벨 없음 → INFO
  });
});
