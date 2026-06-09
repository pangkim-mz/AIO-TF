import { createHash } from "node:crypto";
import { resolveTxt as dnsResolveTxt } from "node:dns/promises";

/** DNS TXT 레코드에 넣을 검증 토큰의 접두사. */
export const VERIFICATION_PREFIX = "omniguard-site-verification=";
/**
 * 토큰 파생용 고정 라벨(비밀이 아님 — 같은 (테넌트, 호스트)에서 같은 토큰을
 * 재생성하기 위한 도메인 분리 목적). 토큰은 테넌트별 ULID로 사실상 추측 불가하다.
 */
const TOKEN_LABEL = "omniguard-ownership-v1";

/**
 * (테넌트, 호스트)에 대해 결정론적 검증 토큰을 파생한다 — 저장 불필요, 언제든 재생성.
 * 호스트는 소문자로 정규화해 대소문자에 무관하게 한다.
 */
export function ownershipToken(tenantId: string, hostname: string): string {
  const digest = createHash("sha256")
    .update(`${TOKEN_LABEL}:${tenantId}:${hostname.toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
  return `${VERIFICATION_PREFIX}${digest}`;
}

/** DNS TXT 조회를 주입 가능하게 한 타입(테스트는 네트워크 없이 stub). */
export type TxtResolver = (hostname: string) => Promise<string[][]>;

export interface OwnershipResult {
  hostname: string;
  /** TXT 레코드에서 기대 토큰을 찾으면 true. */
  verified: boolean;
  /** 사용자가 DNS에 추가해야 하는 토큰. */
  expectedToken: string;
  /** DNS 조회 실패(NXDOMAIN 등) 사유, 성공이면 null. */
  error: string | null;
}

/**
 * 도메인 소유권을 DNS TXT 레코드로 검증한다. 능동 점검의 안전장치 —
 * 소유가 검증된 도메인에만 서브도메인 열거·시크릿 스캔을 허용한다.
 * 네트워크 side-effect(DNS 조회)는 주입으로 격리된다.
 */
export async function verifyOwnership(
  tenantId: string,
  hostname: string,
  options: { resolveTxt?: TxtResolver } = {},
): Promise<OwnershipResult> {
  const resolveTxt = options.resolveTxt ?? dnsResolveTxt;
  const expectedToken = ownershipToken(tenantId, hostname);
  try {
    const records = await resolveTxt(hostname);
    // TXT는 255자 단위로 청크가 쪼개질 수 있어 join으로 합친다.
    const flattened = records.map((chunks) => chunks.join(""));
    const verified = flattened.some((record) => record.trim() === expectedToken);
    return { hostname, verified, expectedToken, error: null };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    return { hostname, verified: false, expectedToken, error: message };
  }
}
