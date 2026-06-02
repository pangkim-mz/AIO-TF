import { resolve } from "node:path";
import { newId } from "@omniguard/schema";
import { scanPackageJson } from "@omniguard/connector-npm";
import { enrichWithOsv } from "@omniguard/enrich-osv";
import { createRepository, finishRun } from "./shared";

/**
 * SW 공급망 수직 슬라이스 오케스트레이터.
 * package.json → 자산 추출 → (영속화) → OSV 취약점 조회 → 점수 산정 → 출력.
 * 자산을 먼저 저장해 멱등 id를 확정한 뒤 그 id로 취약점을 조회한다.
 */
async function main(): Promise<void> {
  const inputArg = process.argv[2] ?? "package.json";
  const filePath = resolve(process.cwd(), inputArg);
  const asJson = process.argv.includes("--json");

  const tenantId = newId(); // 데모용 (실제로는 인증 컨텍스트에서 주입)
  const repo = await createRepository();

  try {
    console.error(`[1/3] 자산 스캔: ${filePath}`);
    const scanned = await scanPackageJson(filePath, tenantId);
    const assets = await repo.upsertAssets(tenantId, scanned);
    console.error(`      → ${assets.length}개 의존성 자산`);

    console.error(`[2/3] OSV 취약점 조회 중...`);
    const enriched = await enrichWithOsv(assets, tenantId);
    const findings = await repo.upsertFindings(tenantId, enriched);
    console.error(`      → ${findings.length}개 취약점`);

    console.error(`[3/3] 점수 산정 · 리포트`);
    await finishRun(repo, tenantId, assets, findings, {
      asJson,
      title: "SW 공급망",
    });
  } finally {
    await repo.close();
  }
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
