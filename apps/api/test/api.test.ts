import { describe, it, expect, beforeEach } from "vitest";
import { newId } from "@omniguard/schema";
import { InMemoryRepository } from "@omniguard/storage";
import { buildServer } from "../src/server";
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

function makeApp() {
  return buildServer({
    repo: new InMemoryRepository(),
    auth: new InMemoryAuthProvider(tokens),
  });
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("OmniGuard API", () => {
  let app: ReturnType<typeof buildServer>;
  beforeEach(() => {
    app = makeApp();
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
    const res = await app.inject({
      method: "GET",
      url: "/v1/assets",
      headers: auth("nope"),
    });
    expect(res.statusCode).toBe(401);
  });

  it("viewer는 스캔(쓰기) 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scans/vendor",
      headers: auth("viewer-token"),
      payload: { inventory: VENDOR_YAML },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("forbidden");
  });

  it("잘못된 본문은 400 validation_error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/scans/vendor",
      headers: auth("admin-token"),
      payload: { wrong: "field" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("admin 스캔 → 데이터가 해당 테넌트에 저장되고 조회된다", async () => {
    const scan = await app.inject({
      method: "POST",
      url: "/v1/scans/vendor",
      headers: auth("admin-token"),
      payload: { inventory: VENDOR_YAML },
    });
    expect(scan.statusCode).toBe(201);
    const summary = scan.json().data;
    expect(summary.assetCount).toBe(1);
    expect(summary.findingCount).toBe(1); // SOC2 누락

    const findings = await app.inject({
      method: "GET",
      url: "/v1/findings",
      headers: auth("admin-token"),
    });
    expect(findings.json().data).toHaveLength(1);
  });

  it("테넌트 격리: viewer는 admin이 만든 데이터를 못 본다", async () => {
    await app.inject({
      method: "POST",
      url: "/v1/scans/vendor",
      headers: auth("admin-token"),
      payload: { inventory: VENDOR_YAML },
    });
    const res = await app.inject({
      method: "GET",
      url: "/v1/assets",
      headers: auth("viewer-token"),
    });
    expect(res.json().data).toHaveLength(0);
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
