import {
  type Asset,
  type Finding,
  type Severity,
  newId,
  now,
} from "@omniguard/schema";
import type { VendorEntry } from "./index";

const SOURCE_ID = "connector-vendor";
const MS_PER_DAY = 86_400_000;
const EXPIRING_SOON_DAYS = 30;

export interface EvaluateOptions {
  /** 만료 판정 기준일. 테스트 결정성을 위해 주입 가능 (기본: 현재 시각). */
  referenceDate?: Date;
}

function parseDate(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00Z`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
}

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
    category: "compliance",
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

/**
 * 벤더 자산과 원본 인벤토리에 규칙을 적용해 컴플라이언스 Finding을 생성한다.
 * 규칙: 인증서 만료 / 임박(30일) / 필수 인증서 누락. 결정론적이며 외부 호출 없음.
 * sourceFindingId는 안정적이라 재평가 시 멱등하다.
 */
export function evaluateVendors(
  assets: readonly Asset[],
  entries: readonly VendorEntry[],
  tenantId: string,
  options: EvaluateOptions = {},
): Finding[] {
  const referenceDate = options.referenceDate ?? new Date();
  const assetByDomain = new Map<string, Asset>();
  for (const asset of assets) {
    if (asset.attributes.type === "vendor") {
      assetByDomain.set(asset.attributes.domain, asset);
    }
  }

  const findings: Finding[] = [];
  for (const entry of entries) {
    const asset = assetByDomain.get(entry.domain);
    if (!asset) continue;

    const present = new Set(entry.certifications.map((c) => c.type));

    // 인증서 만료 / 임박
    for (const cert of entry.certifications) {
      if (cert.expiresAt === undefined) continue;
      const days = daysBetween(referenceDate, parseDate(cert.expiresAt));
      if (days < 0) {
        findings.push(
          makeFinding(
            tenantId,
            asset,
            `VND-CERT-EXPIRED:${cert.type}`,
            "HIGH",
            `${cert.type} 인증서 만료`,
            `${cert.type} 인증서가 ${cert.expiresAt}에 만료되었습니다 (${-days}일 경과).`,
            cert,
          ),
        );
      } else if (days <= EXPIRING_SOON_DAYS) {
        findings.push(
          makeFinding(
            tenantId,
            asset,
            `VND-CERT-EXPIRING:${cert.type}`,
            "MEDIUM",
            `${cert.type} 인증서 만료 임박`,
            `${cert.type} 인증서가 ${days}일 후(${cert.expiresAt}) 만료됩니다.`,
            cert,
          ),
        );
      }
    }

    // 필수 인증서 누락
    for (const required of entry.requiredCertifications) {
      if (!present.has(required)) {
        findings.push(
          makeFinding(
            tenantId,
            asset,
            `VND-CERT-MISSING:${required}`,
            "HIGH",
            `필수 인증서 누락: ${required}`,
            `정책상 필수인 ${required} 인증서가 확인되지 않았습니다.`,
            { required },
          ),
        );
      }
    }
  }
  return findings;
}
