import { resolve } from "node:path";
import { type Asset, type RiskScore, newId } from "@omniguard/schema";
import { scanPackageJson } from "@omniguard/connector-npm";
import { enrichWithOsv } from "@omniguard/enrich-osv";
import { scoreFinding } from "@omniguard/scoring";
import {
  InMemoryRepository,
  PostgresRepository,
  type Repository,
} from "@omniguard/storage";

/**
 * SW 공급망 수직 슬라이스 오케스트레이터.
 * package.json → 자산 추출 → (영속화) → OSV 취약점 조회 → 점수 산정 → 출력.
 *
 * DATABASE_URL이 있으면 Postgres에, 없으면 인메모리에 영속화한다.
 * 자산을 먼저 저장해 멱등 id를 확정한 뒤 그 id로 취약점을 조회한다.
 */
async function createRepository(): Promise<Repository> {
  const url = process.env.DATABASE_URL;
  if (!url) return new InMemoryRepository();
  const repo = new PostgresRepository({ connectionString: url });
  await repo.migrate();
  return repo;
}

async function main(): Promise<void> {
  const inputArg = process.argv[2] ?? "package.json";
  const filePath = resolve(process.cwd(), inputArg);
  const asJson = process.argv.includes("--json");

  // 데모용 고정 테넌트 (실제로는 인증 컨텍스트에서 주입)
  const tenantId = newId();
  const repo = await createRepository();

  try {
    console.error(`[1/4] 자산 스캔: ${filePath}`);
    const scanned = await scanPackageJson(filePath, tenantId);
    const assets = await repo.upsertAssets(tenantId, scanned);
    console.error(`      → ${assets.length}개 의존성 자산 (영속화 완료)`);

    console.error(`[2/4] OSV 취약점 조회 중...`);
    const enriched = await enrichWithOsv(assets, tenantId);
    const findings = await repo.upsertFindings(tenantId, enriched);
    console.error(`      → ${findings.length}개 취약점 발견`);

    console.error(`[3/4] 리스크 점수 산정`);
    const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));
    const scores: RiskScore[] = [];
    for (const finding of findings) {
      const asset = assetById.get(finding.assetId);
      if (asset) scores.push(scoreFinding(finding, asset));
    }
    await repo.upsertScores(tenantId, scores);

    console.error(`[4/4] 리포트 생성`);
    const scoreByFinding = new Map(scores.map((s) => [s.findingId, s]));
    const rows = findings
      .map((finding) => {
        const asset = assetById.get(finding.assetId);
        const score = scoreByFinding.get(finding.id);
        if (!asset || !score) return null;
        return { asset, finding, score };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.score.score - a.score.score);

    if (asJson) {
      const payload = rows.map((s) => ({
        asset: s.asset.name,
        version:
          s.asset.attributes.type === "software_component"
            ? s.asset.attributes.version
            : null,
        finding: s.finding.sourceFindingId,
        severity: s.finding.severity,
        score: s.score.score,
      }));
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    printReport(rows);
  } finally {
    await repo.close();
  }
}

function printReport(
  rows: ReadonlyArray<{
    asset: Asset;
    finding: { sourceFindingId: string; severity: string };
    score: RiskScore;
  }>,
): void {
  console.log("\n=== OmniGuard 리스크 리포트 (SW 공급망) ===\n");
  if (rows.length === 0) {
    console.log("발견된 취약점이 없습니다. ✅");
    return;
  }
  console.log("SCORE  SEV       PACKAGE                FINDING");
  console.log("-----  --------  ---------------------  --------------------");
  for (const s of rows) {
    const score = String(s.score.score).padStart(5);
    const sev = s.finding.severity.padEnd(8);
    const pkg = s.asset.name.slice(0, 21).padEnd(21);
    console.log(`${score}  ${sev}  ${pkg}  ${s.finding.sourceFindingId}`);
  }
  console.log(`\n총 ${rows.length}건. 점수 내림차순 정렬.\n`);
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
