import { createHash } from "node:crypto";

/**
 * 인증 토큰 레코드. 토큰 원문은 절대 저장하지 않고 sha256 해시만 보관한다.
 * 역할은 storage 계층에서는 문자열로 다루고, 소비자(API)가 좁혀 검증한다.
 */
export interface StoredToken {
  /** 토큰 원문의 sha256 hex 해시 (자연키). */
  tokenHash: string;
  tenantId: string;
  role: string;
  /** 사람이 식별하기 위한 라벨(예: "ci-bot"). 감사/폐기용. */
  label: string;
}

/**
 * 인증 토큰 영속화 포트. 테넌트 컨텍스트보다 먼저 조회되는 control-plane 저장소라
 * 테넌트로 범위가 제한되지 않는다(RLS 비대상).
 */
export interface TokenStore {
  /** 해시로 토큰을 조회한다. 없으면 null. */
  findByHash(tokenHash: string): Promise<StoredToken | null>;
  /** 토큰을 삽입하거나 갱신한다(해시 기준 멱등). */
  upsertToken(token: StoredToken): Promise<void>;
  /** 토큰을 폐기한다. 실제로 삭제됐으면 true. */
  deleteToken(tokenHash: string): Promise<boolean>;
  close(): Promise<void>;
}

/** 토큰 원문 → 저장/조회에 쓰는 sha256 hex 해시. */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** 인메모리 토큰 저장소 (테스트/무DB 로컬용). */
export class InMemoryTokenStore implements TokenStore {
  private readonly byHash = new Map<string, StoredToken>();

  async findByHash(tokenHash: string): Promise<StoredToken | null> {
    return this.byHash.get(tokenHash) ?? null;
  }

  async upsertToken(token: StoredToken): Promise<void> {
    this.byHash.set(token.tokenHash, { ...token });
  }

  async deleteToken(tokenHash: string): Promise<boolean> {
    return this.byHash.delete(tokenHash);
  }

  async close(): Promise<void> {
    // no-op
  }
}
