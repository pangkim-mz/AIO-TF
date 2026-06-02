import { z } from "zod";
import { ulid } from "ulid";

/** 정렬 가능한 고유 ID 생성 (시간순 정렬 가능 — 시계열 발견 추적에 유리). */
export const newId = (): string => ulid();

/** 현재 시각 ISO 문자열. */
export const now = (): string => new Date().toISOString();

// ── 공통 원시값 ──────────────────────────────────────────────
export const Severity = z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Severity = z.infer<typeof Severity>;

export const Criticality = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type Criticality = z.infer<typeof Criticality>;

/** 모든 엔티티 공통 필드 (멀티테넌트 + 출처 추적). */
const BaseEntity = z.object({
  id: z.string().ulid(),
  tenantId: z.string().ulid(),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  sourceIds: z.array(z.string()).min(1),
});

// ── 자산 (도메인별 attributes 분기) ──────────────────────────
const SoftwareComponentAttrs = z.object({
  type: z.literal("software_component"),
  purl: z.string(), // 자연키: pkg:npm/lodash@4.17.21
  ecosystem: z.string(),
  version: z.string(),
  licenses: z.array(z.string()).default([]),
});

const VendorAttrs = z.object({
  type: z.literal("vendor"),
  domain: z.string(), // 자연키: acme.com
  serviceCategory: z.string(),
  certifications: z.array(z.string()).default([]),
});

export const CloudProvider = z.enum(["aws", "azure", "gcp"]);
export type CloudProvider = z.infer<typeof CloudProvider>;

const CloudResourceAttrs = z.object({
  type: z.literal("cloud_resource"),
  resourceId: z.string(), // 자연키: arn:aws:s3:::bucket
  provider: CloudProvider,
  resourceType: z.string(),
  region: z.string().nullable(),
});

export const AssetAttributes = z.discriminatedUnion("type", [
  SoftwareComponentAttrs,
  VendorAttrs,
  CloudResourceAttrs,
]);
export type AssetAttributes = z.infer<typeof AssetAttributes>;

export const Asset = BaseEntity.extend({
  name: z.string(),
  criticality: Criticality.default("MEDIUM"),
  owner: z.string().nullable(),
  tags: z.record(z.string()).default({}),
  attributes: AssetAttributes,
});
export type Asset = z.infer<typeof Asset>;

// ── Asset Graph 엣지 ─────────────────────────────────────────
export const AssetRelationship = z.object({
  id: z.string().ulid(),
  tenantId: z.string().ulid(),
  fromAssetId: z.string().ulid(),
  toAssetId: z.string().ulid(),
  type: z.enum(["depends_on", "provided_by", "hosted_on", "contains"]),
});
export type AssetRelationship = z.infer<typeof AssetRelationship>;

// ── 발견된 위험 (도메인 무관 공통 형태) ──────────────────────
export const FindingCategory = z.enum([
  "vulnerability",
  "license",
  "misconfiguration",
  "integrity",
  "availability",
  "compliance",
]);
export type FindingCategory = z.infer<typeof FindingCategory>;

export const FindingStatus = z.enum([
  "open",
  "triaged",
  "resolved",
  "accepted",
  "false_positive",
]);
export type FindingStatus = z.infer<typeof FindingStatus>;

export const Finding = BaseEntity.extend({
  assetId: z.string().ulid(),
  category: FindingCategory,
  sourceFindingId: z.string(), // 원본 ID: CVE-2024-1234 / GHSA-xxxx
  title: z.string(),
  description: z.string(),
  severity: Severity,
  cvss: z.number().min(0).max(10).nullable(),
  status: FindingStatus.default("open"),
  detectedAt: z.string().datetime(),
  resolvedAt: z.string().datetime().nullable(),
  raw: z.unknown(), // 원본 페이로드 보존 (any 금지 → unknown)
});
export type Finding = z.infer<typeof Finding>;

// ── 계산된 리스크 점수 (결정론적, 근거 분해) ─────────────────
export const RiskFactor = z.object({
  name: z.string(),
  weight: z.number(),
  value: z.number(),
  contribution: z.number(),
});
export type RiskFactor = z.infer<typeof RiskFactor>;

export const RiskScore = z.object({
  id: z.string().ulid(),
  tenantId: z.string().ulid(),
  findingId: z.string().ulid(),
  score: z.number().min(0).max(100),
  factors: z.array(RiskFactor),
  scoringVersion: z.string(),
  computedAt: z.string().datetime(),
});
export type RiskScore = z.infer<typeof RiskScore>;
