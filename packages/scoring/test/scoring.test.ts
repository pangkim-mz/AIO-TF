import { describe, it, expect } from "vitest";
import {
  type Asset,
  type Criticality,
  type Finding,
  type Severity,
  newId,
  now,
} from "@omniguard/schema";
import { SCORING_VERSION, scoreFinding } from "../src/index";

function makeAsset(criticality: Criticality): Asset {
  const ts = now();
  return {
    id: newId(),
    tenantId: newId(),
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["connector-npm"],
    name: "pkg",
    criticality,
    owner: null,
    tags: {},
    attributes: {
      type: "software_component",
      purl: "pkg:npm/pkg@1.0.0",
      ecosystem: "npm",
      version: "1.0.0",
      licenses: [],
    },
  };
}

function makeFinding(severity: Severity, tenantId: string): Finding {
  const ts = now();
  return {
    id: newId(),
    tenantId,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["enrich-osv"],
    assetId: newId(),
    category: "vulnerability",
    sourceFindingId: "CVE-2024-0001",
    title: "t",
    description: "d",
    severity,
    cvss: null,
    status: "open",
    detectedAt: ts,
    resolvedAt: null,
    raw: {},
  };
}

describe("scoreFinding", () => {
  it("CRITICAL 취약점 + HIGH 자산 → 89점", () => {
    // severity 95*0.7=66.5, criticality 75*0.3=22.5, 합 89
    const asset = makeAsset("HIGH");
    const finding = makeFinding("CRITICAL", asset.tenantId);
    const result = scoreFinding(finding, asset);
    expect(result.score).toBe(89);
    expect(result.scoringVersion).toBe(SCORING_VERSION);
  });

  it("INFO 취약점 + LOW 자산 → 14점", () => {
    // severity 10*0.7=7, criticality 25*0.3=7.5, 합 14.5 → 반올림 15
    const asset = makeAsset("LOW");
    const finding = makeFinding("INFO", asset.tenantId);
    const result = scoreFinding(finding, asset);
    expect(result.score).toBe(15);
  });

  it("factors의 기여분 합이 점수와 일치한다(반올림 전)", () => {
    const asset = makeAsset("MEDIUM");
    const finding = makeFinding("HIGH", asset.tenantId);
    const result = scoreFinding(finding, asset);
    const sum = result.factors.reduce((s, f) => s + f.contribution, 0);
    expect(result.score).toBe(Math.round(sum));
  });

  it("동일 입력은 항상 동일 점수를 낸다(결정론적)", () => {
    const asset = makeAsset("HIGH");
    const finding = makeFinding("CRITICAL", asset.tenantId);
    expect(scoreFinding(finding, asset).score).toBe(
      scoreFinding(finding, asset).score,
    );
  });
});
