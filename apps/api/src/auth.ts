import { createRemoteJWKSet, jwtVerify } from "jose";
import { type TokenStore, hashToken } from "@omniguard/storage";

export type Role = "admin" | "analyst" | "viewer";

const ROLES: readonly Role[] = ["admin", "analyst", "viewer"];

/** 문자열이 알려진 역할인지 좁힌다(DB에서 온 값을 안전하게 검증). */
export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export interface Principal {
  tenantId: string;
  role: Role;
}

/** 토큰 → 주체(테넌트 + 역할) 해석. 실제 구현은 DB/IdP로 교체 가능. */
export interface AuthProvider {
  authenticate(token: string): Promise<Principal | null>;
}

/** 토큰 맵 기반 인메모리 인증 (개발/테스트용). */
export class InMemoryAuthProvider implements AuthProvider {
  private readonly tokens: Map<string, Principal>;

  constructor(tokens: Record<string, Principal>) {
    this.tokens = new Map(Object.entries(tokens));
  }

  async authenticate(token: string): Promise<Principal | null> {
    return this.tokens.get(token) ?? null;
  }
}

/** TokenStore(영속 토큰) 기반 인증. 토큰 원문을 해시해 조회한다. */
export class DbAuthProvider implements AuthProvider {
  constructor(private readonly store: TokenStore) {}

  async authenticate(token: string): Promise<Principal | null> {
    const found = await this.store.findByHash(hashToken(token));
    if (!found) return null;
    // DB에 알 수 없는 역할이 들어있으면 인증을 거부한다(권한 상승 방지).
    if (!isRole(found.role)) return null;
    return { tenantId: found.tenantId, role: found.role };
  }
}

/** OIDC 리소스 서버 검증 설정. IdP 무관(claim 이름은 env로 매핑). */
export interface OidcConfig {
  /** 토큰의 iss와 일치해야 함(예: https://idp.example.com/realms/omniguard). */
  issuer: string;
  /** 토큰의 aud와 일치해야 함(이 API의 client_id 등). */
  audience: string;
  /** IdP의 JWKS 엔드포인트 URL. */
  jwksUri: string;
  /** tenantId를 담은 claim 이름. */
  tenantClaim: string;
  /** role을 담은 claim 이름. */
  roleClaim: string;
}

/** jwtVerify가 받는 키 입력(원격 JWKS 또는 테스트용 공개키). */
type VerifyKey = Parameters<typeof jwtVerify>[1];

/**
 * OIDC IdP가 발급한 JWT(access token)를 서명 검증해 주체를 해석한다.
 * 토큰을 발급/저장하지 않는 리소스 서버 방식 — IdP가 발급, 우리는 검증만.
 */
export class OidcAuthProvider implements AuthProvider {
  private readonly key: VerifyKey;

  /** key 미지정 시 jwksUri에서 원격 JWKS를 만든다(캐싱·회전 처리). 테스트는 공개키 주입. */
  constructor(
    private readonly config: OidcConfig,
    key?: VerifyKey,
  ) {
    this.key = key ?? createRemoteJWKSet(new URL(config.jwksUri));
  }

  async authenticate(token: string): Promise<Principal | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: this.config.issuer,
        audience: this.config.audience,
      });
      const tenantId = payload[this.config.tenantClaim];
      const role = payload[this.config.roleClaim];
      if (typeof tenantId !== "string" || typeof role !== "string") return null;
      if (!isRole(role)) return null;
      return { tenantId, role };
    } catch {
      // 서명 불일치 / 만료 / iss·aud 불일치 / JWT 형식 아님 → 인증 실패
      return null;
    }
  }
}

/**
 * 여러 AuthProvider를 순서대로 시도한다(하이브리드 인증).
 * 예: [OIDC(사람), DB 토큰(M2M/CI)]. 먼저 성공하는 주체를 채택한다.
 */
export class CompositeAuthProvider implements AuthProvider {
  private readonly providers: readonly AuthProvider[];

  constructor(providers: readonly AuthProvider[]) {
    this.providers = providers;
  }

  async authenticate(token: string): Promise<Principal | null> {
    for (const provider of this.providers) {
      const principal = await provider.authenticate(token);
      if (principal) return principal;
    }
    return null;
  }
}

/** 역할이 허용 목록에 포함되는지 검사. */
export function hasRole(principal: Principal, allowed: readonly Role[]): boolean {
  return allowed.includes(principal.role);
}
