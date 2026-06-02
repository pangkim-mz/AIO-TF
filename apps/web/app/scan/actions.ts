"use server";

import { revalidatePath } from "next/cache";
import { serverClient } from "../../lib/server-client";
import {
  type ScanState,
  performIacScan,
  performNpmScan,
  performServiceScan,
  performVendorScan,
} from "../../lib/scan";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function scanNpmAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const lockfileType = field(formData, "lockfileType");
  const state = await performNpmScan(serverClient(), {
    packageJson: field(formData, "packageJson"),
    lockfile: field(formData, "lockfile").trim() || undefined,
    lockfileType:
      lockfileType === "npm" || lockfileType === "pnpm"
        ? lockfileType
        : undefined,
  });
  if (state.status === "success") revalidateViews();
  return state;
}

export async function scanVendorAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const state = await performVendorScan(
    serverClient(),
    field(formData, "inventory"),
  );
  if (state.status === "success") revalidateViews();
  return state;
}

export async function scanIacAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const state = await performIacScan(
    serverClient(),
    field(formData, "plan"),
    field(formData, "stackName") || undefined,
  );
  if (state.status === "success") revalidateViews();
  return state;
}

export async function scanServiceAction(
  _prev: ScanState,
  formData: FormData,
): Promise<ScanState> {
  const state = await performServiceScan(
    serverClient(),
    field(formData, "manifest"),
  );
  if (state.status === "success") revalidateViews();
  return state;
}

/** 스캔 성공 후 조회 페이지 캐시를 무효화한다. */
function revalidateViews(): void {
  for (const path of ["/", "/assets", "/findings", "/impact"]) {
    revalidatePath(path);
  }
}
