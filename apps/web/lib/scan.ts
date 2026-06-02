import { ApiClientError, type NpmScanInput, type ScanSummary } from "./api";

/** 폼 제출 결과 상태 (useFormState용). */
export interface ScanState {
  status: "idle" | "success" | "error";
  message?: string;
  summary?: ScanSummary;
}

export const initialScanState: ScanState = { status: "idle" };

type NpmScanner = { scanNpm(input: NpmScanInput): Promise<ScanSummary> };
type VendorScanner = { scanVendor(inventory: string): Promise<ScanSummary> };

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
