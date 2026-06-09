import {
  type Asset,
  type Finding,
  type Severity,
  newId,
  now,
} from "@omniguard/schema";

export const SOURCE_ID = "connector-web";

/** web_asset/노출JS 자산에 부착되는 finding을 만든다. assetId는 영속화 전 임시 id. */
export function makeFinding(
  tenantId: string,
  assetId: string,
  sourceFindingId: string,
  category: Finding["category"],
  severity: Severity,
  title: string,
  description: string,
  raw: unknown,
): Finding {
  const ts = now();
  return {
    id: newId(),
    tenantId,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: [SOURCE_ID],
    assetId,
    category,
    sourceFindingId,
    title,
    description,
    severity,
    cvss: null,
    status: "open",
    detectedAt: ts,
    resolvedAt: null,
    raw,
  };
}

/** 발견된 서브도메인을 web_asset 자산으로 만든다(자연키 = origin URL). */
export function makeWebAsset(
  tenantId: string,
  hostname: string,
  criticality: Asset["criticality"],
  tags: Record<string, string>,
): Asset {
  const ts = now();
  const url = `https://${hostname}/`;
  return {
    id: newId(),
    tenantId,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: [SOURCE_ID],
    name: hostname,
    criticality,
    owner: null,
    tags: { role: "web_asset", ...tags },
    attributes: { type: "web_asset", url, hostname },
  };
}
