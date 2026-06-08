import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { buildImpactDetails } from "../../lib/impact";
import { EmptyNotice, ErrorNotice } from "../components";
import { ImpactTable } from "../impact-table";

export const dynamic = "force-dynamic";

export default async function ImpactPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [impact, assets, relationships, findings] = await Promise.all([
      client.getImpact(),
      client.getAssets(),
      client.getRelationships(),
      client.getFindings(),
    ]);
    const rows = buildImpactDetails(impact, assets, relationships, findings);

    return (
      <>
        <h1>영향도 전파</h1>
        <p className="muted">
          의존성/관계를 따라 전파된 영향도. &quot;상속&quot;은 자체 리스크보다 하위
          자산에서 받은 리스크가 더 큰 경우입니다. 행을 클릭하면 자체↔전파 비교·근원
          경로·직접 발견을 펼쳐 볼 수 있습니다.
        </p>
        {rows.length === 0 ? (
          <EmptyNotice message="영향도 데이터가 없습니다." />
        ) : (
          <ImpactTable rows={rows} />
        )}
      </>
    );
  } catch (error) {
    return <ErrorNotice error={error} />;
  }
}
