import type {
  Asset,
  AssetAttributes,
  AssetRelationship,
  Criticality,
  Finding,
  Severity,
} from "@omniguard/schema";
import type { ImpactRow } from "./api";
import { assetIdentifier, severityRank } from "./format";

/** 자산 타입 → 한국어 라벨 (페이지·테이블·통계 카드 공용). */
export const ASSET_TYPE_LABEL: Record<string, string> = {
  software_component: "SW 패키지",
  vendor: "벤더",
  cloud_resource: "클라우드 리소스",
  service: "서비스",
  web_asset: "웹 자산",
};

/** 자산에 걸린 발견의 심각도별 개수. */
export interface AssetSeverityCounts {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  INFO: number;
  total: number;
}

/** 한 자산의 표시·펼침에 필요한 모든 파생 정보(직렬화 가능, 클라이언트 전달용). */
export interface AssetDetail {
  id: string;
  name: string;
  /** attributes.type (도메인 구분). */
  type: string;
  /** 도메인별 자연키(식별자). */
  identifier: string;
  criticality: Criticality;
  owner: string | null;
  firstSeen: string;
  lastSeen: string;
  tags: { key: string; value: string }[];
  /** 도메인별 속성 라벨/값 쌍(표시용). */
  attributes: { label: string; value: string }[];
  /** 자산 자체 발견에서 나온 직접 위험. */
  ownScore: number;
  /** 그래프 전파 후 최종 영향도. */
  impactScore: number;
  /** 전파로 위험이 올라갔는가(상속). */
  inherited: boolean;
  /** 영향도를 유발한 근원 자산 이름. */
  rootCause: string | null;
  /** 이 자산에 걸린 발견의 심각도별 개수. */
  severityCounts: AssetSeverityCounts;
  /** 이 자산에 직접 걸린 발견(심각도 내림차순). */
  findings: {
    severity: Severity;
    title: string;
    sourceFindingId: string;
    category: string;
  }[];
  /** 이 자산이 의존하는 하위 자산 수(나가는 엣지). */
  dependencyCount: number;
  /** 이 자산에 의존하는 상위 자산 수(들어오는 엣지). */
  dependentCount: number;
}

/** 도메인별 attributes를 표시용 라벨/값 쌍으로 펼친다. */
function describeAttributes(attrs: AssetAttributes): { label: string; value: string }[] {
  switch (attrs.type) {
    case "software_component":
      return [
        { label: "에코시스템", value: attrs.ecosystem },
        { label: "버전", value: attrs.version },
        { label: "PURL", value: attrs.purl },
        {
          label: "라이선스",
          value: attrs.licenses.length > 0 ? attrs.licenses.join(", ") : "—",
        },
      ];
    case "vendor":
      return [
        { label: "도메인", value: attrs.domain },
        { label: "서비스 분류", value: attrs.serviceCategory },
        {
          label: "인증",
          value: attrs.certifications.length > 0 ? attrs.certifications.join(", ") : "—",
        },
      ];
    case "cloud_resource":
      return [
        { label: "프로바이더", value: attrs.provider.toUpperCase() },
        { label: "리소스 유형", value: attrs.resourceType },
        { label: "리전", value: attrs.region ?? "—" },
        { label: "리소스 ID", value: attrs.resourceId },
      ];
    case "service":
      return [{ label: "서비스 키", value: attrs.key }];
    case "web_asset":
      return [
        { label: "호스트네임", value: attrs.hostname },
        { label: "URL", value: attrs.url },
      ];
  }
}

function emptyCounts(): AssetSeverityCounts {
  return { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0, total: 0 };
}

/**
 * 조회 4종(자산·발견·영향도·관계)을 조합해 자산별 상세 행을 만든다(순수 함수).
 * 영향도 내림차순 → 동일 영향도면 발견 수 내림차순 → 이름 오름차순으로 정렬한다.
 */
export function buildAssetDetails(
  assets: readonly Asset[],
  findings: readonly Finding[],
  impact: readonly ImpactRow[],
  relationships: readonly AssetRelationship[],
): AssetDetail[] {
  const impactByAssetId = new Map(impact.map((r) => [r.assetId, r]));

  // 자산별 발견 모으기(심각도 내림차순 정렬).
  const findingsByAsset = new Map<string, Finding[]>();
  for (const finding of findings) {
    const list = findingsByAsset.get(finding.assetId) ?? [];
    list.push(finding);
    findingsByAsset.set(finding.assetId, list);
  }

  // 자산별 나가는/들어오는 엣지 수.
  const outByAsset = new Map<string, number>();
  const inByAsset = new Map<string, number>();
  for (const rel of relationships) {
    outByAsset.set(rel.fromAssetId, (outByAsset.get(rel.fromAssetId) ?? 0) + 1);
    inByAsset.set(rel.toAssetId, (inByAsset.get(rel.toAssetId) ?? 0) + 1);
  }

  const rows: AssetDetail[] = assets.map((asset) => {
    const own = impactByAssetId.get(asset.id);
    const assetFindings = (findingsByAsset.get(asset.id) ?? []).sort(
      (a, b) => severityRank(b.severity) - severityRank(a.severity),
    );

    const severityCounts = emptyCounts();
    for (const f of assetFindings) {
      severityCounts[f.severity] += 1;
      severityCounts.total += 1;
    }

    return {
      id: asset.id,
      name: asset.name,
      type: asset.attributes.type,
      identifier: assetIdentifier(asset),
      criticality: asset.criticality,
      owner: asset.owner,
      firstSeen: asset.firstSeen,
      lastSeen: asset.lastSeen,
      tags: Object.entries(asset.tags).map(([key, value]) => ({ key, value })),
      attributes: describeAttributes(asset.attributes),
      ownScore: own?.ownScore ?? 0,
      impactScore: own?.impactScore ?? 0,
      inherited: own?.inherited ?? false,
      rootCause: own?.rootCause ?? null,
      severityCounts,
      findings: assetFindings.map((f) => ({
        severity: f.severity,
        title: f.title,
        sourceFindingId: f.sourceFindingId,
        category: f.category,
      })),
      dependencyCount: outByAsset.get(asset.id) ?? 0,
      dependentCount: inByAsset.get(asset.id) ?? 0,
    };
  });

  return rows.sort(
    (a, b) =>
      b.impactScore - a.impactScore ||
      b.severityCounts.total - a.severityCounts.total ||
      a.name.localeCompare(b.name),
  );
}
