import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { z } from "zod";
import type { JobQueue, JobType, Repository } from "@omniguard/storage";
import { ApiError, sendError, sendOk } from "./envelope";
import { type AuthProvider, type Principal, hasRole } from "./auth";
import {
  ScanIacBody,
  ScanNpmBody,
  ScanServiceBody,
  ScanVendorBody,
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
  });

  return app;
}

function requireWrite(principal: Principal): void {
  if (!hasRole(principal, ["admin", "analyst"])) {
    throw new ApiError(403, "forbidden", "스캔 실행 권한이 없습니다.");
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
