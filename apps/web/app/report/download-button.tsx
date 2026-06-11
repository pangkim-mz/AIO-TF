"use client";

import { useState, type ReactNode } from "react";

/** 마크다운 문자열을 .md 파일로 브라우저 다운로드시키는 버튼. */
export function DownloadReportButton({
  markdown,
  filename,
}: {
  markdown: string;
  filename: string;
}): ReactNode {
  const [done, setDone] = useState(false);

  const handleDownload = (): void => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };

  return (
    <button type="button" className="download-report" onClick={handleDownload}>
      {done ? "다운로드됨 ✓" : "보안점검결과 다운로드 (.md)"}
    </button>
  );
}
