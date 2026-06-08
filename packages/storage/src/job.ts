import { newId, now } from "@omniguard/schema";

/** 스캔 잡 종류(도메인별). */
export const JOB_TYPES = ["npm", "vendor", "iac", "service", "web"] as const;
export type JobType = (typeof JOB_TYPES)[number];

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

/** 비동기 스캔 작업. payload/result는 잡 종류에 따라 형태가 달라 unknown. */
export interface Job {
  id: string;
  tenantId: string;
  type: JobType;
  status: JobStatus;
  payload: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  /** 이 시각(ISO) 이후에만 클레임 가능. 백오프 재시도용. enqueue 시 createdAt과 같다. */
  availableAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * claimNext 옵션.
 * - now: 기준 시각(테스트에서 주입). 기본은 실제 현재 시각.
 * - leaseMs: 주면 status='running'인데 updatedAt이 이 시간(ms)보다 오래된 잡도
 *   회수 대상에 넣는다(워커 크래시로 멈춘 잡 복구). 미지정 시 queued만 집어 기존 동작 보존.
 */
export interface ClaimOptions {
  now?: string;
  leaseMs?: number;
}

/** 큐에 넣을 작업(식별자/상태는 큐가 채운다). */
export interface EnqueueJob {
  tenantId: string;
  type: JobType;
  payload: unknown;
}

/**
 * 비동기 스캔 작업 큐 포트.
 *
 * control-plane 저장소다: 워커(`claimNext`/`complete`/`fail`)는 전 테넌트의 잡을
 * 가로질러 처리하므로 테넌트 RLS를 적용하지 않는다. 테넌트 격리는 조회 경로
 * (`getJob`)에서 코드 레벨 `tenantId` 필터로 강제한다.
 */
export interface JobQueue {
  /** 작업을 큐에 넣는다(status=queued). */
  enqueue(job: EnqueueJob): Promise<Job>;
  /** 테넌트 범위로 작업을 조회한다(상태 폴링). 없으면 null. */
  getJob(tenantId: string, jobId: string): Promise<Job | null>;
  /**
   * 다음 클레임 가능 작업을 원자적으로 클레임한다(→running, attempts+1). 없으면 null.
   * 클레임 대상: availableAt이 지난 queued + (leaseMs 지정 시) 리스가 만료된 running.
   */
  claimNext(options?: ClaimOptions): Promise<Job | null>;
  /** 작업을 성공 완료 처리한다. */
  complete(jobId: string, result: unknown): Promise<Job>;
  /** 작업을 영구 실패 처리한다(error=사용자 메시지). 재시도하지 않는다. */
  fail(jobId: string, error: string): Promise<Job>;
  /**
   * 작업을 재시도 예약한다(→queued). availableAt 이후에야 다시 클레임된다(백오프).
   * error에는 직전 실패 사유를 남긴다. attempts는 claimNext에서 이미 증가했다.
   */
  retry(jobId: string, error: string, availableAt: string): Promise<Job>;
  close(): Promise<void>;
}

function createJob(input: EnqueueJob): Job {
  const ts = now();
  return {
    id: newId(),
    tenantId: input.tenantId,
    type: input.type,
    status: "queued",
    payload: input.payload,
    result: null,
    error: null,
    attempts: 0,
    availableAt: ts, // 즉시 클레임 가능
    createdAt: ts,
    updatedAt: ts,
  };
}

/** updatedAt(ISO)에서 leaseMs만큼 지났는지 — running 잡 리스 만료 판정. */
function leaseExpired(updatedAt: string, leaseMs: number, nowIso: string): boolean {
  return new Date(updatedAt).getTime() + leaseMs <= new Date(nowIso).getTime();
}

/** 단일 프로세스용 인메모리 큐 (테스트/무DB 로컬). */
export class InMemoryJobQueue implements JobQueue {
  private readonly jobs = new Map<string, Job>();

  async enqueue(input: EnqueueJob): Promise<Job> {
    const job = createJob(input);
    this.jobs.set(job.id, job);
    return { ...job };
  }

  async getJob(tenantId: string, jobId: string): Promise<Job | null> {
    const job = this.jobs.get(jobId);
    if (!job || job.tenantId !== tenantId) return null;
    return { ...job };
  }

  async claimNext(options?: ClaimOptions): Promise<Job | null> {
    // Map은 삽입 순서를 보존하므로 가장 먼저 들어온 클레임 가능 작업이 FIFO로 잡힌다.
    // (ULID는 동일 ms 내 단조증가가 보장되지 않아 id 정렬에 의존하지 않는다.)
    // 단일 스레드 동기 변이라 동시 클레임 경합이 없다.
    const nowIso = options?.now ?? now();
    const leaseMs = options?.leaseMs;
    for (const job of this.jobs.values()) {
      const claimable =
        (job.status === "queued" && job.availableAt <= nowIso) ||
        (job.status === "running" &&
          leaseMs !== undefined &&
          leaseExpired(job.updatedAt, leaseMs, nowIso));
      if (!claimable) continue;
      job.status = "running";
      job.attempts += 1;
      job.updatedAt = nowIso;
      return { ...job };
    }
    return null;
  }

  async complete(jobId: string, result: unknown): Promise<Job> {
    return this.transition(jobId, (job) => {
      job.status = "succeeded";
      job.result = result;
      job.error = null;
    });
  }

  async fail(jobId: string, error: string): Promise<Job> {
    return this.transition(jobId, (job) => {
      job.status = "failed";
      job.result = null;
      job.error = error;
    });
  }

  async retry(jobId: string, error: string, availableAt: string): Promise<Job> {
    return this.transition(jobId, (job) => {
      job.status = "queued";
      job.error = error;
      job.availableAt = availableAt;
    });
  }

  private transition(jobId: string, apply: (job: Job) => void): Job {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`알 수 없는 작업: ${jobId}`);
    apply(job);
    job.updatedAt = now();
    return { ...job };
  }

  async close(): Promise<void> {
    // no-op
  }
}
