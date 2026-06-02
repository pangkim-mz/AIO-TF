import { describe, it, expect, beforeEach } from "vitest";
import { type Finding, newId, now } from "@omniguard/schema";
import { InMemoryJobQueue, InMemoryRepository } from "@omniguard/storage";
import { buildServer } from "../src/server";
import { ScanWorker } from "../src/worker";
import type { Enricher } from "../src/scans";
import { InMemoryAuthProvider, type Principal } from "../src/auth";

const ADMIN_TENANT = newId();
const VIEWER_TENANT = newId();

const tokens: Record<string, Principal> = {
  "admin-token": { tenantId: ADMIN_TENANT, role: "admin" },
  "viewer-token": { tenantId: VIEWER_TENANT, role: "viewer" },
};

const VENDOR_YAML = `
vendors:
  - name: Acme
    domain: acme.com
    requiredCertifications: [SOC2]
    certifications: []
`;

const PKG_JSON = JSON.stringify({
  name: "app",
  version: "1.0.0",
  dependencies: { lodash: "^4.17.20" },
});

// 네트워크 없이 lodash 자산에 대해 취약점 1건을 만드는 스텁 보강기
const stubEnrich: Enricher = async (assets, tenantId) => {
  const dep = assets.find((a) => a.name === "lodash");
  if (!dep) return [];
  const ts = now();
  const finding: Finding = {
    id: newId(),
    tenantId,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["enrich-osv"],
    assetId: dep.id,
    category: "vulnerability",
    sourceFindingId: "GHSA-test",
    title: "stub",
    description: "",
    severity: "CRITICAL",
    cvss: null,
    status: "open",
    detectedAt: ts,
    resolvedAt: null,
    raw: {},
  };
  return [finding];
};

function makeSetup(enrich?: Enricher) {
  const repo = new InMemoryRepository();
  const queue = new InMemoryJobQueue();
  const worker = new ScanWorker({ queue, repo, enrich: enrich ?? (async () => []) });
  const app = buildServer({
    repo,
    queue,
    auth: new InMemoryAuthProvider(tokens),
  });
  return { repo, queue, worker, app };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

type App = ReturnType<typeof buildServer>;

/** 스캔을 큐에 넣고(202+jobId) 워커로 비우고, 완료된 작업의 결과를 돌려준다. */
async function runScan(
  app: App,
  worker: ScanWorker,
  path: string,
  payload: unknown,
  token = "admin-token",
) {
  const enqueue = await app.inject({ method: "POST", url: path, headers: auth(token), payload });
  expect(enqueue.statusCode).toBe(202);
  const { jobId, status } = enqueue.json().data;
  expect(status).toBe("queued");

  while (await worker.processNext()) {
    /* 큐를 비운다 */
  }

  const job = await app.inject({ method: "GET", url: `/v1/jobs/${jobId}`, headers: auth(token) });
  return { jobId, job: job.json().data };
}

describe("OmniGuard API (비동기 스캔)", () => {
  let app: App;
  let worker: ScanWorker;
  beforeEach(() => {
    ({ app, worker } = makeSetup());
  });

  it("GET /health 는 인증 없이 200", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, data: { status: "ok" } });
  });

  it("토큰 없으면 401, 일관 에러 포맷", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/assets" });
    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("unauthenticated");
  });

  it("잘못된 토큰은 401", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/assets", headers: auth("nope") });
    expect(res.statusCode).toBe(401);
  });

  it("viewer는 스캔(쓰기) 403 — 큐에 넣지 않는다", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scans/vendor",
      headers: auth("viewer-token"),
      payload: { inventory: VENDOR_YAML },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("forbidden");
  });

  it("잘못된 본문은 400 validation_error — 큐에 넣기 전에 검증", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scans/vendor",
      headers: auth("admin-token"),
      payload: { wrong: "field" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("admin 스캔 → 작업 성공, 데이터가 해당 테넌트에 저장·조회된다", async () => {
    const { job } = await runScan(app, worker, "/v1/scans/vendor", { inventory: VENDOR_YAML });
    expect(job.status).toBe("succeeded");
    expect(job.result.assetCount).toBe(1);
    expect(job.result.findingCount).toBe(1); // SOC2 누락

    const findings = await app.inject({
      method: "GET",
      url: "/v1/findings",
      headers: auth("admin-token"),
    });
    expect(findings.json().data).toHaveLength(1);
  });

  it("테넌트 격리: viewer는 admin이 만든 데이터를 못 본다", async () => {
    await runScan(app, worker, "/v1/scans/vendor", { inventory: VENDOR_YAML });
    const res = await app.inject({
      method: "GET",
      url: "/v1/assets",
      headers: auth("viewer-token"),
    });
    expect(res.json().data).toHaveLength(0);
  });

  it("작업 조회는 테넌트 범위 — 다른 테넌트 작업은 404", async () => {
    const { jobId } = await runScan(app, worker, "/v1/scans/vendor", { inventory: VENDOR_YAML });
    // admin이 만든 작업을 viewer(다른 테넌트)가 조회하면 못 본다.
    const res = await app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}`,
      headers: auth("viewer-token"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });

  it("npm 스캔 → 루트 앱 + 의존성 + depends_on 엣지, 영향도 전파", async () => {
    ({ app, worker } = makeSetup(stubEnrich));

    const { job } = await runScan(app, worker, "/v1/scans/npm", { packageJson: PKG_JSON });
    expect(job.status).toBe("succeeded");
    expect(job.result.assetCount).toBe(2); // 루트 앱 + lodash
    expect(job.result.relationshipCount).toBe(1);
    expect(job.result.findingCount).toBe(1);
    expect(job.result.topScore).toBeGreaterThan(0);

    const rels = await app.inject({
      method: "GET",
      url: "/v1/relationships",
      headers: auth("admin-token"),
    });
    expect(rels.json().data).toHaveLength(1);

    // 앱 자신은 취약점이 없지만 lodash로부터 영향도를 상속받는다
    const impact = await app.inject({
      method: "GET",
      url: "/v1/impact",
      headers: auth("admin-token"),
    });
    const appRow = impact.json().data.find((r: { asset: string }) => r.asset === "app");
    expect(appRow.inherited).toBe(true);
    expect(appRow.rootCause).toBe("lodash");
  });

  it("iac 스캔 → 스택 + 리소스 + contains 엣지, 미설정 발견", async () => {
    const plan = JSON.stringify({
      planned_values: {
        root_module: {
          resources: [
            {
              address: "aws_s3_bucket.x",
              type: "aws_s3_bucket",
              name: "x",
              values: { acl: "public-read" },
            },
          ],
        },
      },
    });
    const { job } = await runScan(app, worker, "/v1/scans/iac", { plan, stackName: "prod" });
    expect(job.status).toBe("succeeded");
    expect(job.result.assetCount).toBe(2); // 스택 + 버킷
    expect(job.result.relationshipCount).toBe(1);
    expect(job.result.findingCount).toBe(1);

    const findings = await app.inject({
      method: "GET",
      url: "/v1/findings",
      headers: auth("admin-token"),
    });
    expect(findings.json().data[0].category).toBe("misconfiguration");
  });

  it("서비스 토폴로지: SW/IaC/벤더 리스크를 서비스 단위로 통합한다", async () => {
    ({ app, worker } = makeSetup(stubEnrich));
    const h = "admin-token";

    // 1) npm: lodash에 CRITICAL (스텁) → 점수 82
    await runScan(app, worker, "/v1/scans/npm", { packageJson: PKG_JSON }, h);
    // 2) iac: 공개 S3 (HIGH)
    const plan = JSON.stringify({
      planned_values: { root_module: { resources: [
        { address: "aws_s3_bucket.x", type: "aws_s3_bucket", name: "x", values: { acl: "public-read" } },
      ] } },
    });
    await runScan(app, worker, "/v1/scans/iac", { plan }, h);
    // 3) vendor: Acme SOC2 누락 (HIGH)
    await runScan(app, worker, "/v1/scans/vendor", { inventory: VENDOR_YAML }, h);

    // 4) service: 세 도메인 자산에 연결 (앞 작업들이 모두 영속화된 뒤 실행됨)
    const manifest = [
      "services:",
      "  - name: Checkout API",
      "    key: checkout-api",
      "    dependsOn: [lodash]",
      "    hostedOn: [aws_s3_bucket.x]",
      "    providedBy: [acme.com]",
    ].join("\n");
    const { job } = await runScan(app, worker, "/v1/scans/service", { manifest }, h);
    expect(job.status).toBe("succeeded");
    expect(job.result).toMatchObject({ serviceCount: 1, edgeCount: 3, unresolved: [] });

    // 5) 영향도: 서비스가 최악 도메인(lodash, 82)을 통합 상속
    const impact = await app.inject({ method: "GET", url: "/v1/impact", headers: auth(h) });
    const row = impact.json().data.find((r: { asset: string }) => r.asset === "Checkout API");
    expect(row.inherited).toBe(true);
    expect(row.impactScore).toBe(82);
    expect(row.rootCause).toBe("lodash");
  });

  it("스캔 처리 중 오류는 작업을 failed로 만든다", async () => {
    const boom: Enricher = async () => {
      throw new Error("OSV 폭발");
    };
    ({ app, worker } = makeSetup(boom));
    const { job } = await runScan(app, worker, "/v1/scans/npm", { packageJson: PKG_JSON });
    expect(job.status).toBe("failed");
    expect(job.error).toBe("OSV 폭발");
    expect(job.result).toBeNull();
  });

  it("npm 스캔 본문 누락은 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scans/npm",
      headers: auth("admin-token"),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("알 수 없는 경로는 404", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/nope",
      headers: auth("admin-token"),
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("not_found");
  });
});
