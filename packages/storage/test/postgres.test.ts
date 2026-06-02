import { describe, it, beforeAll, afterAll } from "vitest";
import pg from "pg";
import type { Pool } from "pg";
import {
  PostgresRepository,
  applyMigrations,
  type Repository,
} from "../src/index";
import { repositoryContract } from "./contract";

const url = process.env.DATABASE_URL;

if (!url) {
  describe.skip("Repository 계약: Postgres (DATABASE_URL 미설정 → 건너뜀)", () => {
    it("skipped", () => {});
  });
} else {
  let pool: Pool;
  let base: PostgresRepository;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await applyMigrations(pool);
    base = new PostgresRepository({ pool });
  });

  afterAll(async () => {
    await pool.end();
  });

  // 공유 풀을 쓰므로 각 테스트의 close()는 no-op으로 위임한다.
  // (테넌트 id가 매번 고유해 테스트 간 격리는 자연히 보장된다.)
  repositoryContract("Postgres", async (): Promise<Repository> => ({
    upsertAssets: (t, a) => base.upsertAssets(t, a),
    listAssets: (t) => base.listAssets(t),
    upsertFindings: (t, f) => base.upsertFindings(t, f),
    listFindings: (t) => base.listFindings(t),
    upsertScores: (t, s) => base.upsertScores(t, s),
    listScores: (t) => base.listScores(t),
    close: async () => {},
  }));
}
