import type {
  Asset,
  AssetRelationship,
  Finding,
  RiskScore,
} from "@omniguard/schema";
import { type Repository, assetIdentifier } from "./port";

/** 자연키 충돌 시 id/firstSeen을 보존하며 나머지는 새 값으로 갱신한다. */
function mergeAsset(existing: Asset, incoming: Asset): Asset {
  return { ...incoming, id: existing.id, firstSeen: existing.firstSeen };
}
function mergeFinding(existing: Finding, incoming: Finding): Finding {
  return { ...incoming, id: existing.id, firstSeen: existing.firstSeen };
}

/** 테넌트별 격리를 코드 레벨에서 강제하는 인메모리 어댑터 (테스트/로컬용). */
export class InMemoryRepository implements Repository {
  // tenantId → (naturalKey → entity)
  private readonly assets = new Map<string, Map<string, Asset>>();
  private readonly findings = new Map<string, Map<string, Finding>>();
  private readonly scores = new Map<string, Map<string, RiskScore>>();
  private readonly relationships = new Map<string, Map<string, AssetRelationship>>();

  private bucket<T>(store: Map<string, Map<string, T>>, tenantId: string): Map<string, T> {
    let b = store.get(tenantId);
    if (!b) {
      b = new Map<string, T>();
      store.set(tenantId, b);
    }
    return b;
  }

  async upsertAssets(tenantId: string, assets: readonly Asset[]): Promise<Asset[]> {
    const bucket = this.bucket(this.assets, tenantId);
    return assets.map((asset) => {
      const key = assetIdentifier(asset);
      const existing = bucket.get(key);
      const stored = existing ? mergeAsset(existing, asset) : { ...asset, tenantId };
      bucket.set(key, stored);
      return stored;
    });
  }

  async listAssets(tenantId: string): Promise<Asset[]> {
    return [...this.bucket(this.assets, tenantId).values()];
  }

  async upsertFindings(
    tenantId: string,
    findings: readonly Finding[],
  ): Promise<Finding[]> {
    const bucket = this.bucket(this.findings, tenantId);
    return findings.map((finding) => {
      const key = `${finding.assetId}:${finding.sourceFindingId}`;
      const existing = bucket.get(key);
      const stored = existing
        ? mergeFinding(existing, finding)
        : { ...finding, tenantId };
      bucket.set(key, stored);
      return stored;
    });
  }

  async listFindings(tenantId: string): Promise<Finding[]> {
    return [...this.bucket(this.findings, tenantId).values()];
  }

  async upsertScores(
    tenantId: string,
    scores: readonly RiskScore[],
  ): Promise<RiskScore[]> {
    const bucket = this.bucket(this.scores, tenantId);
    return scores.map((score) => {
      const stored = { ...score, tenantId };
      bucket.set(score.findingId, stored); // findingId당 현재 점수 1개
      return stored;
    });
  }

  async listScores(tenantId: string): Promise<RiskScore[]> {
    return [...this.bucket(this.scores, tenantId).values()];
  }

  async upsertRelationships(
    tenantId: string,
    relationships: readonly AssetRelationship[],
  ): Promise<AssetRelationship[]> {
    const bucket = this.bucket(this.relationships, tenantId);
    return relationships.map((rel) => {
      const key = `${rel.fromAssetId}->${rel.toAssetId}:${rel.type}`;
      const existing = bucket.get(key);
      const stored = existing
        ? { ...rel, id: existing.id } // id 보존
        : { ...rel, tenantId };
      bucket.set(key, stored);
      return stored;
    });
  }

  async listRelationships(tenantId: string): Promise<AssetRelationship[]> {
    return [...this.bucket(this.relationships, tenantId).values()];
  }

  async close(): Promise<void> {
    // no-op
  }
}
