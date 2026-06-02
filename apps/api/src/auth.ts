export type Role = "admin" | "analyst" | "viewer";

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

/** 역할이 허용 목록에 포함되는지 검사. */
export function hasRole(principal: Principal, allowed: readonly Role[]): boolean {
  return allowed.includes(principal.role);
}
