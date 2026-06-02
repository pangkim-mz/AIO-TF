import { resolve } from "node:path";
import { newId } from "@omniguard/schema";
import { scanTerraformPlan, evaluateIac } from "@omniguard/connector-iac";
import { createRepository, finishRun } from "./shared";

/**
 * 클라우드/인프라(IaC) 리스크 오케스트레이터.
 * Terraform plan JSON → 자산/스택 + contains 엣지 → 미설정 규칙 평가 → 점수 → 출력.
 * SW 공급망/벤더와 동일한 storage·scoring·graph 파이프라인을 재사용한다.
 */
async function main(): Promise<void> {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error("사용법: scan:iac <terraform-plan.json> [--json]");
    process.exitCode = 1;
    return;
  }
  const filePath = resolve(process.cwd(), inputArg);
  const asJson = process.argv.includes("--json");

  const tenantId = newId();
  const repo = await createRepository();

  try {
    console.error(`[1/3] Terraform plan 스캔: ${filePath}`);
    const scanned = await scanTerraformPlan(filePath, tenantId);
    const assets = await repo.upsertAssets(tenantId, scanned.assets);

    const idMap = new Map(scanned.assets.map((a, i) => [a.id, assets[i]!.id]));
    const remapped = scanned.relationships.map((r) => ({
      ...r,
      fromAssetId: idMap.get(r.fromAssetId) ?? r.fromAssetId,
      toAssetId: idMap.get(r.toAssetId) ?? r.toAssetId,
    }));
    const relationships = await repo.upsertRelationships(tenantId, remapped);
    console.error(
      `      → ${assets.length}개 자산, ${relationships.length}개 contains 관계`,
    );

    console.error(`[2/3] 미설정 규칙 평가`);
    const evaluated = evaluateIac(assets, scanned.resources, tenantId);
    const findings = await repo.upsertFindings(tenantId, evaluated);
    console.error(`      → ${findings.length}개 리스크`);

    console.error(`[3/3] 점수 산정 · 영향도 전파 · 리포트`);
    await finishRun(repo, tenantId, assets, findings, relationships, {
      asJson,
      title: "클라우드/인프라(IaC)",
    });
  } finally {
    await repo.close();
  }
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
