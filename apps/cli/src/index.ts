import { resolve } from "node:path";
import { type Asset, type RiskScore, newId } from "@omniguard/schema";
import { scanPackageJson } from "@omniguard/connector-npm";
import { enrichWithOsv } from "@omniguard/enrich-osv";
import { scoreFinding } from "@omniguard/scoring";

/**
 * SW 공급망 수직 슬라이스 오케스트레이터.
 * package.json → 자산 추출 → OSV 취약점 조회 → 점수 산정 → 출력.
 */
async function main(): Promise<void> {
  const inputArg = process.argv[2] ?? "package.json";
  const filePath = resolve(process.cwd(), inputArg);
  const asJson = process.argv.includes("--json");

  // 데모용 고정 테넌트 (실제로는 인증 컨텍스트에서 주입)
  const tenantId = newId();

  console.error(`[1/3] 자산 스캔: ${filePath}`);
  const assets = await scanPackageJson(filePath, tenantId);
  console.error(`      → ${assets.length}개 의존성 자산`);

  console.error(`[2/3] OSV 취약점 조회 중...`);
  const findings = await enrichWithOsv(assets, tenantId);
  console.error(`      → ${findings.length}개 취약점 발견`);

  console.error(`[3/3] 리스크 점수 산정`);
  const assetById = new Map<string, Asset>(assets.map((a) => [a.id, a]));
  const scored = findings
    .map((finding) => {
      const asset = assetById.get(finding.assetId);
      if (!asset) return null;
      return { finding, asset, score: scoreFinding(finding, asset) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.score.score - a.score.score);

  if (asJson) {
    const payload = scored.map((s) => ({
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

  printReport(scored);
}

function printReport(
  scored: ReadonlyArray<{
    asset: Asset;
    finding: { sourceFindingId: string; severity: string; title: string };
    score: RiskScore;
  }>,
): void {
  console.log("\n=== OmniGuard 리스크 리포트 (SW 공급망) ===\n");
  if (scored.length === 0) {
    console.log("발견된 취약점이 없습니다. ✅");
    return;
  }
  console.log("SCORE  SEV       PACKAGE                FINDING");
  console.log("-----  --------  ---------------------  --------------------");
  for (const s of scored) {
    const score = String(s.score.score).padStart(5);
    const sev = s.finding.severity.padEnd(8);
    const pkg = s.asset.name.slice(0, 21).padEnd(21);
    console.log(`${score}  ${sev}  ${pkg}  ${s.finding.sourceFindingId}`);
  }
  console.log(`\n총 ${scored.length}건. 점수 내림차순 정렬.\n`);
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
