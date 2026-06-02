import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import {
  Asset,
  AssetRelationship,
  Finding,
  RiskScore,
  newId,
  now,
} from "@omniguard/schema";
import { type Repository, assetIdentifier } from "./port";
import type { StoredToken, TokenStore } from "./token";
import type { EnqueueJob, Job, JobQueue, JobStatus, JobType } from "./job";

export type PostgresOptions =
  | { connectionString: string }
  | { pool: Pool };

/** migrations/ 의 *.sql 을 파일명 순으로 모두 적용한다 (테스트/부트스트랩용). */
export async function applyMigrations(pool: Pool): Promise<void> {
  const dir = fileURLToPath(new URL("../migrations/", import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = await readFile(join(dir, file), "utf8");
    await pool.query(sql);
  }
}

/** PostgreSQL 어댑터. 트랜잭션마다 RLS용 테넌트 세션 변수를 설정한다. */
export class PostgresRepository implements Repository {
  private readonly pool: Pool;

  constructor(options: PostgresOptions) {
    this.pool =
      "pool" in options
        ? options.pool
        : new pg.Pool({ connectionString: options.connectionString });
  }

  /** 이 저장소의 풀에 마이그레이션을 적용한다. */
  async migrate(): Promise<void> {
    await applyMigrations(this.pool);
  }

  /** 트랜잭션 + 테넌트 세션 변수(omniguard.tenant_id) 안에서 작업을 실행한다. */
  private async withTenant<T>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('omniguard.tenant_id', $1, true)", [
        tenantId,
      ]);
      const result = await fn(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async upsertAssets(tenantId: string, assets: readonly Asset[]): Promise<Asset[]> {
    return this.withTenant(tenantId, async (client) => {
      const out: Asset[] = [];
      for (const asset of assets) {
        const row = { ...asset, tenantId };
        const { rows } = await client.query<{ data: unknown }>(
          `insert into asset (id, tenant_id, type, identifier, data)
           values ($1, $2, $3, $4, $5::jsonb)
           on conflict (tenant_id, type, identifier) do update
             set data = jsonb_set(
                   jsonb_set(excluded.data, '{id}', asset.data->'id'),
                   '{firstSeen}', asset.data->'firstSeen')
           returning data`,
          [
            row.id,
            tenantId,
            row.attributes.type,
            assetIdentifier(row),
            JSON.stringify(row),
          ],
        );
        out.push(Asset.parse(rows[0]!.data));
      }
      return out;
    });
  }

  async listAssets(tenantId: string): Promise<Asset[]> {
    return this.withTenant(tenantId, async (client) => {
      const { rows } = await client.query<{ data: unknown }>(
        "select data from asset where tenant_id = $1 order by id",
        [tenantId],
      );
      return rows.map((r) => Asset.parse(r.data));
    });
  }

  async upsertFindings(
    tenantId: string,
    findings: readonly Finding[],
  ): Promise<Finding[]> {
    return this.withTenant(tenantId, async (client) => {
      const out: Finding[] = [];
      for (const finding of findings) {
        const row = { ...finding, tenantId };
        const { rows } = await client.query<{ data: unknown }>(
          `insert into finding (id, tenant_id, asset_id, source_finding_id, data)
           values ($1, $2, $3, $4, $5::jsonb)
           on conflict (tenant_id, asset_id, source_finding_id) do update
             set data = jsonb_set(
                   jsonb_set(excluded.data, '{id}', finding.data->'id'),
                   '{firstSeen}', finding.data->'firstSeen')
           returning data`,
          [
            row.id,
            tenantId,
            row.assetId,
            row.sourceFindingId,
            JSON.stringify(row),
          ],
        );
        out.push(Finding.parse(rows[0]!.data));
      }
      return out;
    });
  }

  async listFindings(tenantId: string): Promise<Finding[]> {
    return this.withTenant(tenantId, async (client) => {
      const { rows } = await client.query<{ data: unknown }>(
        "select data from finding where tenant_id = $1 order by id",
        [tenantId],
      );
      return rows.map((r) => Finding.parse(r.data));
    });
  }

  async upsertScores(
    tenantId: string,
    scores: readonly RiskScore[],
  ): Promise<RiskScore[]> {
    return this.withTenant(tenantId, async (client) => {
      const out: RiskScore[] = [];
      for (const score of scores) {
        const row = { ...score, tenantId };
        const { rows } = await client.query<{ data: unknown }>(
          `insert into risk_score (id, tenant_id, finding_id, data)
           values ($1, $2, $3, $4::jsonb)
           on conflict (tenant_id, finding_id) do update
             set data = jsonb_set(excluded.data, '{id}', risk_score.data->'id')
           returning data`,
          [row.id, tenantId, row.findingId, JSON.stringify(row)],
        );
        out.push(RiskScore.parse(rows[0]!.data));
      }
      return out;
    });
  }

  async listScores(tenantId: string): Promise<RiskScore[]> {
    return this.withTenant(tenantId, async (client) => {
      const { rows } = await client.query<{ data: unknown }>(
        "select data from risk_score where tenant_id = $1 order by id",
        [tenantId],
      );
      return rows.map((r) => RiskScore.parse(r.data));
    });
  }

  async upsertRelationships(
    tenantId: string,
    relationships: readonly AssetRelationship[],
  ): Promise<AssetRelationship[]> {
    return this.withTenant(tenantId, async (client) => {
      const out: AssetRelationship[] = [];
      for (const rel of relationships) {
        const row = { ...rel, tenantId };
        const { rows } = await client.query<{ data: unknown }>(
          `insert into asset_relationship
             (id, tenant_id, from_asset_id, to_asset_id, type, data)
           values ($1, $2, $3, $4, $5, $6::jsonb)
           on conflict (tenant_id, from_asset_id, to_asset_id, type) do update
             set data = jsonb_set(excluded.data, '{id}', asset_relationship.data->'id')
           returning data`,
          [
            row.id,
            tenantId,
            row.fromAssetId,
            row.toAssetId,
            row.type,
            JSON.stringify(row),
          ],
        );
        out.push(AssetRelationship.parse(rows[0]!.data));
      }
      return out;
    });
  }

  async listRelationships(tenantId: string): Promise<AssetRelationship[]> {
    return this.withTenant(tenantId, async (client) => {
      const { rows } = await client.query<{ data: unknown }>(
        "select data from asset_relationship where tenant_id = $1 order by id",
        [tenantId],
      );
      return rows.map((r) => AssetRelationship.parse(r.data));
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * PostgreSQL 인증 토큰 저장소. 테넌트 RLS 비대상(control-plane)이라
 * 테넌트 세션 변수 없이 직접 질의한다.
 */
export class PostgresTokenStore implements TokenStore {
  private readonly pool: Pool;

  constructor(options: PostgresOptions) {
    this.pool =
      "pool" in options
        ? options.pool
        : new pg.Pool({ connectionString: options.connectionString });
  }

  async findByHash(tokenHash: string): Promise<StoredToken | null> {
    const { rows } = await this.pool.query<{
      tenant_id: string;
      role: string;
      label: string;
    }>(
      "select tenant_id, role, label from api_token where token_hash = $1",
      [tokenHash],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tokenHash,
      tenantId: row.tenant_id,
      role: row.role,
      label: row.label,
    };
  }

  async upsertToken(token: StoredToken): Promise<void> {
    await this.pool.query(
      `insert into api_token (token_hash, tenant_id, role, label)
       values ($1, $2, $3, $4)
       on conflict (token_hash) do update
         set tenant_id = excluded.tenant_id,
             role = excluded.role,
             label = excluded.label`,
      [token.tokenHash, token.tenantId, token.role, token.label],
    );
  }

  async deleteToken(tokenHash: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      "delete from api_token where token_hash = $1",
      [tokenHash],
    );
    return (rowCount ?? 0) > 0;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

interface JobRow {
  id: string;
  tenant_id: string;
  type: string;
  status: string;
  payload: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
}

function rowToJob(row: JobRow): Job {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type as JobType,
    status: row.status as JobStatus,
    payload: row.payload,
    result: row.result ?? null,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const JOB_COLUMNS =
  "id, tenant_id, type, status, payload, result, error, attempts, created_at, updated_at";

/**
 * PostgreSQL 비동기 스캔 작업 큐. control-plane이라 테넌트 세션 변수 없이 질의한다.
 * claimNext는 FOR UPDATE SKIP LOCKED로 다중 워커에서도 중복 없이 클레임한다.
 */
export class PostgresJobQueue implements JobQueue {
  private readonly pool: Pool;

  constructor(options: PostgresOptions) {
    this.pool =
      "pool" in options
        ? options.pool
        : new pg.Pool({ connectionString: options.connectionString });
  }

  async enqueue(input: EnqueueJob): Promise<Job> {
    const ts = now();
    const { rows } = await this.pool.query<JobRow>(
      `insert into job (id, tenant_id, type, status, payload, attempts, created_at, updated_at)
       values ($1, $2, $3, 'queued', $4::jsonb, 0, $5, $5)
       returning ${JOB_COLUMNS}`,
      [newId(), input.tenantId, input.type, JSON.stringify(input.payload), ts],
    );
    return rowToJob(rows[0]!);
  }

  async getJob(tenantId: string, jobId: string): Promise<Job | null> {
    const { rows } = await this.pool.query<JobRow>(
      `select ${JOB_COLUMNS} from job where id = $1 and tenant_id = $2`,
      [jobId, tenantId],
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  async claimNext(): Promise<Job | null> {
    const { rows } = await this.pool.query<JobRow>(
      `update job set status = 'running', attempts = attempts + 1, updated_at = $1
       where id = (
         select id from job where status = 'queued'
         order by seq
         for update skip locked
         limit 1
       )
       returning ${JOB_COLUMNS}`,
      [now()],
    );
    return rows[0] ? rowToJob(rows[0]) : null;
  }

  async complete(jobId: string, result: unknown): Promise<Job> {
    return this.finish(jobId, "succeeded", { result, error: null });
  }

  async fail(jobId: string, error: string): Promise<Job> {
    return this.finish(jobId, "failed", { result: null, error });
  }

  private async finish(
    jobId: string,
    status: JobStatus,
    patch: { result: unknown; error: string | null },
  ): Promise<Job> {
    const { rows } = await this.pool.query<JobRow>(
      `update job set status = $2, result = $3::jsonb, error = $4, updated_at = $5
       where id = $1
       returning ${JOB_COLUMNS}`,
      [
        jobId,
        status,
        patch.result === null ? null : JSON.stringify(patch.result),
        patch.error,
        now(),
      ],
    );
    if (!rows[0]) throw new Error(`알 수 없는 작업: ${jobId}`);
    return rowToJob(rows[0]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
