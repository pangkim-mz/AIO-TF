import type { ReactNode } from "react";
import { serverClient } from "../../lib/server-client";
import { summarize } from "../../lib/format";
import { buildFindingDetails } from "../../lib/findings";
import { buildSecurityReportMarkdown } from "../../lib/report";
import { ErrorNotice } from "../components";
import { DownloadReportButton } from "./download-button";

export const dynamic = "force-dynamic";

export default async function ReportPage(): Promise<ReactNode> {
  const client = serverClient();
  try {
    const [assets, findings, scores, impact] = await Promise.all([
      client.getAssets(),
      client.getFindings(),
      client.getScores(),
      client.getImpact(),
    ]);

    const summary = summarize(assets.length, findings, impact);
    const findingDetails = buildFindingDetails(findings, assets, scores, impact);

    const now = new Date();
    const generatedAt = now.toLocaleString("ko-KR");
    const markdown = buildSecurityReportMarkdown({
      summary,
      findings: findingDetails,
      generatedAt,
    });
    const filename = `omniguard-report-${now.toISOString().slice(0, 10)}.md`;

    return (
      <>
        <h1>보안 점검 리포트</h1>
        <p className="muted">
          현재 점검 결과(자산·발견·위험 점수)를 마크다운 리포트로 내려받습니다.
          파일은 브라우저 기본 다운로드 폴더에 저장됩니다.
        </p>

        <div className="report-actions">
          <DownloadReportButton markdown={markdown} filename={filename} />
          <span className="muted">
            자산 {summary.assetCount} · 발견 {summary.findingCount} · 최고 영향도{" "}
            {summary.topImpact}/100
          </span>
        </div>

        <h2>미리보기</h2>
        <pre className="report-preview">{markdown}</pre>
      </>
    );
  } catch (error) {
    return <ErrorNotice error={error} />;
  }
}
