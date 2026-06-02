import type { ReactNode } from "react";
import type { Criticality, Severity } from "@omniguard/schema";
import { ApiClientError } from "../lib/api";

export function StatCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}): ReactNode {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }): ReactNode {
  return <span className={`badge ${severity}`}>{severity}</span>;
}

export function CriticalityBadge({
  criticality,
}: {
  criticality: Criticality;
}): ReactNode {
  return <span className={`badge ${criticality}`}>{criticality}</span>;
}

export function ErrorNotice({ error }: { error: unknown }): ReactNode {
  const detail =
    error instanceof ApiClientError
      ? `${error.message} (${error.code}, ${error.status})`
      : error instanceof Error
        ? error.message
        : "알 수 없는 오류";
  return (
    <div role="alert" className="notice error">
      <p>데이터를 불러오지 못했습니다: {detail}</p>
      <p className="hint">
        API 서버가 실행 중인지 확인하세요(<code>pnpm serve</code>). 환경변수
        <code> API_BASE_URL</code> / <code>API_TOKEN</code>도 점검하세요.
      </p>
    </div>
  );
}

export function EmptyNotice({ message }: { message: string }): ReactNode {
  return <p className="muted">{message}</p>;
}
