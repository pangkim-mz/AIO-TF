import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { buildServiceViews, DOMAIN_LABEL } from "../../lib/services";
import { CriticalityBadge, EmptyNotice, ErrorNotice } from "../components";

export const dynamic = "force-dynamic";

export default async function ServicesPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [assets, relationships, impact] = await Promise.all([
      client.getAssets(),
      client.getRelationships(),
      client.getImpact(),
    ]);
    const views = buildServiceViews(assets, relationships, impact);

    return (
      <>
        <h1>서비스 통합 리스크</h1>
        <p className="muted">
          서비스가 의존하는 소프트웨어·클라우드·벤더 자산의 리스크가 그래프 전파로
          하나의 서비스 영향도로 합쳐집니다. 영향도가 높은 서비스부터 표시합니다.
        </p>

        {views.length === 0 ? (
          <EmptyNotice message="서비스가 없습니다. 스캔(서비스 매니페스트)을 먼저 실행하세요." />
        ) : (
          views.map((view) => (
            <section key={view.serviceId} className="service" aria-label={view.name}>
              <h2>
                {view.name} <CriticalityBadge criticality={view.criticality} />
              </h2>
              <div className="cards">
                <div className="card">
                  <div className="label">통합 영향도</div>
                  <div className="value">{view.impactScore}</div>
                </div>
                <div className="card">
                  <div className="label">직접 점수</div>
                  <div className="value">{view.ownScore}</div>
                </div>
                <div className="card">
                  <div className="label">리스크 근원</div>
                  <div className="value">{view.rootCause ?? "—"}</div>
                </div>
              </div>

              <p className="muted">
                의존: 소프트웨어 {view.counts.software} · 클라우드 {view.counts.cloud}{" "}
                · 벤더 {view.counts.vendor}
              </p>

              {view.dependencies.length === 0 ? (
                <EmptyNotice message="연결된 자산이 없습니다(매니페스트의 참조가 기존 자산과 매칭되지 않았을 수 있습니다)." />
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th scope="col">도메인</th>
                      <th scope="col">자산</th>
                      <th scope="col" className="num">
                        영향도
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.dependencies.map((dep) => (
                      <tr key={dep.assetId}>
                        <td>{DOMAIN_LABEL[dep.domain]}</td>
                        <td>{dep.name}</td>
                        <td className="num">{dep.impactScore}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))
        )}
      </>
    );
  } catch (error) {
    return <ErrorNotice error={error} />;
  }
}
