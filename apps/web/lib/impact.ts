import type { Asset, AssetRelationship, Finding, Severity } from "@omniguard/schema";
import type { ImpactRow } from "./api";
import { severityRank } from "./format";

/** 한 자산의 영향도 상세(펼침용, 직렬화 가능). */
export interface ImpactDetail {
  assetId: string;
  assetName: string;
  assetType: string;
  /** 자산 자체 발견에서 나온 직접 위험. */
  ownScore: number;
  /** 그래프 전파 후 최종 영향도(자체와 상속 중 최댓값). */
  impactScore: number;
  /** 전파로 위험이 올라갔는가(상속). */
  inherited: boolean;
  /** 상속으로 올라간 폭(impactScore - ownScore). */
  inheritedDelta: number;
  /** 영향도를 유발한 근원 자산 이름. */
  rootCause: string | null;
  rootCauseType: string | null;
  /** 이 자산이 의존/연결한 하위 자산(전파 경로). 영향도 내림차순. */
  dependencies: {
    relType: AssetRelationship["type"];
    name: string;
    type: string;
    impactScore: number;
  }[];
  /** 이 자산에 직접 걸린 발견(심각도 내림차순). */
  directFindings: { severity: Severity; title: string; sourceFindingId: string }[];
}

/**
 * 조회 4종(영향도·자산·관계·발견)을 조합해 자산별 영향도 상세를 만든다(순수 함수).
 * 영향도 내림차순으로 정렬한다.
 */
export function buildImpactDetails(
  impact: readonly ImpactRow[],
  assets: readonly Asset[],
  relationships: readonly AssetRelationship[],
  findings: readonly Finding[],
): ImpactDetail[] {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const impactByAssetId = new Map(impact.map((r) => [r.assetId, r]));
  const impactByName = new Map(impact.map((r) => [r.asset, r]));

  // 자산별 직접 발견 모으기.
  const findingsByAsset = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = findingsByAsset.get(finding.assetId) ?? [];
    list.push(finding);
    findingsByAsset.set(finding.assetId, list);
  }

  // 자산별 나가는 엣지(전파 경로) 모으기.
  const edgesByFrom = new Map<string, AssetRelationship[]>();
  for (const rel of relationships) {
    const list = edgesByFrom.get(rel.fromAssetId) ?? [];
    list.push(rel);
    edgesByFrom.set(rel.fromAssetId, list);
  }

  const rows: ImpactDetail[] = impact.map((row) => {
    const rootCauseAsset = row.rootCause ? impactByName.get(row.rootCause) : undefined;
    const rootCauseType = row.rootCause
      ? (assetById.get(rootCauseAsset?.assetId ?? "")?.attributes.type ?? null)
      : null;

    const dependencies = (edgesByFrom.get(row.assetId) ?? [])
      .map((rel) => {
        const to = assetById.get(rel.toAssetId);
        const toImpact = impactByAssetId.get(rel.toAssetId);
        return {
          relType: rel.type,
          name: to?.name ?? rel.toAssetId,
          type: to?.attributes.type ?? "unknown",
          impactScore: toImpact?.impactScore ?? 0,
        };
      })
      .sort((a, b) => b.impactScore - a.impactScore);

    const directFindings = (findingsByAsset.get(row.assetId) ?? [])
      .map((f) => ({
        severity: f.severity,
        title: f.title,
        sourceFindingId: f.sourceFindingId,
      }))
      .sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

    return {
      assetId: row.assetId,
      assetName: row.asset,
      assetType: assetById.get(row.assetId)?.attributes.type ?? "unknown",
      ownScore: row.ownScore,
      impactScore: row.impactScore,
      inherited: row.inherited,
      inheritedDelta: Math.max(0, row.impactScore - row.ownScore),
      rootCause: row.rootCause,
      rootCauseType,
      dependencies,
      directFindings,
    };
  });

  return rows.sort((a, b) => b.impactScore - a.impactScore);
}
