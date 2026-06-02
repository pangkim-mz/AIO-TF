import {
  ApiClientError,
  type IacScanInput,
  type NpmScanInput,
  type ScanSummary,
  type ServiceSummary,
} from "./api";

/** 폼 제출 결과 상태 (useFormState용). */
export interface ScanState {
  status: "idle" | "success" | "error";
  message?: string;
  summary?: ScanSummary;
}

export const initialScanState: ScanState = { status: "idle" };

type NpmScanner = { scanNpm(input: NpmScanInput): Promise<ScanSummary> };
type VendorScanner = { scanVendor(inventory: string): Promise<ScanSummary> };
type IacScanner = { scanIac(input: IacScanInput): Promise<ScanSummary> };
type ServiceScanner = { scanService(manifest: string): Promise<ServiceSummary> };

function toErrorState(error: unknown): ScanState {
  if (error instanceof ApiClientError) {
    return { status: "error", message: `${error.message} (${error.code})` };
  }
  if (error instanceof Error) {
    return { status: "error", message: error.message };
  }
  return { status: "error", message: "알 수 없는 오류" };
}

export async function performNpmScan(
  client: NpmScanner,
  input: NpmScanInput,
): Promise<ScanState> {
  if (input.packageJson.trim() === "") {
    return { status: "error", message: "package.json 내용을 입력하세요." };
  }
  try {
    const summary = await client.scanNpm(input);
    return { status: "success", summary };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function performVendorScan(
  client: VendorScanner,
  inventory: string,
): Promise<ScanState> {
  if (inventory.trim() === "") {
    return { status: "error", message: "인벤토리 내용을 입력하세요." };
  }
  try {
    const summary = await client.scanVendor(inventory);
    return { status: "success", summary };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function performIacScan(
  client: IacScanner,
  plan: string,
  stackName?: string,
): Promise<ScanState> {
  if (plan.trim() === "") {
    return { status: "error", message: "Terraform plan JSON을 입력하세요." };
  }
  try {
    const summary = await client.scanIac({
      plan,
      stackName: stackName?.trim() || undefined,
    });
    return { status: "success", summary };
  } catch (error) {
    return toErrorState(error);
  }
}

export async function performServiceScan(
  client: ServiceScanner,
  manifest: string,
): Promise<ScanState> {
  if (manifest.trim() === "") {
    return { status: "error", message: "서비스 매니페스트를 입력하세요." };
  }
  try {
    const s = await client.scanService(manifest);
    const note = s.unresolved.length ? ` (미해결 ${s.unresolved.length}건)` : "";
    return {
      status: "success",
      message: `서비스 ${s.serviceCount}개 · 교차 엣지 ${s.edgeCount}개 연결${note}`,
    };
  } catch (error) {
    return toErrorState(error);
  }
}
