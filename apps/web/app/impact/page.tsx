import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { EmptyNotice, ErrorNotice } from "../components";

export const dynamic = "force-dynamic";

export default async function ImpactPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const impact = await client.getImpact();
    const sorted = [...impact].sort((a, b) => b.impactScore - a.impactScore);

    return (
      <>
        <h1>영향도 전파</h1>
        <p className="muted">
          의존성/관계를 따라 전파된 영향도. &quot;상속&quot;은 자체 리스크보다 하위
          자산에서 받은 리스크가 더 큰 경우입니다.
        </p>
        {sorted.length === 0 ? (
          <EmptyNotice message="영향도 데이터가 없습니다." />
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">자산</th>
                <th scope="col" className="num">
                  직접 점수
                </th>
                <th scope="col" className="num">
                  영향도 점수
                </th>
                <th scope="col">상속</th>
                <th scope="col">근원(Root Cause)</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.assetId}>
                  <td>{r.asset}</td>
                  <td className="num">{r.ownScore}</td>
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
