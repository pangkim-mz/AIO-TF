import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { buildFindingDetails } from "../../lib/findings";
import { EmptyNotice, ErrorNotice } from "../components";
import { FindingsTable } from "../findings-table";

export const dynamic = "force-dynamic";

export default async function FindingsPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [findings, assets, scores, impact] = await Promise.all([
      client.getFindings(),
      client.getAssets(),
      client.getScores(),
      client.getImpact(),
    ]);
    const rows = buildFindingDetails(findings, assets, scores, impact);

    return (
      <>
        <h1>발견 ({findings.length})</h1>
        <p className="muted">행을 클릭하면 설명·위험 점수 분해·영향 전파를 펼쳐 볼 수 있습니다.</p>
        {rows.length === 0 ? (
          <EmptyNotice message="발견이 없습니다. 스캔을 먼저 실행하세요." />
        ) : (
          <FindingsTable rows={rows} />
        )}
      </>
    );
  } catch (error) {
    return <ErrorNotice error={error} />;
  }
}
