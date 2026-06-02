import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import { type Asset, Criticality, newId, now } from "@omniguard/schema";

const SOURCE_ID = "connector-vendor";

// ── 인벤토리 입력 스키마 (외부 입력 → zod) ──────────────────
export const Certification = z.object({
  type: z.string(), // SOC2, ISO27001 ...
  expiresAt: z.string().date().optional(), // YYYY-MM-DD
});
export type Certification = z.infer<typeof Certification>;

export const VendorEntry = z.object({
  name: z.string(),
  domain: z.string(), // 자연키
  serviceCategory: z.string().default("unknown"),
  criticality: Criticality.optional(),
  certifications: z.array(Certification).default([]),
  requiredCertifications: z.array(z.string()).default([]),
});
export type VendorEntry = z.infer<typeof VendorEntry>;

const VendorInventory = z.object({ vendors: z.array(VendorEntry) });

export interface VendorScan {
  assets: Asset[];
  entries: VendorEntry[];
}

/** YAML/JSON 인벤토리 텍스트를 파싱·검증한다. (YAML 파서가 JSON도 처리) */
export function parseVendorInventoryContent(content: string): VendorEntry[] {
  const data: unknown = parseYaml(content);
  return VendorInventory.parse(data).vendors;
}

/** YAML 또는 JSON 인벤토리 파일을 파싱·검증한다. */
export async function parseVendorInventory(
  filePath: string,
): Promise<VendorEntry[]> {
  return parseVendorInventoryContent(await readFile(filePath, "utf8"));
}

/** 인벤토리 텍스트를 직접 받아 자산과 원본 엔트리를 반환한다 (API용). */
export function scanVendorInventoryContent(
  content: string,
  tenantId: string,
): VendorScan {
  const entries = parseVendorInventoryContent(content);
  return { assets: toAssets(entries, tenantId), entries };
}

/** 인벤토리 엔트리를 공통 Asset(vendor 변형)으로 매핑한다. */
export function toAssets(entries: VendorEntry[], tenantId: string): Asset[] {
  const timestamp = now();
  return entries.map((entry) => ({
    id: newId(),
    tenantId,
    firstSeen: timestamp,
    lastSeen: timestamp,
    sourceIds: [SOURCE_ID],
    name: entry.name,
    criticality: entry.criticality ?? "MEDIUM",
    owner: null,
    tags: { serviceCategory: entry.serviceCategory },
    attributes: {
      type: "vendor",
      domain: entry.domain,
      serviceCategory: entry.serviceCategory,
      certifications: entry.certifications.map((c) => c.type),
    },
  }));
}

/** 인벤토리 파일을 읽어 자산과 원본 엔트리를 함께 반환한다. */
export async function scanVendorInventory(
  filePath: string,
  tenantId: string,
): Promise<VendorScan> {
  const entries = await parseVendorInventory(filePath);
  return { assets: toAssets(entries, tenantId), entries };
}

export { evaluateVendors, type EvaluateOptions } from "./evaluate";
