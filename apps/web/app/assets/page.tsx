import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { assetIdentifier } from "../../lib/format";
import { EmptyNotice, ErrorNotice } from "../components";

export const dynamic = "force-dynamic";

export default async function AssetsPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const assets = await client.getAssets();
    return (
      <>
        <h1>자산 ({assets.length})</h1>
        {assets.length === 0 ? (
          <EmptyNotice message="자산이 없습니다. 스캔을 먼저 실행하세요." />
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">이름</th>
                <th scope="col">유형</th>
                <th scope="col">식별자</th>
                <th scope="col">중요도</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{a.attributes.type}</td>
                  <td className="muted">{assetIdentifier(a)}</td>
                  <td>{a.criticality}</td>
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
