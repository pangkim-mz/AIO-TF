import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { ASSET_TYPE_LABEL, buildAssetDetails } from "../../lib/assets";
import { EmptyNotice, ErrorNotice, StatCard } from "../components";
import { AssetsTable } from "../assets-table";

export const dynamic = "force-dynamic";

export default async function AssetsPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [assets, findings, impact, relationships] = await Promise.all([
      client.getAssets(),
      client.getFindings(),
      client.getImpact(),
      client.getRelationships(),
    ]);
    const rows = buildAssetDetails(assets, findings, impact, relationships);

    const typeCounts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
      return acc;
    }, {});
    const withFindings = rows.filter((r) => r.severityCounts.total > 0).length;
    const topImpact = rows.reduce((max, r) => Math.max(max, r.impactScore), 0);

    return (
      <>
        <h1>자산 ({rows.length})</h1>
        <p className="muted">
          스캔으로 수집된 모든 자산입니다. 자산은 도메인(SW 패키지·벤더·클라우드 리소스·서비스·웹)별
          속성과 걸린 발견, 그래프 전파 영향도를 가집니다. 영향도가 높은 자산부터 표시하며,
          행을 클릭하면 속성·위험 요약·발견 목록을 펼쳐 볼 수 있습니다.
        </p>

        {rows.length === 0 ? (
          <EmptyNotice message="자산이 없습니다. 스캔을 먼저 실행하세요." />
        ) : (
          <>
            <div className="cards">
              <StatCard label="전체 자산" value={rows.length} />
              <StatCard label="발견 보유 자산" value={withFindings} />
              <StatCard label="최고 영향도" value={topImpact} />
              {Object.entries(typeCounts).map(([type, count]) => (
                <StatCard
                  key={type}
                  label={ASSET_TYPE_LABEL[type] ?? type}
                  value={count}
                />
              ))}
            </div>

            <AssetsTable rows={rows} />
          </>
        )}
      </>
    );
  } catch (error) {
    return <ErrorNotice error={error} />;
  }
}
