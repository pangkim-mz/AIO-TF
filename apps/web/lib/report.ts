import type { Severity } from "@omniguard/schema";
import type { FindingDetail } from "./findings";
import type { DashboardSummary } from "./format";
import { ASSET_TYPE_LABEL } from "./assets";

/** 심각도 → 리포트 표기 라벨. */
const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: "심각(CRITICAL)",
  HIGH: "높음(HIGH)",
  MEDIUM: "중간(MEDIUM)",
  LOW: "낮음(LOW)",
  INFO: "정보(INFO)",
};

/** 요약 표에 표기할 심각도 순서. */
const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export interface SecurityReportInput {
  summary: DashboardSummary;
  /** 심각도순으로 정렬된 발견 상세(buildFindingDetails 결과). */
  findings: readonly FindingDetail[];
  /** 표시용 생성 시각 문자열(호출 측에서 로캘 포맷). */
  generatedAt: string;
}

/** 발견 목록의 심각도별 개수를 센다. */
export function countBySeverity(
  findings: readonly FindingDetail[],
): Record<Severity, number> {
  const counts: Record<Severity, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0,
  };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

/** 한 발견 상세를 마크다운 블록으로 변환한다. */
function findingBlock(finding: FindingDetail, index: number): string {
  const typeLabel = ASSET_TYPE_LABEL[finding.assetType] ?? finding.assetType;
  const lines: string[] = [
    `### ${index}. [${SEVERITY_LABEL[finding.severity]}] ${finding.title}`,
    "",
    "| 항목 | 내용 |",
    "|---|---|",
    `| 대상 자산 | ${finding.assetName} (${typeLabel}) |`,
    `| 분류 | ${finding.category} |`,
    `| 발견 ID | ${finding.sourceFindingId} |`,
    `| CVSS | ${finding.cvss !== null ? finding.cvss.toFixed(1) : "—"} |`,
    `| 위험 점수 | ${finding.score !== null ? `${finding.score}/100` : "—"} |`,
    "",
    `**설명**: ${finding.description?.trim() ? finding.description : "추가 설명이 제공되지 않았습니다."}`,
  ];
  if (finding.impacted.length > 0) {
    lines.push("", `**영향 전파**: 이 자산을 근원으로 위험을 상속한 하위 자산 ${finding.impacted.length}개`);
    for (const i of finding.impacted) {
      lines.push(`- ↳ ${i.asset} (영향도 ${i.impactScore})`);
    }
  }
  return lines.join("\n");
}

/**
 * 조회 데이터로 조립한 요약·발견 상세를 보안 점검 결과 마크다운으로 만든다(순수 함수).
 */
export function buildSecurityReportMarkdown(input: SecurityReportInput): string {
  const { summary, findings, generatedAt } = input;
  const counts = countBySeverity(findings);

  const sections: string[] = [
    "# OmniGuard 보안 점검 결과 리포트",
    "",
    `> 생성 시각: ${generatedAt}`,
    `> 자산 ${summary.assetCount} · 발견 ${summary.findingCount} · 최고 영향도 ${summary.topImpact}/100`,
    "",
    "---",
    "",
    "## 1. 요약",
    "",
    "| 지표 | 값 |",
    "|---|---|",
    `| 자산 | ${summary.assetCount} |`,
    `| 발견 | ${summary.findingCount} |`,
    ...SEVERITY_ORDER.map((s) => `| ${SEVERITY_LABEL[s]} | ${counts[s]} |`),
    `| 최고 영향도 | ${summary.topImpact}/100 |`,
    `| 리스크 상속 자산 | ${summary.inheritedCount} |`,
    "",
    "---",
    "",
    "## 2. 발견 상세 (심각도순)",
    "",
  ];

  if (findings.length === 0) {
    sections.push("발견된 항목이 없습니다. 스캔을 먼저 실행하세요.");
  } else {
    sections.push(findings.map((f, idx) => findingBlock(f, idx + 1)).join("\n\n"));
  }

  sections.push(
    "",
    "---",
    "",
    "## 3. 점검 방식 안내",
    "",
    "- 본 결과는 **OmniGuard**가 자산을 자동 점검한 것입니다.",
    "- 라이브러리 취약점은 공인 취약점 DB(OSV/GHSA)와 자동 대조해 연결합니다.",
    "- 위험 점수는 결정론적 공식(심각도·자산 중요도 가중합)으로 산출되어 재현·감사가 가능합니다.",
  );

  return sections.join("\n") + "\n";
}
