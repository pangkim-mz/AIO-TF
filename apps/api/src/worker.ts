import { now } from "@omniguard/schema";
import type { JobQueue, Repository } from "@omniguard/storage";
import { type Enricher, type WebScanner, runScanJob } from "./scans";

export interface WorkerDeps {
  queue: JobQueue;
  repo: Repository;
  enrich: Enricher;
  /** URL 점검 함수(web 스캔용). 미지정 시 실제 네트워크 호출(scanUrl). 테스트는 주입. */
  scanWeb?: WebScanner;
  /** 폴링 간격(ms). 대기 작업이 없을 때만 쉰다. 기본 200ms. */
  pollIntervalMs?: number;
  /** 최대 시도 횟수. 이 횟수만큼 실패하면 영구 실패 처리. 기본 3. */
  maxAttempts?: number;
  /** 재시도 백오프 기준(ms). 지연 = base * 2^(attempts-1). 기본 1000ms. */
  retryBaseMs?: number;
  /**
   * 리스 시간(ms). running 잡이 이 시간 넘게 갱신되지 않으면(워커 크래시 등)
   * 다른 클레임에 회수된다. 기본 5분. runScanJob은 멱등이라 중복 실행이 안전하다.
   */
  leaseMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 200;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "스캔 처리에 실패했습니다.";
}

/**
 * 지수 백오프로 다음 재시도 가능 시각(ISO)을 계산한다(순수 함수).
 * attempts = 방금 실패한 시도 횟수(claim 시 1부터 증가). 지연 = baseMs * 2^(attempts-1).
 */
export function nextRetryAt(attempts: number, baseMs: number, fromIso: string): string {
  const delayMs = baseMs * 2 ** (attempts - 1);
  return new Date(new Date(fromIso).getTime() + delayMs).toISOString();
}

/**
 * 큐에서 스캔 작업을 클레임해 처리하는 인프로세스 워커.
 * processNext()는 테스트/배수에 직접 쓰고, start()/stop()은 폴링 루프를 돈다.
 */
export class ScanWorker {
  private readonly pollIntervalMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseMs: number;
  private readonly leaseMs: number;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly deps: WorkerDeps) {
    this.pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.maxAttempts = deps.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.retryBaseMs = deps.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
    this.leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;
  }

  /** 대기 작업 1개를 클레임해 처리한다. 처리했으면 true, 없으면 false. */
  async processNext(): Promise<boolean> {
    // leaseMs를 넘겨 크래시로 멈춘 running 잡도 회수한다.
    const job = await this.deps.queue.claimNext({ leaseMs: this.leaseMs });
    if (!job) return false;
    try {
      const result = await runScanJob(
        this.deps.repo,
        this.deps.enrich,
        job,
        this.deps.scanWeb,
      );
      await this.deps.queue.complete(job.id, result);
    } catch (error) {
      const message = errorMessage(error);
      // 시도 횟수가 남았으면 백오프 후 재시도, 소진했으면 영구 실패.
      if (job.attempts < this.maxAttempts) {
        await this.deps.queue.retry(
          job.id,
          message,
          nextRetryAt(job.attempts, this.retryBaseMs, now()),
        );
      } else {
        await this.deps.queue.fail(job.id, message);
      }
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
