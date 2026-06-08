import { newId } from "@omniguard/schema";
import { scanUrl } from "@omniguard/connector-web";
import { enrichWithOsv } from "@omniguard/enrich-osv";
import { createRepository, finishRun } from "./shared";

/**
 * 웹 노출 표면(EASM + 웹 공급망) 리스크 오케스트레이터.
 * URL → web_asset + 노출 JS(software_component) + depends_on 엣지 → TLS·헤더·SRI 점검(커넥터)
 * + 노출 JS의 CVE(enrichWithOsv 재사용) → 점수 → 출력.
 * 자산을 먼저 저장해 멱등 id를 확정한 뒤, 그 id로 findings를 정렬한다.
 */
async function main(): Promise<void> {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error("사용법: scan:web <url> [--json]");
    process.exitCode = 1;
    return;
  }
  const asJson = process.argv.includes("--json");

  const tenantId = newId();
  const repo = await createRepository();

  try {
    console.error(`[1/3] 웹 점검: ${inputArg}`);
    const scanned = await scanUrl(inputArg, tenantId);
    const assets = await repo.upsertAssets(tenantId, scanned.assets);
    // upsert가 멱등 id를 확정하므로 엣지·findings 끝점을 영속화된 id로 재매핑한다.
    const idMap = new Map(scanned.assets.map((a, i) => [a.id, assets[i]!.id]));
    const remappedRels = scanned.relationships.map((r) => ({
      ...r,
      fromAssetId: idMap.get(r.fromAssetId) ?? r.fromAssetId,
      toAssetId: idMap.get(r.toAssetId) ?? r.toAssetId,
    }));
    const relationships = await repo.upsertRelationships(tenantId, remappedRels);
    console.error(
      `      → ${assets.length}개 자산(웹+노출 JS), ${relationships.length}개 의존 관계`,
    );

    console.error(`[2/3] TLS·헤더·SRI 점검 + 노출 JS OSV 조회`);
    const webFindings = scanned.findings.map((f) => ({
      ...f,
      assetId: idMap.get(f.assetId) ?? f.assetId,
    }));
    const osvFindings = await enrichWithOsv(assets, tenantId);
    const findings = await repo.upsertFindings(tenantId, [
      ...webFindings,
      ...osvFindings,
    ]);
    console.error(
      `      → ${findings.length}개 리스크(미설정/무결성 ${webFindings.length} + 취약점 ${osvFindings.length})`,
    );

    console.error(`[3/3] 점수 산정 · 영향도 전파 · 리포트`);
    await finishRun(repo, tenantId, assets, findings, relationships, {
      asJson,
      title: "웹 노출 표면(EASM/웹 공급망)",
    });
  } finally {
    await repo.close();
  }
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
