import {
  type Asset,
  type Finding,
  type Severity,
  newId,
  now,
} from "@omniguard/schema";
import type { ParsedResource } from "./index";

const SOURCE_ID = "connector-iac";
const OPEN_CIDR = "0.0.0.0/0";

function makeFinding(
  tenantId: string,
  asset: Asset,
  sourceFindingId: string,
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
    assetId: asset.id,
    category: "misconfiguration",
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

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** ingress 블록(배열/단일)에서 0.0.0.0/0 개방 여부를 검사한다. */
function hasOpenIngress(values: Record<string, unknown>): boolean {
  const ingress = values.ingress;
  const blocks = Array.isArray(ingress) ? ingress : ingress ? [ingress] : [];
  for (const block of blocks) {
    if (typeof block !== "object" || block === null) continue;
    const cidrs = (block as Record<string, unknown>).cidr_blocks;
    if (Array.isArray(cidrs) && cidrs.includes(OPEN_CIDR)) return true;
  }
  return false;
}

/**
 * 클라우드 리소스에 미설정 규칙을 적용해 misconfiguration Finding을 생성한다.
 * 결정론적이며 외부 호출 없음. sourceFindingId는 안정적이라 재평가 시 멱등하다.
 */
export function evaluateIac(
  assets: readonly Asset[],
  resources: readonly ParsedResource[],
  tenantId: string,
): Finding[] {
  const assetByResourceId = new Map<string, Asset>();
  for (const asset of assets) {
    if (asset.attributes.type === "cloud_resource") {
      assetByResourceId.set(asset.attributes.resourceId, asset);
    }
  }

  const findings: Finding[] = [];
  const add = (
    asset: Asset,
    id: string,
    sev: Severity,
    title: string,
    desc: string,
    raw: unknown,
  ): void => {
    findings.push(makeFinding(tenantId, asset, id, sev, title, desc, raw));
  };

  for (const resource of resources) {
    const asset = assetByResourceId.get(resource.address);
    if (!asset) continue;
    const v = resource.values;

    // S3 공개 ACL
    if (resource.type === "aws_s3_bucket") {
      const acl = asString(v.acl);
      if (acl === "public-read" || acl === "public-read-write") {
        add(
          asset,
          "IAC-S3-PUBLIC-ACL",
          "HIGH",
          "공개 S3 버킷 ACL",
          `S3 버킷 ACL이 '${acl}'로 공개되어 있습니다.`,
          { acl },
        );
      }
    }

    // 보안 그룹 전체 개방 인바운드
    if (resource.type === "aws_security_group" && hasOpenIngress(v)) {
      add(
        asset,
        "IAC-SG-OPEN-INGRESS",
        "HIGH",
        "전체 개방 인바운드 규칙",
        `보안 그룹에 ${OPEN_CIDR} 전체 개방 인바운드 규칙이 있습니다.`,
        { ingress: v.ingress },
      );
    }

    // 퍼블릭 액세스 허용
    if (v.publicly_accessible === true) {
      add(
        asset,
        "IAC-PUBLIC-ACCESS",
        "HIGH",
        "퍼블릭 액세스 허용",
        `${resource.type} 리소스가 퍼블릭 액세스를 허용합니다.`,
        { publicly_accessible: true },
      );
    }

    // 미암호화 스토리지
    if (v.storage_encrypted === false) {
      add(
        asset,
        "IAC-NO-ENCRYPTION",
        "MEDIUM",
        "미암호화 스토리지",
        `${resource.type} 리소스의 저장 암호화가 비활성화되어 있습니다.`,
        { storage_encrypted: false },
      );
    }
  }

  return findings;
}
