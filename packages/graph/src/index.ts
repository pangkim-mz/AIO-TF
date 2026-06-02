import type { Asset, AssetRelationship } from "@omniguard/schema";

export interface ImpactResult {
  assetId: string;
  /** 자산 자신의 발견에서 나온 점수 (직접 리스크). */
  ownScore: number;
  /** 의존 관계를 따라 전파된 값을 포함한 최종 영향도 점수. */
  impactScore: number;
  /** impactScore를 유발한 근원 자산 (자신이거나 하위 의존). 0이면 null. */
  rootCauseAssetId: string | null;
  /** impactScore가 직접 리스크보다 큰가 (= 하위로부터 상속받았는가). */
  inherited: boolean;
}

/**
 * 자산 그래프를 따라 리스크를 전파한다.
 *
 * 엣지 `from -[type]-> to`는 "from이 to에 의존/영향받음"을 뜻하므로
 * 리스크는 to(근원) → from(영향받는 쪽)으로 흐른다. 모든 현재 엣지 타입
 * (depends_on/hosted_on/provided_by/contains)이 동일 방향으로 전파된다.
 *
 * impact(x) = max(own(x), max_{x->y} impact(y)). 순환은 안전하게 차단한다.
 */
export function propagateRisk(
  assets: readonly Asset[],
  relationships: readonly AssetRelationship[],
  ownScoreByAsset: ReadonlyMap<string, number>,
): Map<string, ImpactResult> {
  // 인접 리스트: from → [to, ...]
  const deps = new Map<string, string[]>();
  for (const asset of assets) deps.set(asset.id, []);
  for (const rel of relationships) {
    const list = deps.get(rel.fromAssetId);
    if (list) list.push(rel.toAssetId);
  }

  const memo = new Map<string, ImpactResult>();
  const visiting = new Set<string>();

  function compute(id: string): ImpactResult {
    const cached = memo.get(id);
    if (cached) return cached;

    const own = ownScoreByAsset.get(id) ?? 0;

    // 순환 감지: 진행 중인 노드를 다시 만나면 자기 점수만 반영해 무한루프 차단
    if (visiting.has(id)) {
      return {
        assetId: id,
        ownScore: own,
        impactScore: own,
        rootCauseAssetId: own > 0 ? id : null,
        inherited: false,
      };
    }
    visiting.add(id);

    let best = own;
    let rootCause: string | null = own > 0 ? id : null;
    for (const to of deps.get(id) ?? []) {
      const child = compute(to);
      if (child.impactScore > best) {
        best = child.impactScore;
        rootCause = child.rootCauseAssetId ?? to;
      }
    }

    visiting.delete(id);
    const result: ImpactResult = {
      assetId: id,
      ownScore: own,
      impactScore: best,
      rootCauseAssetId: rootCause,
      inherited: best > own,
    };
    memo.set(id, result);
    return result;
  }

  const out = new Map<string, ImpactResult>();
  for (const asset of assets) out.set(asset.id, compute(asset.id));
  return out;
}
