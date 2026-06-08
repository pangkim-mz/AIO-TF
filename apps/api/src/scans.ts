import { z } from "zod";
import {
  type Asset,
  type AssetRelationship,
  type Finding,
  type RiskScore,
} from "@omniguard/schema";
import { scoreFinding } from "@omniguard/scoring";
import { propagateRisk } from "@omniguard/graph";
import {
  evaluateVendors,
  scanVendorInventoryContent,
} from "@omniguard/connector-vendor";
import { scanPackageContent } from "@omniguard/connector-npm";
import { evaluateIac, scanTerraformPlanContent } from "@omniguard/connector-iac";
import {
  buildTopology,
  parseServiceManifestContent,
} from "@omniguard/connector-service";
import { scanUrl, type WebScan } from "@omniguard/connector-web";
import type { Job, Repository } from "@omniguard/storage";

/** 자산 → 취약점 보강 함수. 기본은 OSV 호출, 테스트에서는 주입으로 대체. */
export type Enricher = (
  assets: readonly Asset[],
  tenantId: string,
) => Promise<Finding[]>;

/** URL → 웹 점검 결과. 기본은 네트워크 호출(scanUrl), 테스트에서는 주입으로 대체. */
export type WebScanner = (url: string, tenantId: string) => Promise<WebScan>;

// ── 스캔 입력 본문 스키마(검증은 enqueue 시점, 실행은 워커에서) ──
export const ScanVendorBody = z.object({
  inventory: z.string().min(1), // YAML 또는 JSON 인벤토리 텍스트
});

export const ScanNpmBody = z.object({
  packageJson: z.string().min(1),
  lockfile: z.string().optional(),
  lockfileType: z.enum(["npm", "pnpm"]).optional(),
});

export const ScanIacBody = z.object({
  plan: z.string().min(1), // terraform show -json 출력
  stackName: z.string().optional(),
});

export const ScanServiceBody = z.object({
  manifest: z.string().min(1), // 서비스 매니페스트(YAML/JSON)
});

export const ScanWebBody = z.object({
  url: z.string().min(1), // 점검 대상 URL(스킴 없으면 https로 정규화)
});

export interface ScanSummary {
  assetCount: number;
  relationshipCount: number;
  findingCount: number;
  topScore: number;
}

export interface ServiceSummary {
  serviceCount: number;
  edgeCount: number;
  unresolved: string[];
}

/** findings를 점수화·영속화하고 최고 점수를 반환한다 (도메인 공통). */
async function scoreAndPersist(
  repo: Repository,
  tenantId: string,
  assets: readonly Asset[],
  findings: readonly Finding[],
): Promise<number> {
  const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));
  const scores: RiskScore[] = [];
  for (const finding of findings) {
    const asset = assetById.get(finding.assetId);
    if (asset) scores.push(scoreFinding(finding, asset));
  }
  await repo.upsertScores(tenantId, scores);
  return scores.reduce((max, s) => Math.max(max, s.score), 0);
}

/** 자산을 저장하고, 엣지 끝점을 영속화된 멱등 id로 재매핑해 관계를 저장한다. */
async function persistScan(
  repo: Repository,
  tenantId: string,
  scanned: { assets: Asset[]; relationships: AssetRelationship[] },
): Promise<{ assets: Asset[]; relationships: AssetRelationship[] }> {
  const assets = await repo.upsertAssets(tenantId, scanned.assets);
  const idMap = new Map(scanned.assets.map((a, i) => [a.id, assets[i]!.id]));
  const remapped = scanned.relationships.map((r) => ({
    ...r,
    fromAssetId: idMap.get(r.fromAssetId) ?? r.fromAssetId,
    toAssetId: idMap.get(r.toAssetId) ?? r.toAssetId,
  }));
  const relationships = await repo.upsertRelationships(tenantId, remapped);
  return { assets, relationships };
}

async function runVendorScan(
  repo: Repository,
  tenantId: string,
  inventory: string,
): Promise<ScanSummary> {
  const { assets: scanned, entries } = scanVendorInventoryContent(
    inventory,
    tenantId,
  );
  const assets = await repo.upsertAssets(tenantId, scanned);
  const evaluated = evaluateVendors(assets, entries, tenantId);
  const findings = await repo.upsertFindings(tenantId, evaluated);
  const topScore = await scoreAndPersist(repo, tenantId, assets, findings);

  return {
    assetCount: assets.length,
    relationshipCount: 0,
    findingCount: findings.length,
    topScore,
  };
}

async function runNpmScan(
  repo: Repository,
  enrich: Enricher,
  tenantId: string,
  input: { packageJson: string; lockfile?: string; lockfileType?: "npm" | "pnpm" },
): Promise<ScanSummary> {
  const { assets, relationships } = await persistScan(
    repo,
    tenantId,
    scanPackageContent(input, tenantId),
  );
  const enriched = await enrich(assets, tenantId);
  const findings = await repo.upsertFindings(tenantId, enriched);
  const topScore = await scoreAndPersist(repo, tenantId, assets, findings);

  return {
    assetCount: assets.length,
    relationshipCount: relationships.length,
    findingCount: findings.length,
    topScore,
  };
}

async function runIacScan(
  repo: Repository,
  tenantId: string,
  plan: string,
  stackName: string | undefined,
): Promise<ScanSummary> {
  const scanned = scanTerraformPlanContent(plan, tenantId, { stackName });
  const { assets, relationships } = await persistScan(repo, tenantId, scanned);
  const evaluated = evaluateIac(assets, scanned.resources, tenantId);
  const findings = await repo.upsertFindings(tenantId, evaluated);
  const topScore = await scoreAndPersist(repo, tenantId, assets, findings);

  return {
    assetCount: assets.length,
    relationshipCount: relationships.length,
    findingCount: findings.length,
    topScore,
  };
}

/**
 * URL을 점검한다: web_asset + 노출 JS 자산/엣지 + TLS·헤더·SRI findings(커넥터) +
 * 노출 JS의 CVE(enrich 재사용). 커넥터 findings는 영속화 id로 재매핑한다(CLI web.ts와 동일).
 */
async function runWebScan(
  repo: Repository,
  enrich: Enricher,
  tenantId: string,
  url: string,
  scanWeb: WebScanner,
): Promise<ScanSummary> {
  const scanned = await scanWeb(url, tenantId);
  const assets = await repo.upsertAssets(tenantId, scanned.assets);
  const idMap = new Map(scanned.assets.map((a, i) => [a.id, assets[i]!.id]));
  const remappedRels = scanned.relationships.map((r) => ({
    ...r,
    fromAssetId: idMap.get(r.fromAssetId) ?? r.fromAssetId,
    toAssetId: idMap.get(r.toAssetId) ?? r.toAssetId,
  }));
  const relationships = await repo.upsertRelationships(tenantId, remappedRels);

  const webFindings = scanned.findings.map((f) => ({
    ...f,
    assetId: idMap.get(f.assetId) ?? f.assetId,
  }));
  const osvFindings = await enrich(assets, tenantId); // 노출 JS(software_component)→CVE
  const findings = await repo.upsertFindings(tenantId, [
    ...webFindings,
    ...osvFindings,
  ]);
  const topScore = await scoreAndPersist(repo, tenantId, assets, findings);

  return {
    assetCount: assets.length,
    relationshipCount: relationships.length,
    findingCount: findings.length,
    topScore,
  };
}

/** 서비스 매니페스트를 기존 자산에 연결한다(도메인 간 그래프). 발견은 생성하지 않는다. */
async function runServiceScan(
  repo: Repository,
  tenantId: string,
  manifest: string,
): Promise<ServiceSummary> {
  const entries = parseServiceManifestContent(manifest);
  const existing = await repo.listAssets(tenantId);
  const topo = buildTopology(entries, existing, tenantId);
  // persistScan: service 자산 id만 재매핑(엣지 to측은 이미 영속화된 기존 자산 id)
  const { assets, relationships } = await persistScan(repo, tenantId, {
    assets: topo.assets,
    relationships: topo.relationships,
  });
  return {
    serviceCount: assets.length,
    edgeCount: relationships.length,
    unresolved: topo.unresolved,
  };
}

/**
 * 큐에서 클레임한 잡을 종류별로 실행한다. payload는 enqueue 시 검증됐지만
 * jsonb 왕복을 거치므로 워커에서 한 번 더 zod로 파싱한다(방어적).
 */
export async function runScanJob(
  repo: Repository,
  enrich: Enricher,
  job: Job,
  scanWeb: WebScanner = scanUrl,
): Promise<ScanSummary | ServiceSummary> {
  const { tenantId, type, payload } = job;
  switch (type) {
    case "vendor":
      return runVendorScan(repo, tenantId, ScanVendorBody.parse(payload).inventory);
    case "npm":
      return runNpmScan(repo, enrich, tenantId, ScanNpmBody.parse(payload));
    case "iac": {
      const { plan, stackName } = ScanIacBody.parse(payload);
      return runIacScan(repo, tenantId, plan, stackName);
    }
    case "service":
      return runServiceScan(repo, tenantId, ScanServiceBody.parse(payload).manifest);
    case "web":
      return runWebScan(repo, enrich, tenantId, ScanWebBody.parse(payload).url, scanWeb);
  }
}

/** 그래프 영향도 전파 결과(영향도순). GET /v1/impact 용. */
export async function computeImpact(repo: Repository, tenantId: string) {
  const [assets, findings, scores, relationships] = await Promise.all([
    repo.listAssets(tenantId),
    repo.listFindings(tenantId),
    repo.listScores(tenantId),
    repo.listRelationships(tenantId),
  ]);

  const scoreByFinding = new Map(scores.map((s) => [s.findingId, s.score]));
  const own = new Map<string, number>();
  for (const finding of findings) {
    const score = scoreByFinding.get(finding.id);
    if (score === undefined) continue;
    const prev = own.get(finding.assetId) ?? 0;
    if (score > prev) own.set(finding.assetId, score);
  }

  const impacts = propagateRisk(assets, relationships, own);
  const nameById = new Map(assets.map((a) => [a.id, a.name]));
  return [...impacts.values()]
    .map((r) => ({
      assetId: r.assetId,
      asset: nameById.get(r.assetId) ?? r.assetId,
      ownScore: r.ownScore,
      impactScore: r.impactScore,
      inherited: r.inherited,
      rootCause: r.rootCauseAssetId
        ? (nameById.get(r.rootCauseAssetId) ?? r.rootCauseAssetId)
        : null,
    }))
    .sort((a, b) => b.impactScore - a.impactScore);
}
