import { describe, it, expect, beforeEach } from "vitest";
import { newId } from "@omniguard/schema";
import {
  InMemoryJobQueue,
  InMemoryRepository,
  InMemoryTokenStore,
  hashToken,
} from "@omniguard/storage";
import { buildServer } from "../src/server";
import { DbAuthProvider } from "../src/auth";

const TENANT_A = newId();
const TENANT_B = newId();

/** 운영과 동일 배선(DbAuthProvider + TokenStore)으로, 발급 토큰의 인증까지 검증한다. */
function makeSetup() {
  const store = new InMemoryTokenStore();
  // 시드 토큰: A 테넌트 admin/viewer, B 테넌트 admin
  const seed = [
    { raw: "admin-a", tenantId: TENANT_A, role: "admin" },
    { raw: "viewer-a", tenantId: TENANT_A, role: "viewer" },
    { raw: "admin-b", tenantId: TENANT_B, role: "admin" },
  ];
  for (const { raw, tenantId, role } of seed) {
    store.upsertToken({ tokenHash: hashToken(raw), tenantId, role, label: raw });
  }
  const app = buildServer({
    repo: new InMemoryRepository(),
    queue: new InMemoryJobQueue(),
    auth: new DbAuthProvider(store),
    tokens: store,
  });
  return { store, app };
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("토큰 관리 API (/v1/tokens)", () => {
  let app: ReturnType<typeof buildServer>;
  beforeEach(() => {
    ({ app } = makeSetup());
  });

  it("admin이 토큰을 발급하면 201 + 원문 1회 노출, 목록에 나타난다", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: auth("admin-a"),
      payload: { role: "analyst", label: "ci-bot" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.data.token).toBe("string");
    expect(body.data.token.length).toBeGreaterThan(20);
    expect(body.data.tokenHash).toBe(hashToken(body.data.token));
    expect(body.data.role).toBe("analyst");

    const list = await app.inject({ method: "GET", url: "/v1/tokens", headers: auth("admin-a") });
    const labels = list.json().data.map((t: { label: string }) => t.label);
    expect(labels).toContain("ci-bot");
    // 목록에는 원문(token)이 절대 포함되지 않는다.
    expect(list.json().data.every((t: Record<string, unknown>) => !("token" in t))).toBe(true);
  });

  it("발급된 토큰으로 즉시 인증되어 보호 자원에 접근한다(end-to-end)", async () => {
    const issued = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: auth("admin-a"),
      payload: { role: "viewer", label: "readonly" },
    });
    const { token } = issued.json().data;

    const res = await app.inject({ method: "GET", url: "/v1/assets", headers: auth(token) });
    expect(res.statusCode).toBe(200);
  });

  it("viewer는 토큰 발급 403", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: auth("viewer-a"),
      payload: { role: "viewer", label: "x" },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("forbidden");
  });

  it("잘못된 role은 400 validation_error", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: auth("admin-a"),
      payload: { role: "superuser" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation_error");
  });

  it("폐기하면 그 토큰으로 더는 인증되지 않고 목록에서 사라진다", async () => {
    const issued = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: auth("admin-a"),
      payload: { role: "viewer", label: "temp" },
    });
    const { token, tokenHash } = issued.json().data;
    expect((await app.inject({ method: "GET", url: "/v1/assets", headers: auth(token) })).statusCode).toBe(200);

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/tokens/${tokenHash}`,
      headers: auth("admin-a"),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.revoked).toBe(true);

    // 폐기 후: 인증 불가 + 목록에 없음
    expect((await app.inject({ method: "GET", url: "/v1/assets", headers: auth(token) })).statusCode).toBe(401);
    const list = await app.inject({ method: "GET", url: "/v1/tokens", headers: auth("admin-a") });
    expect(list.json().data.map((t: { tokenHash: string }) => t.tokenHash)).not.toContain(tokenHash);
  });

  it("테넌트 격리: 다른 테넌트가 만든 토큰은 폐기할 수 없다(404)", async () => {
    const issued = await app.inject({
      method: "POST",
      url: "/v1/tokens",
      headers: auth("admin-a"),
      payload: { role: "viewer", label: "owned-by-a" },
    });
    const { tokenHash } = issued.json().data;

    // B 테넌트 admin이 A의 토큰 폐기 시도 → 보이지 않으므로 404
    const del = await app.inject({
      method: "DELETE",
      url: `/v1/tokens/${tokenHash}`,
      headers: auth("admin-b"),
    });
    expect(del.statusCode).toBe(404);
    expect(del.json().error.code).toBe("not_found");

    // A의 토큰은 그대로 살아있다(A 목록에서 확인)
    const list = await app.inject({ method: "GET", url: "/v1/tokens", headers: auth("admin-a") });
    expect(list.json().data.map((t: { tokenHash: string }) => t.tokenHash)).toContain(tokenHash);
  });

  it("목록은 발급자 테넌트의 토큰만 보여준다", async () => {
    const listA = await app.inject({ method: "GET", url: "/v1/tokens", headers: auth("admin-a") });
    // A: 시드 admin-a, viewer-a 2개
    expect(listA.json().data).toHaveLength(2);
    const listB = await app.inject({ method: "GET", url: "/v1/tokens", headers: auth("admin-b") });
    expect(listB.json().data).toHaveLength(1);
  });
});
