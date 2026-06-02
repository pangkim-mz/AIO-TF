import { describe, it, expect } from "vitest";
import pg from "pg";
import { applyMigrations } from "../src/index";

const url = process.env.DATABASE_URL;

if (!url) {
  describe.skip("마이그레이션 동시성: Postgres (DATABASE_URL 미설정 → 건너뜀)", () => {
    it("skipped", () => {});
  });
} else {
  describe("applyMigrations 동시성", () => {
    it("여러 풀에서 동시에 적용해도 충돌(23505) 없이 완료된다", async () => {
      // advisory lock이 없으면 CREATE TABLE IF NOT EXISTS가 동시 실행 시
      // pg_type 유니크 충돌을 일으킨다. 이 테스트가 그 레이스를 재현한다.
      const pools = Array.from(
        { length: 5 },
        () => new pg.Pool({ connectionString: url }),
      );
      try {
        await Promise.all(pools.map((pool) => applyMigrations(pool)));
      } finally {
        await Promise.all(pools.map((pool) => pool.end()));
      }
      expect(true).toBe(true); // 위에서 throw 없이 끝나면 성공
    });
  });
}
