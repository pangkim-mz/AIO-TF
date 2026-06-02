import { newId, now } from "@omniguard/schema";

/** 스캔 잡 종류(도메인별). */
export const JOB_TYPES = ["npm", "vendor", "iac", "service"] as const;
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
  createdAt: string;
  updatedAt: string;
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
  /** 다음 대기 작업을 원자적으로 클레임한다(queued→running). 없으면 null. */
  claimNext(): Promise<Job | null>;
  /** 작업을 성공 완료 처리한다. */
  complete(jobId: string, result: unknown): Promise<Job>;
  /** 작업을 실패 처리한다(error=사용자 메시지). */
  fail(jobId: string, error: string): Promise<Job>;
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
    createdAt: ts,
    updatedAt: ts,
  };
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

  async claimNext(): Promise<Job | null> {
    // Map은 삽입 순서를 보존하므로 가장 먼저 들어온 대기 작업이 FIFO로 잡힌다.
    // (ULID는 동일 ms 내 단조증가가 보장되지 않아 id 정렬에 의존하지 않는다.)
    // 단일 스레드 동기 변이라 동시 클레임 경합이 없다.
    for (const job of this.jobs.values()) {
      if (job.status !== "queued") continue;
      job.status = "running";
      job.attempts += 1;
      job.updatedAt = now();
      return { ...job };
    }
    return null;
  }

  async complete(jobId: string, result: unknown): Promise<Job> {
    return this.transition(jobId, "succeeded", { result });
  }

  async fail(jobId: string, error: string): Promise<Job> {
    return this.transition(jobId, "failed", { error });
  }

  private transition(
    jobId: string,
    status: JobStatus,
    patch: { result?: unknown; error?: string },
  ): Job {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`알 수 없는 작업: ${jobId}`);
    job.status = status;
    if ("result" in patch) job.result = patch.result;
    if (patch.error !== undefined) job.error = patch.error;
    job.updatedAt = now();
    return { ...job };
  }

  async close(): Promise<void> {
    // no-op
  }
}
