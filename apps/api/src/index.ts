import { newId } from "@omniguard/schema";
import {
  InMemoryJobQueue,
  InMemoryRepository,
  InMemoryTokenStore,
  PostgresJobQueue,
  PostgresRepository,
  PostgresTokenStore,
  hashToken,
  type JobQueue,
  type Repository,
  type TokenStore,
} from "@omniguard/storage";
import { enrichWithOsv } from "@omniguard/enrich-osv";
import { buildServer } from "./server";
import { ScanWorker } from "./worker";
import {
  CompositeAuthProvider,
  DbAuthProvider,
  OidcAuthProvider,
  type AuthProvider,
  type OidcConfig,
  type Principal,
} from "./auth";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

/**
 * 토큰 설정을 로드한다.
 * OMNIGUARD_TOKENS(JSON: { "<token>": { "tenantId": "...", "role": "..." } })가 있으면 사용,
 * 없으면 개발용 토큰 하나를 발급한다.
 */
function loadTokens(): Record<string, Principal> {
  const raw = process.env.OMNIGUARD_TOKENS;
  if (raw) return JSON.parse(raw) as Record<string, Principal>;

  const devTenant = newId();
  const devToken = "dev-token";
  console.warn(
    `[경고] OMNIGUARD_TOKENS 미설정 → 개발용 토큰 사용: "${devToken}" (tenant=${devTenant}, role=admin)`,
  );
  return { [devToken]: { tenantId: devTenant, role: "admin" } };
}

/** loadTokens()의 토큰 맵을 해시로 변환해 TokenStore에 멱등 시딩한다. */
async function seedTokens(store: TokenStore): Promise<void> {
  for (const [token, principal] of Object.entries(loadTokens())) {
    await store.upsertToken({
      tokenHash: hashToken(token),
      tenantId: principal.tenantId,
      role: principal.role,
      label: "",
    });
  }
}

/**
 * OIDC 설정을 로드한다(선택). OMNIGUARD_OIDC(JSON)가 있으면 OIDC 검증을 활성화한다.
 * 필수: issuer, audience, jwksUri. 선택: tenantClaim/roleClaim(claim 이름 매핑).
 */
function loadOidc(): OidcConfig | null {
  const raw = process.env.OMNIGUARD_OIDC;
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<OidcConfig>;
  if (!parsed.issuer || !parsed.audience || !parsed.jwksUri) {
    throw new Error(
      "OMNIGUARD_OIDC에는 issuer, audience, jwksUri가 모두 필요합니다.",
    );
  }
  return {
    issuer: parsed.issuer,
    audience: parsed.audience,
    jwksUri: parsed.jwksUri,
    tenantClaim: parsed.tenantClaim ?? "tenant_id",
    roleClaim: parsed.roleClaim ?? "role",
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  let repo: Repository;
  let queue: JobQueue;
  let tokenStore: TokenStore;

  if (url) {
    // 운영 경로: Postgres에 영속화하고 토큰·작업 큐도 DB에서 다룬다.
    const pgRepo = new PostgresRepository({ connectionString: url });
    await pgRepo.migrate();
    repo = pgRepo;
    queue = new PostgresJobQueue({ connectionString: url });
    tokenStore = new PostgresTokenStore({ connectionString: url });
  } else {
    // 로컬/개발 경로: 인메모리 영속화 + 인메모리 토큰 + 인메모리 큐.
    repo = new InMemoryRepository();
    queue = new InMemoryJobQueue();
    tokenStore = new InMemoryTokenStore();
  }
  // 토큰 시딩은 양쪽 공통(OMNIGUARD_TOKENS 또는 dev-token) — 발급 API가 두 모드에서 동일하게 동작한다.
  await seedTokens(tokenStore);
  const tokenAuth: AuthProvider = new DbAuthProvider(tokenStore);

  // 하이브리드: OIDC(사람) 우선 시도 → 실패 시 토큰(M2M/CI)으로 폴백.
  const oidc = loadOidc();
  const auth: AuthProvider = oidc
    ? new CompositeAuthProvider([new OidcAuthProvider(oidc), tokenAuth])
    : tokenAuth;
  if (oidc) console.error(`OIDC 활성화: issuer=${oidc.issuer}`);

  // 스캔은 비동기: API는 큐에 넣고, 인프로세스 워커가 OSV 보강까지 처리한다.
  const worker = new ScanWorker({
    queue,
    repo,
    enrich: (assets, tenantId) => enrichWithOsv(assets, tenantId),
  });
  worker.start();

  const app = buildServer({ repo, auth, queue, tokens: tokenStore });

  await app.listen({ port: PORT, host: HOST });
  console.error(`OmniGuard API listening on http://${HOST}:${PORT}`);
}

main().catch((error: unknown) => {
  console.error("API 시작 실패:", error);
  process.exitCode = 1;
});
