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

/** 역할이 허용 목록에 포함되는지 검사. */
export function hasRole(principal: Principal, allowed: readonly Role[]): boolean {
  return allowed.includes(principal.role);
}
