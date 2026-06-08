import { randomBytes } from "node:crypto";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import {
  type JobQueue,
  type JobType,
  type Repository,
  type TokenStore,
  hashToken,
} from "@omniguard/storage";
import { ApiError, sendError, sendOk } from "./envelope";
import { type AuthProvider, type Principal, hasRole } from "./auth";
import {
  ScanIacBody,
  ScanNpmBody,
  ScanServiceBody,
  ScanVendorBody,
  ScanWebBody,
  computeImpact,
} from "./scans";

declare module "fastify" {
  interface FastifyRequest {
    principal?: Principal;
  }
}

export interface ServerDeps {
  repo: Repository;
  auth: AuthProvider;
  queue: JobQueue;
  /** 토큰 발급/폐기용. 없으면 /v1/tokens 라우트를 등록하지 않는다. */
  tokens?: TokenStore;
}

/** 발급할 토큰의 역할/라벨. tenantId는 본문이 아니라 발급자 principal에서 가져온다. */
const IssueTokenBody = z.object({
  role: z.enum(["admin", "analyst", "viewer"]),
  label: z.string().trim().max(200).default(""),
});

/** 강한 opaque 토큰 원문을 생성한다(256bit, base64url). 저장은 해시만. */
function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

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

    // ── 비동기 스캔: 검증 후 큐에 넣고 jobId를 반환(202) ──
    api.post("/v1/scans/vendor", async (request, reply) => {
      await enqueueScan(deps, request, reply, "vendor", ScanVendorBody.parse(request.body));
    });

    api.post("/v1/scans/npm", async (request, reply) => {
      await enqueueScan(deps, request, reply, "npm", ScanNpmBody.parse(request.body));
    });

    api.post("/v1/scans/iac", async (request, reply) => {
      await enqueueScan(deps, request, reply, "iac", ScanIacBody.parse(request.body));
    });

    api.post("/v1/scans/service", async (request, reply) => {
      await enqueueScan(deps, request, reply, "service", ScanServiceBody.parse(request.body));
    });

    api.post("/v1/scans/web", async (request, reply) => {
      await enqueueScan(deps, request, reply, "web", ScanWebBody.parse(request.body));
    });

    // 작업 상태 폴링(테넌트 범위)
    api.get("/v1/jobs/:id", async (request, reply) => {
      const { tenantId } = principalOf(request);
      const { id } = request.params as { id: string };
      const job = await deps.queue.getJob(tenantId, id);
      if (!job) {
        throw new ApiError(404, "not_found", "작업을 찾을 수 없습니다.");
      }
      sendOk(reply, {
        id: job.id,
        type: job.type,
        status: job.status,
        result: job.result,
        error: job.error,
      });
    });

    // ── 토큰 관리(admin 전용). control-plane이므로 발급자 본인 테넌트로만 범위가 한정된다 ──
    const tokens = deps.tokens;
    if (tokens) {
      // 발급: 원문은 이 응답에서 1회만 노출되고, 저장은 sha256 해시만 한다.
      api.post("/v1/tokens", async (request, reply) => {
        const principal = principalOf(request);
        requireAdmin(principal);
        const { role, label } = IssueTokenBody.parse(request.body);
        const rawToken = generateRawToken();
        const tokenHash = hashToken(rawToken);
        await tokens.upsertToken({ tokenHash, tenantId: principal.tenantId, role, label });
        // token(원문)은 다시 조회할 수 없다 — 이 응답에서만 받는다.
        sendOk(reply, { token: rawToken, tokenHash, role, label }, 201);
      });

      // 목록: 발급자 테넌트의 토큰 메타데이터만(원문 없음).
      api.get("/v1/tokens", async (request, reply) => {
        const principal = principalOf(request);
        requireAdmin(principal);
        const stored = await tokens.listByTenant(principal.tenantId);
        sendOk(
          reply,
          stored.map((token) => ({
            tokenHash: token.tokenHash,
            role: token.role,
            label: token.label,
          })),
        );
      });

      // 폐기: 다른 테넌트의 토큰은 보이지 않으므로 폐기할 수 없다(404).
      api.delete("/v1/tokens/:tokenHash", async (request, reply) => {
        const principal = principalOf(request);
        requireAdmin(principal);
        const { tokenHash } = request.params as { tokenHash: string };
        const found = await tokens.findByHash(tokenHash);
        if (!found || found.tenantId !== principal.tenantId) {
          throw new ApiError(404, "not_found", "토큰을 찾을 수 없습니다.");
        }
        await tokens.deleteToken(tokenHash);
        sendOk(reply, { tokenHash, revoked: true });
      });
    }
  });

  return app;
}

function requireWrite(principal: Principal): void {
  if (!hasRole(principal, ["admin", "analyst"])) {
    throw new ApiError(403, "forbidden", "스캔 실행 권한이 없습니다.");
  }
}

function requireAdmin(principal: Principal): void {
  if (!hasRole(principal, ["admin"])) {
    throw new ApiError(403, "forbidden", "토큰 관리 권한이 없습니다.");
  }
}

/** 쓰기 권한 확인 후 검증된 payload를 큐에 넣고 202 + jobId를 응답한다. */
async function enqueueScan(
  deps: ServerDeps,
  request: FastifyRequest,
  reply: FastifyReply,
  type: JobType,
  payload: unknown,
): Promise<void> {
  const principal = principalOf(request);
  requireWrite(principal);
  const job = await deps.queue.enqueue({ tenantId: principal.tenantId, type, payload });
  sendOk(reply, { jobId: job.id, status: job.status }, 202);
}
