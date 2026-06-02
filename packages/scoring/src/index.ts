import {
  type Asset,
  type Criticality,
  type Finding,
  type RiskFactor,
  type RiskScore,
  type Severity,
  newId,
  now,
} from "@omniguard/schema";

/** 점수 룰 버전 — 가중치가 바뀌면 올린다 (과거 점수 재현성 보장). */
export const SCORING_VERSION = "1.0.0";

const SEVERITY_SCORE: Record<Severity, number> = {
  INFO: 10,
  LOW: 30,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 95,
};

const CRITICALITY_SCORE: Record<Criticality, number> = {
  LOW: 25,
  MEDIUM: 50,
  HIGH: 75,
  CRITICAL: 100,
};

const WEIGHTS = {
  severity: 0.7,
  criticality: 0.3,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Finding과 영향받는 Asset으로부터 결정론적 리스크 점수(0-100)를 계산한다.
 * 기여 요인을 factors에 분해 저장해 설명가능성을 확보한다.
 */
export function scoreFinding(finding: Finding, asset: Asset): RiskScore {
  const severityValue = SEVERITY_SCORE[finding.severity];
  const criticalityValue = CRITICALITY_SCORE[asset.criticality];

  const factors: RiskFactor[] = [
    {
      name: "severity",
      weight: WEIGHTS.severity,
      value: severityValue,
      contribution: severityValue * WEIGHTS.severity,
    },
    {
      name: "assetCriticality",
      weight: WEIGHTS.criticality,
      value: criticalityValue,
      contribution: criticalityValue * WEIGHTS.criticality,
    },
  ];

  const total = factors.reduce((sum, f) => sum + f.contribution, 0);

  return {
    id: newId(),
    tenantId: finding.tenantId,
    findingId: finding.id,
    score: Math.round(clamp(total, 0, 100)),
    factors,
    scoringVersion: SCORING_VERSION,
    computedAt: now(),
  };
}
