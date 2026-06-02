import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { sortFindingsBySeverity } from "../../lib/format";
import { EmptyNotice, ErrorNotice, SeverityBadge } from "../components";

export const dynamic = "force-dynamic";

export default async function FindingsPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [findings, assets] = await Promise.all([
      client.getFindings(),
      client.getAssets(),
    ]);
    const nameById = new Map(assets.map((a) => [a.id, a.name]));
    const sorted = sortFindingsBySeverity(findings);

    return (
      <>
        <h1>발견 ({findings.length})</h1>
        {sorted.length === 0 ? (
          <EmptyNotice message="발견이 없습니다. 스캔을 먼저 실행하세요." />
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">심각도</th>
                <th scope="col">분류</th>
                <th scope="col">자산</th>
                <th scope="col">발견 ID</th>
                <th scope="col">제목</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((f) => (
                <tr key={f.id}>
                  <td>
                    <SeverityBadge severity={f.severity} />
                  </td>
                  <td>{f.category}</td>
                  <td>{nameById.get(f.assetId) ?? f.assetId}</td>
                  <td>{f.sourceFindingId}</td>
                  <td>{f.title}</td>
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
