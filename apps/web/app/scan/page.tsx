import type { ReactNode } from "react";
import {
  GithubActionGuide,
  IacCommandGuide,
  IacScanForm,
  NpmScanForm,
  ServiceScanForm,
  VendorScanForm,
  WebScanForm,
} from "./forms";
import {
  scanIacAction,
  scanNpmAction,
  scanServiceAction,
  scanVendorAction,
  scanWebAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default function ScanPage(): ReactNode {
  return (
    <>
      <h1>스캔 실행</h1>
      <p className="muted">
        package.json 또는 벤더 인벤토리를 붙여넣어 스캔합니다. 결과는 현재 토큰의
        테넌트에 저장되고 대시보드에 반영됩니다.
      </p>
      <div className="scan-grid">
        <section>
          <h2>SW 공급망 (npm)</h2>
          <NpmScanForm action={scanNpmAction} />
        </section>
        <section>
          <h2>벤더 / 서드파티</h2>
          <VendorScanForm action={scanVendorAction} />
        </section>
        <section>
          <h2>클라우드 / 인프라 (IaC)</h2>
          <GithubActionGuide />
          <IacCommandGuide />
          <IacScanForm action={scanIacAction} />
        </section>
        <section>
          <h2>웹 노출 표면 (EASM / 웹 공급망)</h2>
          <p className="muted">
            URL을 넣으면 TLS·보안 헤더·노출 JS(→OSV 취약점)·SRI 누락을 점검합니다.
          </p>
          <WebScanForm action={scanWebAction} />
        </section>
        <section>
          <h2>서비스 토폴로지 (도메인 간 연결)</h2>
          <p className="muted">
            먼저 위 도메인들을 스캔해 자산을 만든 뒤, 서비스를 그 자산들에
            연결하세요. 서비스 영향도는 영향도 페이지에서 확인합니다.
          </p>
          <ServiceScanForm action={scanServiceAction} />
        </section>
      </div>
    </>
  );
}
