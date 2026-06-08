"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { type ScanState, initialScanState } from "../../lib/scan";

type ScanAction = (prev: ScanState, formData: FormData) => Promise<ScanState>;

function SubmitButton({ label }: { label: string }): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? "스캔 중…" : label}
    </button>
  );
}

function ScanResult({ state }: { state: ScanState }): ReactNode {
  if (state.status === "error") {
    return (
      <p role="alert" className="notice error">
        {state.message}
      </p>
    );
  }
  if (state.status === "success") {
    const text = state.summary
      ? `완료: 자산 ${state.summary.assetCount} · 관계 ${state.summary.relationshipCount} · 발견 ${state.summary.findingCount} · 최고점수 ${state.summary.topScore}.`
      : (state.message ?? "완료.");
    return (
      <p role="status" className="notice">
        {text} <a href="/dashboard">대시보드 보기 →</a>
      </p>
    );
  }
  return null;
}

export function NpmScanForm({ action }: { action: ScanAction }): ReactNode {
  const [state, formAction] = useFormState(action, initialScanState);
  return (
    <form action={formAction} className="scan-form">
      <label htmlFor="npm-pkg">package.json</label>
      <textarea
        id="npm-pkg"
        name="packageJson"
        rows={8}
        placeholder='{ "name": "app", "version": "1.0.0", "dependencies": { "lodash": "^4.17.20" } }'
      />
      <label htmlFor="npm-lock">lockfile (선택 — 정확한 버전 해석)</label>
      <textarea id="npm-lock" name="lockfile" rows={5} />
      <label htmlFor="npm-locktype">lockfile 유형</label>
      <select id="npm-locktype" name="lockfileType" defaultValue="">
        <option value="">자동 감지</option>
        <option value="npm">npm (package-lock.json)</option>
        <option value="pnpm">pnpm (pnpm-lock.yaml)</option>
      </select>
      <SubmitButton label="SW 공급망 스캔" />
      <ScanResult state={state} />
    </form>
  );
}

export function IacScanForm({ action }: { action: ScanAction }): ReactNode {
  const [state, formAction] = useFormState(action, initialScanState);
  return (
    <form action={formAction} className="scan-form">
      <label htmlFor="iac-stack">스택 이름 (선택)</label>
      <input id="iac-stack" name="stackName" placeholder="terraform-stack" />
      <label htmlFor="iac-plan">Terraform plan JSON (terraform show -json)</label>
      <textarea
        id="iac-plan"
        name="plan"
        rows={12}
        placeholder='{ "planned_values": { "root_module": { "resources": [ ... ] } } }'
      />
      <SubmitButton label="IaC 스캔" />
      <ScanResult state={state} />
    </form>
  );
}

export function ServiceScanForm({ action }: { action: ScanAction }): ReactNode {
  const [state, formAction] = useFormState(action, initialScanState);
  return (
    <form action={formAction} className="scan-form">
      <label htmlFor="svc-manifest">
        서비스 매니페스트 (기존 자산을 패키지/클라우드/벤더에 연결)
      </label>
      <textarea
        id="svc-manifest"
        name="manifest"
        rows={12}
        placeholder={
          "services:\n  - name: Checkout API\n    key: checkout-api\n    dependsOn: [pkg:npm/lodash@4.17.21]\n    hostedOn: [aws_db_instance.main]\n    providedBy: [acme.com]"
        }
      />
      <SubmitButton label="서비스 토폴로지 연결" />
      <ScanResult state={state} />
    </form>
  );
}

export function WebScanForm({
  action,
  compact = false,
}: {
  action: ScanAction;
  compact?: boolean;
}): ReactNode {
  const [state, formAction] = useFormState(action, initialScanState);
  return (
    <form action={formAction} className={compact ? "scan-form scan-form-inline" : "scan-form"}>
      {!compact && <label htmlFor="web-url">점검할 URL</label>}
      <div className={compact ? "inline-field" : undefined}>
        <input
          id="web-url"
          name="url"
          type="text"
          inputMode="url"
          placeholder="https://example.com"
          aria-label="점검할 URL"
        />
        <SubmitButton label={compact ? "URL 보안 점검" : "웹 점검"} />
      </div>
      <ScanResult state={state} />
    </form>
  );
}

export function VendorScanForm({ action }: { action: ScanAction }): ReactNode {
  const [state, formAction] = useFormState(action, initialScanState);
  return (
    <form action={formAction} className="scan-form">
      <label htmlFor="vendor-inv">벤더 인벤토리 (YAML 또는 JSON)</label>
      <textarea
        id="vendor-inv"
        name="inventory"
        rows={12}
        placeholder={
          "vendors:\n  - name: Acme\n    domain: acme.com\n    requiredCertifications: [SOC2]\n    certifications: []"
        }
      />
      <SubmitButton label="벤더 스캔" />
      <ScanResult state={state} />
    </form>
  );
}
