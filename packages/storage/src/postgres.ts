import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import { Asset, Finding, RiskScore } from "@omniguard/schema";
import { type Repository, assetIdentifier } from "./port";

export type PostgresOptions =
  | { connectionString: string }
  | { pool: Pool };

/** migrations/001_init.sql 을 적용한다 (테스트/부트스트랩용). */
export async function applyMigrations(pool: Pool): Promise<void> {
  const sqlPath = fileURLToPath(
    new URL("../migrations/001_init.sql", import.meta.url),
  );
  const sql = await readFile(sqlPath, "utf8");
  await pool.query(sql);
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

  async close(): Promise<void> {
    await this.pool.end();
  }
}
