import { describe, it, beforeAll, afterAll } from "vitest";
import pg from "pg";
import type { Pool } from "pg";
import {
  PostgresJobQueue,
  applyMigrations,
  type JobQueue,
} from "../src/index";
import { jobQueueContract } from "./job-contract";

const url = process.env.DATABASE_URL;

if (!url) {
  describe.skip("JobQueue 계약: Postgres (DATABASE_URL 미설정 → 건너뜀)", () => {
    it("skipped", () => {});
  });
} else {
  let pool: Pool;
  let base: PostgresJobQueue;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url });
    await applyMigrations(pool);
    base = new PostgresJobQueue({ pool });
  });

  afterAll(async () => {
    await pool.end();
  });

  // claimNext는 테넌트 무관(전역)이라 테넌트 id로는 격리되지 않는다.
  // 매 테스트 시작 시 job 테이블을 비워 클레임 순서 검증을 결정론적으로 만든다.
  // (공유 풀이므로 close()는 no-op으로 위임한다.)
  jobQueueContract("Postgres", async (): Promise<JobQueue> => {
    await pool.query("delete from job");
    return {
      enqueue: (j) => base.enqueue(j),
      getJob: (t, id) => base.getJob(t, id),
      claimNext: () => base.claimNext(),
      complete: (id, r) => base.complete(id, r),
      fail: (id, e) => base.fail(id, e),
      close: async () => {},
    };
  });
}
