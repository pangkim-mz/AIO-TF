import type {
  Asset,
  AssetRelationship,
  Finding,
  RiskScore,
} from "@omniguard/schema";

/** API 영향도 응답 행 (서버 computeImpact 출력 형태). */
export interface ImpactRow {
  assetId: string;
  asset: string;
  ownScore: number;
  impactScore: number;
  inherited: boolean;
  rootCause: string | null;
}

export interface ScanSummary {
  assetCount: number;
  relationshipCount: number;
  findingCount: number;
  topScore: number;
}

export interface ServiceSummary {
  serviceCount: number;
  edgeCount: number;
  unresolved: string[];
}

export interface NpmScanInput {
  packageJson: string;
  lockfile?: string;
  lockfileType?: "npm" | "pnpm";
}

export interface IacScanInput {
  plan: string;
  stackName?: string;
}

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** API 오류 (envelope의 error를 그대로 보존). */
export class ApiClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  /** 작업 완료 폴링 간격(ms). 기본 500. */
  pollIntervalMs?: number;
  /** 작업 완료 폴링 최대 횟수. 기본 120(≈60초). */
  pollMaxAttempts?: number;
}

/** POST /v1/scans/* 의 즉시 응답(작업 접수). */
interface JobAccepted {
  jobId: string;
  status: string;
}

/** GET /v1/jobs/:id 의 작업 상태. */
interface JobView<T> {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed";
  result: T | null;
  error: string | null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** OmniGuard API 클라이언트 (프레임워크 무관, 테스트 가능). */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly pollIntervalMs: number;
  private readonly pollMaxAttempts: number;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.pollMaxAttempts = options.pollMaxAttempts ?? 120;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      // 관제 대시보드는 항상 최신 상태를 보여야 한다(Next fetch 캐시 비활성).
      // 외부(CLI/API/타 사용자) 변경도 즉시 반영되도록 reads를 라이브로 둔다.
      cache: "no-store",
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...init?.headers,
      },
    });
    const body = (await response.json()) as Envelope<T>;
    if (!body.ok) {
      throw new ApiClientError(body.error.code, body.error.message, response.status);
    }
    return body.data;
  }

  getAssets(): Promise<Asset[]> {
    return this.request<Asset[]>("/v1/assets");
  }
  getFindings(): Promise<Finding[]> {
    return this.request<Finding[]>("/v1/findings");
  }
  getScores(): Promise<RiskScore[]> {
    return this.request<RiskScore[]>("/v1/scores");
  }
  getRelationships(): Promise<AssetRelationship[]> {
    return this.request<AssetRelationship[]>("/v1/relationships");
  }
  getImpact(): Promise<ImpactRow[]> {
    return this.request<ImpactRow[]>("/v1/impact");
  }
  scanNpm(input: NpmScanInput): Promise<ScanSummary> {
    return this.submitScan<ScanSummary>("/v1/scans/npm", input);
  }
  scanVendor(inventory: string): Promise<ScanSummary> {
    return this.submitScan<ScanSummary>("/v1/scans/vendor", { inventory });
  }
  scanIac(input: IacScanInput): Promise<ScanSummary> {
    return this.submitScan<ScanSummary>("/v1/scans/iac", input);
  }
  scanService(manifest: string): Promise<ServiceSummary> {
    return this.submitScan<ServiceSummary>("/v1/scans/service", { manifest });
  }
  scanWeb(url: string): Promise<ScanSummary> {
    return this.submitScan<ScanSummary>("/v1/scans/web", { url });
  }

  /** 스캔을 큐에 넣고(202) 완료될 때까지 폴링해 결과를 반환한다. */
  private async submitScan<T>(path: string, body: unknown): Promise<T> {
    const { jobId } = await this.request<JobAccepted>(path, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return this.awaitJob<T>(jobId);
  }

  /** 작업이 끝날 때까지 상태를 폴링한다. 성공이면 결과, 실패면 ApiClientError. */
  private async awaitJob<T>(jobId: string): Promise<T> {
    for (let attempt = 0; attempt < this.pollMaxAttempts; attempt++) {
      const job = await this.request<JobView<T>>(`/v1/jobs/${jobId}`);
      if (job.status === "succeeded") {
        if (job.result === null) {
          throw new ApiClientError("scan_invalid", "작업 결과가 비어 있습니다.", 502);
        }
        return job.result;
      }
      if (job.status === "failed") {
        throw new ApiClientError("scan_failed", job.error ?? "스캔에 실패했습니다.", 502);
      }
      await sleep(this.pollIntervalMs);
    }
    throw new ApiClientError("scan_timeout", "스캔이 시간 내에 끝나지 않았습니다.", 504);
  }
}
