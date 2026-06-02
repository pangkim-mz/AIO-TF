import { resolve } from "node:path";
import { newId } from "@omniguard/schema";
import { parseServiceManifest, buildTopology } from "@omniguard/connector-service";
import { createRepository, printPersistedImpact } from "./shared";

/**
 * 서비스 토폴로지 오케스트레이터 (도메인 간 그래프 연결).
 * 매니페스트의 서비스를 기존 자산(패키지/클라우드/벤더)에 연결해
 * 서비스 단위 통합 영향도를 계산한다.
 *
 * 주의: 동일 테넌트(저장소)에 대상 자산이 먼저 적재돼 있어야 한다
 * (인메모리는 단일 프로세스 한정 → 이 명령만으로는 대상이 없을 수 있음).
 * 실제 사용은 DATABASE_URL로 영속화된 데이터에 대해 실행한다.
 */
async function main(): Promise<void> {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error("사용법: scan:service <services.yaml>");
    process.exitCode = 1;
    return;
  }
  const filePath = resolve(process.cwd(), inputArg);
  const tenantId = process.env.TENANT_ID ?? newId();
  const repo = await createRepository();

  try {
    console.error(`[1/2] 서비스 매니페스트 + 토폴로지 연결: ${filePath}`);
    const entries = await parseServiceManifest(filePath);
    const existing = await repo.listAssets(tenantId);
    const topo = buildTopology(entries, existing, tenantId);

    const persisted = await repo.upsertAssets(tenantId, topo.assets);
    const idMap = new Map(topo.assets.map((a, i) => [a.id, persisted[i]!.id]));
    const edges = topo.relationships.map((r) => ({
      ...r,
      fromAssetId: idMap.get(r.fromAssetId) ?? r.fromAssetId,
    }));
    const rels = await repo.upsertRelationships(tenantId, edges);
    console.error(
      `      → 서비스 ${persisted.length}개, 교차 엣지 ${rels.length}개` +
        (topo.unresolved.length
          ? `, 미해결 참조 ${topo.unresolved.length}건: ${topo.unresolved.join(", ")}`
          : ""),
    );

    console.error(`[2/2] 서비스 단위 통합 영향도`);
    await printPersistedImpact(repo, tenantId);
  } finally {
    await repo.close();
  }
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
