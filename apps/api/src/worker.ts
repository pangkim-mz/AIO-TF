import type { JobQueue, Repository } from "@omniguard/storage";
import { type Enricher, runScanJob } from "./scans";

export interface WorkerDeps {
  queue: JobQueue;
  repo: Repository;
  enrich: Enricher;
  /** 폴링 간격(ms). 대기 작업이 없을 때만 쉰다. 기본 200ms. */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 200;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "스캔 처리에 실패했습니다.";
}

/**
 * 큐에서 스캔 작업을 클레임해 처리하는 인프로세스 워커.
 * processNext()는 테스트/배수에 직접 쓰고, start()/stop()은 폴링 루프를 돈다.
 */
export class ScanWorker {
  private readonly pollIntervalMs: number;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: WorkerDeps) {
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  /** 대기 작업 1개를 클레임해 처리한다. 처리했으면 true, 없으면 false. */
  async processNext(): Promise<boolean> {
    const job = await this.deps.queue.claimNext();
    if (!job) return false;
    try {
      const result = await runScanJob(this.deps.repo, this.deps.enrich, job);
      await this.deps.queue.complete(job.id, result);
    } catch (error) {
      await this.deps.queue.fail(job.id, errorMessage(error));
    }
    return true;
  }

  /** 폴링 루프를 시작한다. 대기 작업이 있으면 연달아 처리하고, 비면 간격만큼 쉰다. */
  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async (): Promise<void> => {
      if (!this.running) return;
      let processedAny = false;
      try {
        // 한 틱에서 큐를 비울 때까지 연속 처리한다.
        while (this.running && (await this.processNext())) {
          processedAny = true;
        }
      } catch (error) {
        // claimNext 자체 실패(예: DB 일시 장애) — 로깅 후 다음 틱에 재시도.
        console.error("워커 폴링 오류:", error);
      }
      if (!this.running) return;
      // 방금 처리할 게 있었으면 즉시, 없었으면 간격만큼 쉰 뒤 다시 폴링.
      this.timer = setTimeout(() => void tick(), processedAny ? 0 : this.pollIntervalMs);
    };
    void tick();
  }

  /** 폴링 루프를 멈춘다(진행 중 작업은 끝까지 처리). */
  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
