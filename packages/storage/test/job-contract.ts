import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { newId } from "@omniguard/schema";
import type { JobQueue } from "../src/index";

/** 어댑터 무관 JobQueue 계약. 메모리/Postgres에 동일하게 적용한다. */
export function jobQueueContract(
  name: string,
  makeQueue: () => Promise<JobQueue>,
): void {
  describe(`JobQueue 계약: ${name}`, () => {
    let queue: JobQueue;
    beforeEach(async () => {
      queue = await makeQueue();
    });
    afterEach(async () => {
      await queue.close();
    });

    it("enqueue 후 테넌트 범위로 조회된다(queued)", async () => {
      const tenant = newId();
      const job = await queue.enqueue({
        tenantId: tenant,
        type: "npm",
        payload: { packageJson: "{}" },
      });
      expect(job.status).toBe("queued");

      const fetched = await queue.getJob(tenant, job.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.type).toBe("npm");
      expect(fetched!.payload).toEqual({ packageJson: "{}" });
    });

    it("다른 테넌트는 작업을 조회할 수 없다", async () => {
      const tenant = newId();
      const job = await queue.enqueue({ tenantId: tenant, type: "vendor", payload: {} });
      expect(await queue.getJob(newId(), job.id)).toBeNull();
    });

    it("claimNext는 queued→running으로 클레임하고 attempts를 올린다", async () => {
      const tenant = newId();
      const enq = await queue.enqueue({ tenantId: tenant, type: "iac", payload: {} });

      const claimed = await queue.claimNext();
      expect(claimed!.id).toBe(enq.id);
      expect(claimed!.status).toBe("running");
      expect(claimed!.attempts).toBe(1);
    });

    it("claimNext는 가장 오래된 작업부터 집고, 클레임된 작업은 다시 잡히지 않는다", async () => {
      const tenant = newId();
      const first = await queue.enqueue({ tenantId: tenant, type: "npm", payload: { n: 1 } });
      const second = await queue.enqueue({ tenantId: tenant, type: "npm", payload: { n: 2 } });

      expect((await queue.claimNext())!.id).toBe(first.id);
      expect((await queue.claimNext())!.id).toBe(second.id);
      expect(await queue.claimNext()).toBeNull(); // 더 없음
    });

    it("complete는 결과를 저장하고 succeeded로 전이한다", async () => {
      const tenant = newId();
      const job = await queue.enqueue({ tenantId: tenant, type: "npm", payload: {} });
      await queue.claimNext();
      await queue.complete(job.id, { assetCount: 3 });

      const done = await queue.getJob(tenant, job.id);
      expect(done!.status).toBe("succeeded");
      expect(done!.result).toEqual({ assetCount: 3 });
      expect(done!.error).toBeNull();
    });

    it("fail은 에러 메시지를 저장하고 failed로 전이한다", async () => {
      const tenant = newId();
      const job = await queue.enqueue({ tenantId: tenant, type: "npm", payload: {} });
      await queue.claimNext();
      await queue.fail(job.id, "OSV 호출 실패");

      const done = await queue.getJob(tenant, job.id);
      expect(done!.status).toBe("failed");
      expect(done!.error).toBe("OSV 호출 실패");
      expect(done!.result).toBeNull();
    });
  });
}
