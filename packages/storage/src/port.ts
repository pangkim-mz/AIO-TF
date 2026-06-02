import type { Asset, Finding, RiskScore } from "@omniguard/schema";

/**
 * 테넌트 범위 영속화 포트. 모든 작업은 tenantId로 범위가 제한된다.
 * upsert는 자연키 기준 멱등이며, id/firstSeen은 최초 삽입 값을 보존한다.
 */
export interface Repository {
  upsertAssets(tenantId: string, assets: readonly Asset[]): Promise<Asset[]>;
  listAssets(tenantId: string): Promise<Asset[]>;

  upsertFindings(
    tenantId: string,
    findings: readonly Finding[],
  ): Promise<Finding[]>;
  listFindings(tenantId: string): Promise<Finding[]>;

  upsertScores(
    tenantId: string,
    scores: readonly RiskScore[],
  ): Promise<RiskScore[]>;
  listScores(tenantId: string): Promise<RiskScore[]>;

  close(): Promise<void>;
}

/** 자산의 도메인별 자연키(멱등 upsert의 충돌 키). */
export function assetIdentifier(asset: Asset): string {
  switch (asset.attributes.type) {
    case "software_component":
      return asset.attributes.purl;
    case "vendor":
      return asset.attributes.domain;
    case "cloud_resource":
      return asset.attributes.resourceId;
  }
}
