import type { Asset, AssetRelationship, Criticality } from "@omniguard/schema";
import type { ImpactRow } from "./api";

/** 서비스 의존성이 속한 도메인(프레젠테이션용 분류). */
export type ServiceDomain = "software" | "cloud" | "vendor" | "other";

/** 관계 종류 → 도메인. 서비스 엣지는 depends_on/hosted_on/provided_by만 생성된다. */
const RELATION_DOMAIN: Record<AssetRelationship["type"], ServiceDomain> = {
  depends_on: "software",
  hosted_on: "cloud",
  provided_by: "vendor",
  contains: "other",
};

export const DOMAIN_LABEL: Record<ServiceDomain, string> = {
  software: "소프트웨어",
  cloud: "클라우드",
  vendor: "벤더",
  other: "기타",
};

/** 서비스가 의존하는 단일 자산과 그 자산의 영향도. */
export interface ServiceDependency {
  relType: AssetRelationship["type"];
  domain: ServiceDomain;
  assetId: string;
  /** 대상 자산 이름(자산 목록에 없으면 id로 폴백). */
  name: string;
  impactScore: number;
}

/** 한 서비스의 통합 리스크 뷰(그래프 전파 결과 + 도메인별 의존성). */
export interface ServiceView {
  serviceId: string;
  name: string;
  criticality: Criticality;
  /** 서비스의 통합 영향도(모든 도메인 리스크의 전파 최악값). */
  impactScore: number;
  ownScore: number;
  inherited: boolean;
  rootCause: string | null;
  /** 영향도 내림차순 의존성. */
  dependencies: ServiceDependency[];
  /** 도메인별 의존성 개수. */
  counts: Record<ServiceDomain, number>;
}

/**
 * 조회 API 결과(자산·관계·영향도)를 조합해 서비스별 통합 리스크 뷰를 만든다.
 * 서버에 별도 엔드포인트를 두지 않고, 서비스 자산을 기점으로 엣지를 따라가
 * 각 도메인 자산의 영향도를 모은다. 영향도 내림차순으로 정렬해 반환한다.
 */
export function buildServiceViews(
  assets: readonly Asset[],
  relationships: readonly AssetRelationship[],
  impact: readonly ImpactRow[],
): ServiceView[] {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const impactById = new Map(impact.map((r) => [r.assetId, r]));
  const edgesByService = new Map<string, AssetRelationship[]>();
  for (const rel of relationships) {
    const list = edgesByService.get(rel.fromAssetId);
    if (list) list.push(rel);
    else edgesByService.set(rel.fromAssetId, [rel]);
  }

  const views: ServiceView[] = [];
  for (const service of assets) {
    if (service.attributes.type !== "service") continue;

    const serviceImpact = impactById.get(service.id);
    const counts: Record<ServiceDomain, number> = {
      software: 0,
      cloud: 0,
      vendor: 0,
      other: 0,
    };

    const dependencies: ServiceDependency[] = (
      edgesByService.get(service.id) ?? []
    ).map((rel) => {
      const domain = RELATION_DOMAIN[rel.type];
      counts[domain] += 1;
      const target = assetById.get(rel.toAssetId);
      return {
        relType: rel.type,
        domain,
        assetId: rel.toAssetId,
        name: target?.name ?? rel.toAssetId,
        impactScore: impactById.get(rel.toAssetId)?.impactScore ?? 0,
      };
    });
    dependencies.sort((a, b) => b.impactScore - a.impactScore);

    views.push({
      serviceId: service.id,
      name: service.name,
      criticality: service.criticality,
      impactScore: serviceImpact?.impactScore ?? 0,
      ownScore: serviceImpact?.ownScore ?? 0,
      inherited: serviceImpact?.inherited ?? false,
      rootCause: serviceImpact?.rootCause ?? null,
      dependencies,
      counts,
    });
  }

  views.sort((a, b) => b.impactScore - a.impactScore);
  return views;
}
