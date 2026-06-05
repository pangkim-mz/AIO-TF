import { z } from "zod";
import {
  type Asset,
  type Finding,
  type Severity,
  newId,
  now,
} from "@omniguard/schema";
import { cvssFromSeverities, severityFromCvss } from "./cvss";

export { parseCvssVector, cvssFromSeverities, severityFromCvss } from "./cvss";

const SOURCE_ID = "enrich-osv";
const OSV_QUERY_URL = "https://api.osv.dev/v1/query";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_CONCURRENCY = 8;
const RETRY_BASE_DELAY_MS = 300;

export interface EnrichOptions {
  timeoutMs?: number;
  retries?: number;
  concurrency?: number;
  /** 테스트/대체 구현 주입용. 기본값은 전역 fetch. */
  fetchImpl?: typeof fetch;
}

// ── OSV 응답 검증 (외부 입력 → zod, 미지 필드는 passthrough) ──
const OsvSeverity = z.object({ type: z.string(), score: z.string() });
const OsvVuln = z
  .object({
    id: z.string(),
    summary: z.string().optional(),
    details: z.string().optional(),
    severity: z.array(OsvSeverity).optional(),
    database_specific: z
      .object({ severity: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
type OsvVuln = z.infer<typeof OsvVuln>;

const OsvQueryResponse = z.object({ vulns: z.array(OsvVuln).optional() });

/** OSV/GHSA 텍스트 심각도를 공통 Severity로 매핑한다. */
export function normalizeSeverity(label: string | undefined): Severity {
  switch (label?.toUpperCase()) {
    case "CRITICAL":
      return "CRITICAL";
    case "HIGH":
      return "HIGH";
    case "MODERATE":
    case "MEDIUM":
      return "MEDIUM";
    case "LOW":
      return "LOW";
    default:
      return "INFO";
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 타임아웃 + 지수 백오프 재시도가 적용된 OSV 단건 조회. */
async function queryOsv(
  pkgName: string,
  version: string,
  ecosystem: string,
  opts: Required<Omit<EnrichOptions, "concurrency">>,
): Promise<OsvVuln[]> {
  const body = JSON.stringify({
    version,
    package: { name: pkgName, ecosystem },
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
    try {
      const response = await opts.fetchImpl(OSV_QUERY_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`OSV ${response.status} for ${pkgName}@${version}`);
      }
      const json: unknown = await response.json();
      const parsed = OsvQueryResponse.parse(json);
      return parsed.vulns ?? [];
    } catch (error) {
      lastError = error;
      if (attempt < opts.retries) {
        await delay(RETRY_BASE_DELAY_MS * 2 ** attempt);
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(
    `OSV 조회 실패 (${pkgName}@${version}): ${String(lastError)}`,
  );
}

/** 동시 실행 수를 제한하며 비동기 매핑한다 (외부 의존성 없이). */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!, index);
    }
  });
  await Promise.all(workers);
  return results;
}

function toFinding(vuln: OsvVuln, asset: Asset, tenantId: string): Finding {
  const timestamp = now();
  // CVSS 숫자 점수가 있으면 그 구간으로 정밀하게, 없으면 GHSA 텍스트 라벨로 폴백.
  const cvss = cvssFromSeverities(vuln.severity);
  const severity =
    cvss !== null
      ? severityFromCvss(cvss)
      : normalizeSeverity(vuln.database_specific?.severity);
  return {
    id: newId(),
    tenantId,
    firstSeen: timestamp,
    lastSeen: timestamp,
    sourceIds: [SOURCE_ID],
    assetId: asset.id,
    category: "vulnerability",
    sourceFindingId: vuln.id,
    title: vuln.summary ?? vuln.id,
    description: vuln.details ?? "",
    severity,
    cvss,
    status: "open",
    detectedAt: timestamp,
    resolvedAt: null,
    raw: vuln,
  };
}

/** software_component 자산을 OSV로 조회해 취약점 Finding을 생성한다. */
export async function enrichWithOsv(
  assets: readonly Asset[],
  tenantId: string,
  options: EnrichOptions = {},
): Promise<Finding[]> {
  const opts = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    retries: options.retries ?? DEFAULT_RETRIES,
    fetchImpl: options.fetchImpl ?? fetch,
  };
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;

  const targets = assets.filter(
    (a) => a.attributes.type === "software_component",
  );

  const perAsset = await mapLimit(targets, concurrency, async (asset) => {
    if (asset.attributes.type !== "software_component") return [];
    const vulns = await queryOsv(
      asset.name,
      asset.attributes.version,
      asset.attributes.ecosystem,
      opts,
    );
    return vulns.map((vuln) => toFinding(vuln, asset, tenantId));
  });

  return perAsset.flat();
}
