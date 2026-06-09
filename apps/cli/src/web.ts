import { newId } from "@omniguard/schema";
import {
  scanUrl,
  activeScanUrl,
  ownershipToken,
  normalizeUrl,
  type WebScan,
} from "@omniguard/connector-web";
import { enrichWithOsv } from "@omniguard/enrich-osv";
import { createRepository, finishRun } from "./shared";

/**
 * 웹 노출 표면(EASM + 웹 공급망) 리스크 오케스트레이터.
 * URL → web_asset + 노출 JS(software_component) + depends_on 엣지 → TLS·헤더·SRI 점검(커넥터)
 * + 노출 JS의 CVE(enrichWithOsv 재사용) → 점수 → 출력.
 * 자산을 먼저 저장해 멱등 id를 확정한 뒤, 그 id로 findings를 정렬한다.
 *
 * --active: 도메인 소유권(DNS TXT)이 검증되면 서브도메인 열거·시크릿 스캔을 추가한다.
 * --token : 소유권 검증용 DNS TXT 레코드를 출력하고 종료한다(스캔 안 함).
 */
async function main(): Promise<void> {
  const inputArg = process.argv[2];
  if (!inputArg || inputArg.startsWith("--")) {
    console.error("사용법: scan:web <url> [--active] [--token] [--json]");
    process.exitCode = 1;
    return;
  }
  const asJson = process.argv.includes("--json");
  const active = process.argv.includes("--active");
  const tokenOnly = process.argv.includes("--token");

  // 소유권 토큰은 (테넌트, 호스트)에 결정론적이라 TENANT_ID를 고정해야 재현된다.
  const tenantId = process.env.TENANT_ID ?? newId();

  if (tokenOnly) {
    const { hostname } = normalizeUrl(inputArg);
    console.log(`도메인 소유권 검증용 DNS TXT 레코드 (호스트 ${hostname}):\n`);
    console.log(`  ${hostname}.  IN  TXT  "${ownershipToken(tenantId, hostname)}"\n`);
    console.log("위 레코드를 DNS에 추가한 뒤 `scan:web <url> --active`로 능동 점검하세요.");
    console.log(
      `(TENANT_ID=${process.env.TENANT_ID ? tenantId : "미설정 → 매 실행 변경"})`,
    );
    return;
  }

  const repo = await createRepository();

  try {
    let scanned: WebScan;
    if (active) {
      console.error(`[1/3] 능동 웹 점검(소유권 게이트): ${inputArg}`);
      const result = await activeScanUrl(inputArg, tenantId);
      if (result.activeSkipped) {
        console.error(
          `      ⚠ 소유권 미검증(${result.ownership.error ?? "TXT 토큰 불일치"}) → 능동 점검 생략, 수동 점검만 수행`,
        );
        console.error(
          `        DNS TXT에 추가: "${result.ownership.expectedToken}" (또는 \`--token\`으로 확인)`,
        );
      } else {
        console.error(`      ✓ 소유권 검증됨 → 서브도메인 열거·시크릿 스캔 포함`);
      }
      scanned = result;
    } else {
      console.error(`[1/3] 웹 점검: ${inputArg}`);
      scanned = await scanUrl(inputArg, tenantId);
    }

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
      `      → ${assets.length}개 자산(웹+노출 JS${active ? "+서브도메인" : ""}), ${relationships.length}개 관계`,
    );

    console.error(`[2/3] TLS·헤더·SRI${active ? "·시크릿·탈취" : ""} 점검 + 노출 JS OSV 조회`);
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
      `      → ${findings.length}개 리스크(점검 ${webFindings.length} + 취약점 ${osvFindings.length})`,
    );

    console.error(`[3/3] 점수 산정 · 영향도 전파 · 리포트`);
    await finishRun(repo, tenantId, assets, findings, relationships, {
      asJson,
      title: active ? "웹 노출 표면(능동 점검)" : "웹 노출 표면(EASM/웹 공급망)",
    });
  } finally {
    await repo.close();
  }
}

main().catch((error: unknown) => {
  console.error("실행 실패:", error);
  process.exitCode = 1;
});
