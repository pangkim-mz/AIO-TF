import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { newId } from "@omniguard/schema";
import {
  evaluateVendors,
  parseVendorInventory,
  scanVendorInventory,
  toAssets,
} from "../src/index";

const fixture = fileURLToPath(
  new URL("./fixtures/vendors.yaml", import.meta.url),
);
const REFERENCE = new Date("2026-06-02T00:00:00Z");

describe("parseVendorInventory", () => {
  it("YAML 인벤토리를 파싱하고 기본값을 채운다", async () => {
    const entries = await parseVendorInventory(fixture);
    expect(entries).toHaveLength(3);
    const tiny = entries.find((e) => e.domain === "tinytool.dev");
    expect(tiny?.certifications).toEqual([]);
    expect(tiny?.requiredCertifications).toEqual(["SOC2"]);
  });
});

describe("toAssets", () => {
  it("vendor 자산으로 매핑하고 domain을 자연키로 쓴다", async () => {
    const entries = await parseVendorInventory(fixture);
    const assets = toAssets(entries, newId());
    const acme = assets.find((a) => a.name === "Acme Payments");
    expect(acme?.criticality).toBe("HIGH");
    if (acme?.attributes.type === "vendor") {
      expect(acme.attributes.domain).toBe("acme.com");
      expect(acme.attributes.certifications).toEqual(["SOC2", "ISO27001"]);
    }
  });
});

describe("evaluateVendors", () => {
  it("만료/임박/누락 규칙으로 컴플라이언스 Finding을 생성한다", async () => {
    const tenantId = newId();
    const { assets, entries } = await scanVendorInventory(fixture, tenantId);
    const findings = evaluateVendors(assets, entries, tenantId, {
      referenceDate: REFERENCE,
    });

    const ids = findings.map((f) => f.sourceFindingId).sort();
    expect(ids).toEqual([
      "VND-CERT-EXPIRED:SOC2", // Acme: SOC2 만료
      "VND-CERT-EXPIRING:SOC2", // CloudCorp: SOC2 임박
      "VND-CERT-MISSING:SOC2", // TinyTool: SOC2 누락
    ]);

    const expired = findings.find(
      (f) => f.sourceFindingId === "VND-CERT-EXPIRED:SOC2",
    );
    expect(expired?.severity).toBe("HIGH");
    expect(expired?.category).toBe("compliance");

    const expiring = findings.find(
      (f) => f.sourceFindingId === "VND-CERT-EXPIRING:SOC2",
    );
    expect(expiring?.severity).toBe("MEDIUM");

    // 유효한 ISO27001은 Finding을 만들지 않는다
    expect(
      findings.some((f) => f.sourceFindingId.includes("ISO27001")),
    ).toBe(false);
  });

  it("sourceFindingId가 안정적이라 재평가 시 동일하다(멱등 근거)", async () => {
    const tenantId = newId();
    const { assets, entries } = await scanVendorInventory(fixture, tenantId);
    const first = evaluateVendors(assets, entries, tenantId, {
      referenceDate: REFERENCE,
    }).map((f) => f.sourceFindingId);
    const second = evaluateVendors(assets, entries, tenantId, {
      referenceDate: REFERENCE,
    }).map((f) => f.sourceFindingId);
    expect(first).toEqual(second);
  });
});
