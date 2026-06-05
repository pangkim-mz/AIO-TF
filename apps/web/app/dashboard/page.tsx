import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { sortFindingsBySeverity, summarize } from "../../lib/format";
import { EmptyNotice, ErrorNotice, SeverityBadge, StatCard } from "../components";

export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [assets, findings, impact] = await Promise.all([
      client.getAssets(),
      client.getFindings(),
      client.getImpact(),
    ]);
    const summary = summarize(assets.length, findings, impact);
    const topFindings = sortFindingsBySeverity(findings).slice(0, 5);
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
        {topFindings.length === 0 ? (
          <EmptyNotice message="발견이 없습니다. 스캔을 먼저 실행하세요." />
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">심각도</th>
                <th scope="col">분류</th>
                <th scope="col">발견 ID</th>
                <th scope="col">제목</th>
              </tr>
            </thead>
            <tbody>
              {topFindings.map((f) => (
                <tr key={f.id}>
                  <td>
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td>{f.category}</td>
                  <td>{f.sourceFindingId}</td>
                  <td>{f.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
