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
}

/** OmniGuard API 클라이언트 (프레임워크 무관, 테스트 가능). */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
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
    return this.request<ScanSummary>("/v1/scans/npm", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
  scanVendor(inventory: string): Promise<ScanSummary> {
    return this.request<ScanSummary>("/v1/scans/vendor", {
      method: "POST",
      body: JSON.stringify({ inventory }),
    });
  }
  scanIac(input: IacScanInput): Promise<ScanSummary> {
    return this.request<ScanSummary>("/v1/scans/iac", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }
}
