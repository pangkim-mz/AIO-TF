import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { type Asset, type Finding, type RiskScore } from "@omniguard/schema";
import { scoreFinding } from "@omniguard/scoring";
import { propagateRisk } from "@omniguard/graph";
import {
  evaluateVendors,
  scanVendorInventoryContent,
} from "@omniguard/connector-vendor";
import { scanPackageContent } from "@omniguard/connector-npm";
import { enrichWithOsv } from "@omniguard/enrich-osv";
import type { Repository } from "@omniguard/storage";
import { ApiError, sendError, sendOk } from "./envelope";
import { type AuthProvider, type Principal, hasRole } from "./auth";

/** 자산 → 취약점 보강 함수. 기본은 OSV 호출, 테스트에서는 주입으로 대체. */
export type Enricher = (
  assets: readonly Asset[],
  tenantId: string,
) => Promise<Finding[]>;

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export interface ServerDeps {
  repo: Repository;
  auth: AuthProvider;
  /** 취약점 보강기. 미지정 시 OSV.dev 호출. */
  enrich?: Enricher;
}

const ScanVendorBody = z.object({
  inventory: z.string().min(1), // YAML 또는 JSON 인벤토리 텍스트
});

const ScanNpmBody = z.object({
  packageJson: z.string().min(1),
  lockfile: z.string().optional(),
  lockfileType: z.enum(["npm", "pnpm"]).optional(),
});

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

/** 인증된 주체를 반환하거나 ApiError를 던진다. */
function principalOf(request: FastifyRequest): Principal {
  if (!request.principal) {
    throw new ApiError(401, "unauthenticated", "인증이 필요합니다.");
  }
  return request.principal;
}

export function buildServer(deps: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const enrich: Enricher = deps.enrich ?? ((assets, tenantId) =>
    enrichWithOsv(assets, tenantId));

  // 일관 에러 포맷 (사용자 메시지 / 디버깅 코드 분리, 내부 오류 비노출)
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      sendError(reply, error.status, error.code, error.message);
      return;
    }
    if (error instanceof z.ZodError) {
      sendError(reply, 400, "validation_error", "요청 형식이 올바르지 않습니다.");
      return;
    }
    request.log.error(error);
    sendError(reply, 500, "internal_error", "내부 오류가 발생했습니다.");
  });

  app.setNotFoundHandler((_request, reply) => {
    sendError(reply, 404, "not_found", "리소스를 찾을 수 없습니다.");
  });

  // 공개 엔드포인트
  app.get("/health", async (_request, reply) => {
    sendOk(reply, { status: "ok" });
  });

  // 인증이 필요한 /v1 스코프
  app.register(async (api) => {
    api.addHook("preHandler", async (request) => {
      const token = bearerToken(request);
      if (!token) {
        throw new ApiError(401, "unauthenticated", "인증 토큰이 없습니다.");
      }
      const principal = await deps.auth.authenticate(token);
      if (!principal) {
        throw new ApiError(401, "unauthenticated", "유효하지 않은 토큰입니다.");
      }
      request.principal = principal;
    });

    api.get("/v1/assets", async (request, reply) => {
      const { tenantId } = principalOf(request);
      sendOk(reply, await deps.repo.listAssets(tenantId));
    });

    api.get("/v1/findings", async (request, reply) => {
      const { tenantId } = principalOf(request);
      sendOk(reply, await deps.repo.listFindings(tenantId));
    });

    api.get("/v1/scores", async (request, reply) => {
      const { tenantId } = principalOf(request);
      sendOk(reply, await deps.repo.listScores(tenantId));
    });

    api.get("/v1/relationships", async (request, reply) => {
      const { tenantId } = principalOf(request);
      sendOk(reply, await deps.repo.listRelationships(tenantId));
    });

    api.get("/v1/impact", async (request, reply) => {
      const { tenantId } = principalOf(request);
      sendOk(reply, await computeImpact(deps.repo, tenantId));
    });

    api.post("/v1/scans/vendor", async (request, reply) => {
      const principal = principalOf(request);
      requireWrite(principal);
      const { inventory } = ScanVendorBody.parse(request.body);
      const summary = await runVendorScan(deps.repo, principal.tenantId, inventory);
      sendOk(reply, summary, 201);
    });

    api.post("/v1/scans/npm", async (request, reply) => {
      const principal = principalOf(request);
      requireWrite(principal);
      const input = ScanNpmBody.parse(request.body);
      const summary = await runNpmScan(deps.repo, enrich, principal.tenantId, input);
      sendOk(reply, summary, 201);
    });
  });

  return app;
}

function requireWrite(principal: Principal): void {
  if (!hasRole(principal, ["admin", "analyst"])) {
    throw new ApiError(403, "forbidden", "스캔 실행 권한이 없습니다.");
  }
}

interface ScanSummary {
  assetCount: number;
  relationshipCount: number;
  findingCount: number;
  topScore: number;
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
  const scanned = scanPackageContent(input, tenantId);
  const assets = await repo.upsertAssets(tenantId, scanned.assets);

  // 엣지 끝점을 영속화된 멱등 id로 재매핑
  const idMap = new Map(scanned.assets.map((a, i) => [a.id, assets[i]!.id]));
  const remapped = scanned.relationships.map((r) => ({
    ...r,
    fromAssetId: idMap.get(r.fromAssetId) ?? r.fromAssetId,
    toAssetId: idMap.get(r.toAssetId) ?? r.toAssetId,
  }));
  const relationships = await repo.upsertRelationships(tenantId, remapped);

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

async function computeImpact(repo: Repository, tenantId: string) {
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
