import { describe, it, beforeAll, afterAll } from "vitest";
import pg from "pg";
import type { Pool } from "pg";
import {
  PostgresTokenStore,
  applyMigrations,
  type TokenStore,
} from "../src/index";
import { tokenStoreContract } from "./token-contract";

const url = process.env.DATABASE_URL;

if (!url) {
  describe.skip("TokenStore 계약: Postgres (DATABASE_URL 미설정 → 건너뜀)", () => {
    it("skipped", () => {});
  });
} else {
  let pool: Pool;
  let base: PostgresTokenStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await applyMigrations(pool);
    base = new PostgresTokenStore({ pool });
  });

  afterAll(async () => {
    await pool.end();
  });

  // 공유 풀을 쓰므로 각 테스트의 close()는 no-op으로 위임한다.
  // (토큰 해시가 매번 고유해 테스트 간 격리는 자연히 보장된다.)
  tokenStoreContract("Postgres", async (): Promise<TokenStore> => ({
    findByHash: (h) => base.findByHash(h),
    upsertToken: (t) => base.upsertToken(t),
    deleteToken: (h) => base.deleteToken(h),
    close: async () => {},
  }));
}
