import { resolve } from "node:path";
import { newId } from "@omniguard/schema";
import { scanVendorInventory, evaluateVendors } from "@omniguard/connector-vendor";
import { createRepository, finishRun } from "./shared";

/**
 * 벤더/서드파티 리스크 오케스트레이터.
 * 인벤토리 파일 → 자산 추출 → (영속화) → 규칙 평가(인증서 만료/누락) → 점수 산정 → 출력.
 * SW 공급망과 동일한 storage·scoring 파이프라인을 재사용한다.
 */
async function main(): Promise<void> {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error("사용법: scan:vendor <vendors.yaml|vendors.json> [--json]");
    process.exitCode = 1;
    return;
  }
  const filePath = resolve(process.cwd(), inputArg);
  const asJson = process.argv.includes("--json");

  const tenantId = newId();
  const repo = await createRepository();

  try {
    console.error(`[1/3] 벤더 인벤토리 스캔: ${filePath}`);
    const { assets: scanned, entries } = await scanVendorInventory(filePath, tenantId);
    const assets = await repo.upsertAssets(tenantId, scanned);
    console.error(`      → ${assets.length}개 벤더 자산`);

    console.error(`[2/3] 컴플라이언스 규칙 평가`);
    const evaluated = evaluateVendors(assets, entries, tenantId);
    const findings = await repo.upsertFindings(tenantId, evaluated);
    console.error(`      → ${findings.length}개 리스크`);

    console.error(`[3/3] 점수 산정 · 리포트`);
    await finishRun(repo, tenantId, assets, findings, {
      asJson,
      title: "벤더/서드파티",
    });
  } finally {
    await repo.close();
  }
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
