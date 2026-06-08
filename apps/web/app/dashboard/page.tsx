import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { summarize } from "../../lib/format";
import { buildFindingDetails } from "../../lib/findings";
import { EmptyNotice, ErrorNotice, StatCard } from "../components";
import { FindingsTable } from "../findings-table";

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [assets, findings, scores, impact] = await Promise.all([
      client.getAssets(),
      client.getFindings(),
      client.getScores(),
      client.getImpact(),
    ]);
    const summary = summarize(assets.length, findings, impact);
    const topFindings = buildFindingDetails(findings, assets, scores, impact).slice(0, 5);
    const topImpact = [...impact]
      .sort((a, b) => b.impactScore - a.impactScore)
      .slice(0, 5);

    return (
      <>
        <h1>대시보드</h1>
        <div className="cards">
          <StatCard label="자산" value={summary.assetCount} />
          <StatCard label="발견" value={summary.findingCount} />
          <StatCard label="Critical" value={summary.criticalCount} />
          <StatCard label="최고 영향도" value={summary.topImpact} />
          <StatCard label="리스크 상속 자산" value={summary.inheritedCount} />
        </div>

        <h2>상위 발견 (심각도순)</h2>
        <p className="muted">행을 클릭하면 설명·위험 점수 분해·영향 전파를 펼쳐 볼 수 있습니다.</p>
        {topFindings.length === 0 ? (
          <EmptyNotice message="발견이 없습니다. 스캔을 먼저 실행하세요." />
        ) : (
          <FindingsTable rows={topFindings} />
        )}

        <h2>상위 영향도 (그래프 전파)</h2>
        {topImpact.length === 0 ? (
          <EmptyNotice message="영향도 데이터가 없습니다." />
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">자산</th>
                <th scope="col" className="num">
                  영향도
                </th>
                <th scope="col">상속</th>
                <th scope="col">근원</th>
              </tr>
            </thead>
            <tbody>
              {topImpact.map((r) => (
                <tr key={r.assetId}>
                  <td>{r.asset}</td>
                  <td className="num">{r.impactScore}</td>
                  <td>{r.inherited ? "예" : "—"}</td>
                  <td>{r.rootCause ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  } catch (error) {
    return <ErrorNotice error={error} />;
  }
}
