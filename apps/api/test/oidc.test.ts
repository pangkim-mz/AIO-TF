import { describe, it, expect, beforeAll } from "vitest";
import { SignJWT, generateKeyPair } from "jose";
import type { CryptoKey } from "jose";
import { newId } from "@omniguard/schema";
import { InMemoryTokenStore, hashToken } from "@omniguard/storage";
import {
  CompositeAuthProvider,
  DbAuthProvider,
  OidcAuthProvider,
  type OidcConfig,
} from "../src/auth";

const CONFIG: OidcConfig = {
  issuer: "https://idp.test/realms/omniguard",
  audience: "omniguard-api",
  jwksUri: "https://idp.test/jwks", // 테스트에선 공개키 주입이라 미사용
  tenantClaim: "tenant_id",
  roleClaim: "role",
};

let publicKey: CryptoKey;
let privateKey: CryptoKey;

beforeAll(async () => {
  ({ publicKey, privateKey } = await generateKeyPair("RS256"));
});

interface Claims {
  issuer?: string;
  audience?: string;
  tenant?: string;
  role?: string;
  expired?: boolean;
}

async function signToken(claims: Claims): Promise<string> {
  const payload: Record<string, unknown> = {};
  if (claims.tenant !== undefined) payload.tenant_id = claims.tenant;
  if (claims.role !== undefined) payload.role = claims.role;
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(claims.issuer ?? CONFIG.issuer)
    .setAudience(claims.audience ?? CONFIG.audience)
    .setExpirationTime(claims.expired ? "-1h" : "1h")
    .sign(privateKey);
}

function provider(): OidcAuthProvider {
  return new OidcAuthProvider(CONFIG, publicKey);
}

describe("OidcAuthProvider", () => {
  it("유효한 JWT → claim에서 테넌트/역할 해석", async () => {
    const tenant = newId();
    const token = await signToken({ tenant, role: "admin" });
    expect(await provider().authenticate(token)).toEqual({
      tenantId: tenant,
      role: "admin",
    });
  });

  it("만료된 토큰 → null", async () => {
    const token = await signToken({ tenant: newId(), role: "admin", expired: true });
    expect(await provider().authenticate(token)).toBeNull();
  });

  it("audience 불일치 → null", async () => {
    const token = await signToken({ tenant: newId(), role: "admin", audience: "other-api" });
    expect(await provider().authenticate(token)).toBeNull();
  });

  it("issuer 불일치 → null", async () => {
    const token = await signToken({ tenant: newId(), role: "admin", issuer: "https://evil.test" });
    expect(await provider().authenticate(token)).toBeNull();
  });

  it("알 수 없는 역할 claim → null", async () => {
    const token = await signToken({ tenant: newId(), role: "superadmin" });
    expect(await provider().authenticate(token)).toBeNull();
  });

  it("필수 claim 누락(tenant 없음) → null", async () => {
    const token = await signToken({ role: "admin" });
    expect(await provider().authenticate(token)).toBeNull();
  });

  it("JWT가 아닌 불투명 문자열 → null(예외 삼키고)", async () => {
    expect(await provider().authenticate("not-a-jwt")).toBeNull();
  });
});

describe("CompositeAuthProvider (하이브리드)", () => {
  it("OIDC 먼저 시도, 실패하면 DB 토큰으로 폴백", async () => {
    const store = new InMemoryTokenStore();
    const opaqueTenant = newId();
    await store.upsertToken({
      tokenHash: hashToken("ci-token"),
      tenantId: opaqueTenant,
      role: "analyst",
      label: "ci",
    });
    const composite = new CompositeAuthProvider([
      provider(),
      new DbAuthProvider(store),
    ]);

    // 1) JWT는 OIDC가 처리
    const jwtTenant = newId();
    const jwt = await signToken({ tenant: jwtTenant, role: "admin" });
    expect(await composite.authenticate(jwt)).toEqual({
      tenantId: jwtTenant,
      role: "admin",
    });

    // 2) 불투명 토큰은 OIDC가 null → DB 토큰이 처리
    expect(await composite.authenticate("ci-token")).toEqual({
      tenantId: opaqueTenant,
      role: "analyst",
    });

    // 3) 둘 다 모르면 null
    expect(await composite.authenticate("unknown")).toBeNull();
  });
});
