import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { z } from "zod";
import { type Asset, type RiskScore } from "@omniguard/schema";
import { scoreFinding } from "@omniguard/scoring";
import { propagateRisk } from "@omniguard/graph";
import {
  evaluateVendors,
  scanVendorInventoryContent,
} from "@omniguard/connector-vendor";
import type { Repository } from "@omniguard/storage";
import { ApiError, sendError, sendOk } from "./envelope";
import { type AuthProvider, type Principal, hasRole } from "./auth";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export interface ServerDeps {
  repo: Repository;
  auth: AuthProvider;
}

const ScanVendorBody = z.object({
  inventory: z.string().min(1), // YAML 또는 JSON 인벤토리 텍스트
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
      if (!hasRole(principal, ["admin", "analyst"])) {
        throw new ApiError(403, "forbidden", "스캔 실행 권한이 없습니다.");
      }
      const { inventory } = ScanVendorBody.parse(request.body);
      const summary = await runVendorScan(deps.repo, principal.tenantId, inventory);
      sendOk(reply, summary, 201);
    });
  });

  return app;
}

interface ScanSummary {
  assetCount: number;
  findingCount: number;
  topScore: number;
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

  const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));
  const scores: RiskScore[] = [];
  for (const finding of findings) {
    const asset = assetById.get(finding.assetId);
    if (asset) scores.push(scoreFinding(finding, asset));
  }
  await repo.upsertScores(tenantId, scores);

  const topScore = scores.reduce((max, s) => Math.max(max, s.score), 0);
  return { assetCount: assets.length, findingCount: findings.length, topScore };
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
