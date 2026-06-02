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
  if (state.status === "success" && state.summary) {
    const s = state.summary;
    return (
      <p role="status" className="notice">
        완료: 자산 {s.assetCount} · 관계 {s.relationshipCount} · 발견{" "}
        {s.findingCount} · 최고점수 {s.topScore}.{" "}
        <a href="/">대시보드 보기 →</a>
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
