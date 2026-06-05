import { describe, it, expect, beforeEach } from "vitest";
import { InMemoryJobQueue, InMemoryRepository } from "@omniguard/storage";
import { ScanWorker, nextRetryAt } from "../src/worker";
import type { Enricher } from "../src/scans";

const TENANT = "tenant-1";
const NPM_PAYLOAD = { packageJson: '{"name":"a","version":"1.0.0"}' };

/** 매 호출 결과를 큐가 빌 때까지 처리한다. */
async function drain(worker: ScanWorker): Promise<void> {
  while (await worker.processNext()) {
    /* 큐를 비운다 */
  }
}

describe("nextRetryAt (지수 백오프)", () => {
  const from = "2026-01-01T00:00:00.000Z";
  it("attempts=1 → base만큼 뒤", () => {
    expect(nextRetryAt(1, 1000, from)).toBe("2026-01-01T00:00:01.000Z");
  });
  it("attempts=2 → base*2, attempts=3 → base*4", () => {
    expect(nextRetryAt(2, 1000, from)).toBe("2026-01-01T00:00:02.000Z");
    expect(nextRetryAt(3, 1000, from)).toBe("2026-01-01T00:00:04.000Z");
  });
});

describe("ScanWorker 재시도", () => {
  let repo: InMemoryRepository;
  let queue: InMemoryJobQueue;
  beforeEach(() => {
    repo = new InMemoryRepository();
    queue = new InMemoryJobQueue();
  });

  it("일시 실패는 maxAttempts까지 재시도하고, 소진하면 failed로 끝난다", async () => {
    // retryBaseMs=0 → 백오프 즉시 만료라 같은 워커 루프에서 재클레임된다(결정론적).
    const enrich: Enricher = async () => {
      throw new Error("OSV 일시 장애");
    };
    const worker = new ScanWorker({ queue, repo, enrich, maxAttempts: 3, retryBaseMs: 0 });
    const job = await queue.enqueue({ tenantId: TENANT, type: "npm", payload: NPM_PAYLOAD });

    await drain(worker);

    const done = await queue.getJob(TENANT, job.id);
    expect(done!.status).toBe("failed");
    expect(done!.attempts).toBe(3);
    expect(done!.error).toBe("OSV 일시 장애");
  });

  it("재시도 도중 성공하면 succeeded로 끝난다", async () => {
    let calls = 0;
    const enrich: Enricher = async () => {
      calls += 1;
      if (calls === 1) throw new Error("첫 시도 실패");
      return [];
    };
    const worker = new ScanWorker({ queue, repo, enrich, maxAttempts: 3, retryBaseMs: 0 });
    const job = await queue.enqueue({ tenantId: TENANT, type: "npm", payload: NPM_PAYLOAD });

    await drain(worker);

    const done = await queue.getJob(TENANT, job.id);
    expect(done!.status).toBe("succeeded");
    expect(done!.attempts).toBe(2);
    expect(done!.error).toBeNull();
  });
});
