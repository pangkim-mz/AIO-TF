import { newId } from "@omniguard/schema";
import {
  InMemoryRepository,
  PostgresRepository,
  PostgresTokenStore,
  hashToken,
  type Repository,
  type TokenStore,
} from "@omniguard/storage";
import { buildServer } from "./server";
import {
  DbAuthProvider,
  InMemoryAuthProvider,
  type AuthProvider,
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

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  let repo: Repository;
  let auth: AuthProvider;

  if (url) {
    // 운영 경로: Postgres에 영속화하고 토큰도 DB에서 해석한다.
    const pgRepo = new PostgresRepository({ connectionString: url });
    await pgRepo.migrate();
    const tokenStore = new PostgresTokenStore({ connectionString: url });
    await seedTokens(tokenStore);
    repo = pgRepo;
    auth = new DbAuthProvider(tokenStore);
  } else {
    // 로컬/개발 경로: 인메모리 영속화 + 인메모리 토큰.
    repo = new InMemoryRepository();
    auth = new InMemoryAuthProvider(loadTokens());
  }

  const app = buildServer({ repo, auth });

  await app.listen({ port: PORT, host: HOST });
  console.error(`OmniGuard API listening on http://${HOST}:${PORT}`);
}

main().catch((error: unknown) => {
  console.error("API 시작 실패:", error);
  process.exitCode = 1;
});
