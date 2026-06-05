import type { Severity } from "@omniguard/schema";

/**
 * CVSS 기반 점수(Base Score) 계산 — 순수/결정론적.
 *
 * OSV/GHSA의 `severity[]` 항목은 CVSS 벡터 문자열을 담는다
 * (예: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H"). 텍스트 심각도 라벨
 * (LOW/HIGH…)보다 정밀한 0–10 점수를 여기서 공식 그대로 산출한다.
 *
 * 지원 범위: CVSS v3.0 / v3.1 (GHSA·OSV가 압도적으로 사용하는 형식).
 * v2/v4 등 미지원 형식은 null을 반환해 호출부가 텍스트 라벨로 폴백하게 한다(§7 한계).
 * 공식 출처: FIRST CVSS v3.1 Specification §7.1 (Base Score).
 */

// ── Base 메트릭 상수 (CVSS v3.x 명세 표) ──────────────────────
const ATTACK_VECTOR: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const ATTACK_COMPLEXITY: Record<string, number> = { L: 0.77, H: 0.44 };
const USER_INTERACTION: Record<string, number> = { N: 0.85, R: 0.62 };
// Privileges Required는 Scope에 따라 값이 달라진다.
const PRIVILEGES_REQUIRED_UNCHANGED: Record<string, number> = { N: 0.85, L: 0.62, H: 0.27 };
const PRIVILEGES_REQUIRED_CHANGED: Record<string, number> = { N: 0.85, L: 0.68, H: 0.5 };
const IMPACT_METRIC: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

/** CVSS v3.1 Roundup: 소수 첫째 자리로 올림(정수 연산으로 부동소수 오차 회피). */
function roundUpV31(value: number): number {
  const intInput = Math.round(value * 100000);
  if (intInput % 10000 === 0) return intInput / 100000;
  return (Math.floor(intInput / 10000) + 1) / 10;
}

/** CVSS v3.0 Roundup: 단순 소수 첫째 자리 올림. */
function roundUpV30(value: number): number {
  return Math.ceil(value * 10) / 10;
}

function parseMetrics(body: string): Record<string, string> {
  const metrics: Record<string, string> = {};
  for (const segment of body.split("/")) {
    const [key, value] = segment.split(":");
    if (key && value) metrics[key] = value;
  }
  return metrics;
}

function computeBaseScore(
  metrics: Record<string, string>,
  version: "3.0" | "3.1",
): number | null {
  const scopeChanged = metrics.S === "C";
  const av = ATTACK_VECTOR[metrics.AV!];
  const ac = ATTACK_COMPLEXITY[metrics.AC!];
  const ui = USER_INTERACTION[metrics.UI!];
  const pr = (scopeChanged ? PRIVILEGES_REQUIRED_CHANGED : PRIVILEGES_REQUIRED_UNCHANGED)[
    metrics.PR!
  ];
  const confidentiality = IMPACT_METRIC[metrics.C!];
  const integrity = IMPACT_METRIC[metrics.I!];
  const availability = IMPACT_METRIC[metrics.A!];

  // 필수 Base 메트릭 중 하나라도 누락/오타면 계산 불가 → null (0은 유효값이라 구분).
  if (
    av === undefined ||
    ac === undefined ||
    ui === undefined ||
    pr === undefined ||
    confidentiality === undefined ||
    integrity === undefined ||
    availability === undefined ||
    (metrics.S !== "C" && metrics.S !== "U")
  ) {
    return null;
  }

  const iss = 1 - (1 - confidentiality) * (1 - integrity) * (1 - availability);
  const impact = scopeChanged
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;
  if (impact <= 0) return 0;

  const exploitability = 8.22 * av * ac * pr * ui;
  const combined = scopeChanged
    ? 1.08 * (impact + exploitability)
    : impact + exploitability;
  const capped = Math.min(combined, 10);
  return version === "3.0" ? roundUpV30(capped) : roundUpV31(capped);
}

/** CVSS 벡터 문자열 → Base Score(0–10). v3.0/v3.1만 지원, 그 외 null. */
export function parseCvssVector(vector: string): number | null {
  const trimmed = vector.trim();
  if (trimmed.startsWith("CVSS:3.1/")) {
    return computeBaseScore(parseMetrics(trimmed.slice("CVSS:3.1/".length)), "3.1");
  }
  if (trimmed.startsWith("CVSS:3.0/")) {
    return computeBaseScore(parseMetrics(trimmed.slice("CVSS:3.0/".length)), "3.0");
  }
  return null;
}

/** OSV `severity[]`에서 파싱 가능한 CVSS Base Score를 고른다(CVSS_V3 우선). */
export function cvssFromSeverities(
  severities: ReadonlyArray<{ type: string; score: string }> | undefined,
): number | null {
  if (!severities || severities.length === 0) return null;
  // 1순위: 명시적 CVSS_V3 타입.
  for (const entry of severities) {
    if (entry.type === "CVSS_V3") {
      const score = parseCvssVector(entry.score);
      if (score !== null) return score;
    }
  }
  // 2순위: 타입 표기가 달라도 벡터가 v3 형식이면 파싱.
  for (const entry of severities) {
    const score = parseCvssVector(entry.score);
    if (score !== null) return score;
  }
  return null;
}

/** CVSS Base Score → 공통 Severity (CVSS v3.x 정성 등급 구간). */
export function severityFromCvss(score: number): Severity {
  if (score >= 9.0) return "CRITICAL";
  if (score >= 7.0) return "HIGH";
  if (score >= 4.0) return "MEDIUM";
  if (score > 0.0) return "LOW";
  return "INFO";
}
