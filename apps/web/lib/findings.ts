import type { Asset, Finding, RiskFactor, RiskScore, Severity } from "@omniguard/schema";
import type { ImpactRow } from "./api";
import { severityRank } from "./format";

/** 한 발견의 표시·펼침에 필요한 모든 파생 정보(직렬화 가능, 클라이언트 전달용). */
export interface FindingDetail {
  id: string;
  severity: Severity;
  category: string;
  sourceFindingId: string;
  title: string;
  description: string;
  cvss: number | null;
  status: string;
  detectedAt: string;
  assetId: string;
  assetName: string;
  assetType: string;
  /** 이 발견의 리스크 점수(0-100). 점수가 없으면 null. */
  score: number | null;
  /** 점수 기여 요인 분해(왜 이 점수인가). */
  factors: RiskFactor[];
  /** 이 발견의 자산을 근원으로 위험을 상속한 하위 자산들(영향 전파). */
  impacted: { asset: string; impactScore: number }[];
}

/**
 * 조회 4종(발견·자산·점수·영향도)을 조합해 발견별 상세 행을 만든다(순수 함수).
 * 심각도 내림차순 → 동일 심각도면 점수 내림차순으로 정렬한다.
 */
export function buildFindingDetails(
  findings: readonly Finding[],
  assets: readonly Asset[],
  scores: readonly RiskScore[],
  impact: readonly ImpactRow[],
): FindingDetail[] {
  const assetById = new Map(assets.map((a) => [a.id, a]));
  const scoreByFinding = new Map(scores.map((s) => [s.findingId, s]));

  // 자산 이름 → 그 자산을 근원으로 위험을 상속한 하위 자산 목록.
  const impactedByRoot = new Map<string, { asset: string; impactScore: number }[]>();
  for (const row of impact) {
    if (!row.inherited || row.rootCause === null) continue;
    const list = impactedByRoot.get(row.rootCause) ?? [];
    list.push({ asset: row.asset, impactScore: row.impactScore });
    impactedByRoot.set(row.rootCause, list);
  }

  const rows: FindingDetail[] = findings.map((finding) => {
    const asset = assetById.get(finding.assetId);
    const score = scoreByFinding.get(finding.id);
    const assetName = asset?.name ?? finding.assetId;
    const impacted = (impactedByRoot.get(assetName) ?? [])
      .filter((r) => r.asset !== assetName)
      .sort((a, b) => b.impactScore - a.impactScore);
    return {
      id: finding.id,
      severity: finding.severity,
      category: finding.category,
      sourceFindingId: finding.sourceFindingId,
      title: finding.title,
      description: finding.description,
      cvss: finding.cvss,
      status: finding.status,
      detectedAt: finding.detectedAt,
      assetId: finding.assetId,
      assetName,
      assetType: asset?.attributes.type ?? "unknown",
      score: score?.score ?? null,
      factors: score?.factors ?? [],
      impacted,
    };
  });

  return rows.sort(
    (a, b) =>
      severityRank(b.severity) - severityRank(a.severity) ||
      (b.score ?? 0) - (a.score ?? 0),
  );
}
