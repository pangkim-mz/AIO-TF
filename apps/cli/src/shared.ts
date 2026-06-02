import { type Asset, type Finding, type RiskScore } from "@omniguard/schema";
import { scoreFinding } from "@omniguard/scoring";
import {
  InMemoryRepository,
  PostgresRepository,
  type Repository,
} from "@omniguard/storage";

/** DATABASE_URL이 있으면 Postgres(+마이그레이션), 없으면 인메모리. */
export async function createRepository(): Promise<Repository> {
  const url = process.env.DATABASE_URL;
  if (!url) return new InMemoryRepository();
  const repo = new PostgresRepository({ connectionString: url });
  await repo.migrate();
  return repo;
}

interface ReportRow {
  asset: Asset;
  finding: Finding;
  score: RiskScore;
}

/** 점수 산정 → 영속화 → 정렬·출력. 도메인 무관 공통 마무리 단계. */
export async function finishRun(
  repo: Repository,
  tenantId: string,
  assets: readonly Asset[],
  findings: readonly Finding[],
  opts: { asJson: boolean; title: string },
): Promise<void> {
  const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));

  const scores: RiskScore[] = [];
  for (const finding of findings) {
    const asset = assetById.get(finding.assetId);
    if (asset) scores.push(scoreFinding(finding, asset));
  }
  await repo.upsertScores(tenantId, scores);

  const scoreByFinding = new Map(scores.map((s) => [s.findingId, s]));
  const rows: ReportRow[] = findings
    .map((finding) => {
      const asset = assetById.get(finding.assetId);
      const score = scoreByFinding.get(finding.id);
      return asset && score ? { asset, finding, score } : null;
    })
    .filter((x): x is ReportRow => x !== null)
    .sort((a, b) => b.score.score - a.score.score);

  if (opts.asJson) {
    console.log(JSON.stringify(rows.map(toJson), null, 2));
    return;
  }
  printReport(rows, opts.title);
}

function toJson(row: ReportRow): Record<string, unknown> {
  return {
    asset: row.asset.name,
    severity: row.finding.severity,
    category: row.finding.category,
    finding: row.finding.sourceFindingId,
    score: row.score.score,
  };
}

function printReport(rows: readonly ReportRow[], title: string): void {
  console.log(`\n=== OmniGuard 리스크 리포트 (${title}) ===\n`);
  if (rows.length === 0) {
    console.log("발견된 리스크가 없습니다. ✅");
    return;
  }
  console.log("SCORE  SEV       ASSET                  FINDING");
  console.log("-----  --------  ---------------------  --------------------");
  for (const { asset, finding, score } of rows) {
    const s = String(score.score).padStart(5);
    const sev = finding.severity.padEnd(8);
    const name = asset.name.slice(0, 21).padEnd(21);
    console.log(`${s}  ${sev}  ${name}  ${finding.sourceFindingId}`);
  }
  console.log(`\n총 ${rows.length}건. 점수 내림차순 정렬.\n`);
}
