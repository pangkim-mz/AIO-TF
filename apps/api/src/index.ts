import { newId } from "@omniguard/schema";
import {
  InMemoryRepository,
  PostgresRepository,
  type Repository,
} from "@omniguard/storage";
import { buildServer } from "./server";
import { InMemoryAuthProvider, type Principal } from "./auth";

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

async function createRepository(): Promise<Repository> {
  const url = process.env.DATABASE_URL;
  if (!url) return new InMemoryRepository();
  const repo = new PostgresRepository({ connectionString: url });
  await repo.migrate();
  return repo;
}

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

async function main(): Promise<void> {
  const repo = await createRepository();
  const auth = new InMemoryAuthProvider(loadTokens());
  const app = buildServer({ repo, auth });

  await app.listen({ port: PORT, host: HOST });
  console.error(`OmniGuard API listening on http://${HOST}:${PORT}`);
}

main().catch((error: unknown) => {
  console.error("API 시작 실패:", error);
  process.exitCode = 1;
});
