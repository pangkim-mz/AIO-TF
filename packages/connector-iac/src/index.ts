import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  type Asset,
  type AssetRelationship,
  type CloudProvider,
  newId,
  now,
} from "@omniguard/schema";

const SOURCE_ID = "connector-iac";
const DEFAULT_STACK_NAME = "terraform-stack";

// ── Terraform plan JSON 입력 스키마 (terraform show -json) ────
const TfResource = z
  .object({
    address: z.string(),
    type: z.string(),
    name: z.string(),
    provider_name: z.string().optional(),
    values: z.record(z.unknown()).optional(),
  })
  .passthrough();

interface TfModuleShape {
  resources?: z.infer<typeof TfResource>[];
  child_modules?: TfModuleShape[];
}
const TfModule: z.ZodType<TfModuleShape> = z.lazy(() =>
  z
    .object({
      resources: z.array(TfResource).optional(),
      child_modules: z.array(TfModule).optional(),
    })
    .passthrough(),
);

const TfPlan = z
  .object({
    planned_values: z
      .object({ root_module: TfModule })
      .passthrough()
      .optional(),
  })
  .passthrough();

/** 평가 단계로 넘길 정규화된 리소스 (값 보존). */
export interface ParsedResource {
  address: string; // 자연키
  type: string; // aws_s3_bucket 등
  provider: CloudProvider;
  values: Record<string, unknown>;
}

export interface IacScan {
  assets: Asset[];
  relationships: AssetRelationship[];
  resources: ParsedResource[];
}

export interface IacScanOptions {
  stackName?: string;
}

function providerFromType(type: string): CloudProvider {
  if (type.startsWith("google_")) return "gcp";
  if (type.startsWith("azurerm_") || type.startsWith("azuread_")) return "azure";
  return "aws";
}

/** root_module + child_modules를 재귀적으로 펼쳐 리소스를 수집한다. */
function collectResources(module: TfModuleShape): ParsedResource[] {
  const result: ParsedResource[] = [];
  for (const r of module.resources ?? []) {
    result.push({
      address: r.address,
      type: r.type,
      provider: providerFromType(r.type),
      values: r.values ?? {},
    });
  }
  for (const child of module.child_modules ?? []) {
    result.push(...collectResources(child));
  }
  return result;
}

/** Terraform plan JSON 텍스트를 파싱·검증해 리소스 목록을 반환한다. */
export function parseTerraformPlanContent(content: string): ParsedResource[] {
  const plan = TfPlan.parse(JSON.parse(content));
  const root = plan.planned_values?.root_module;
  return root ? collectResources(root) : [];
}

/** 리소스를 cloud_resource 자산으로 매핑하고, 스택→리소스 contains 엣지를 만든다. */
export function toScan(
  resources: ParsedResource[],
  tenantId: string,
  options: IacScanOptions = {},
): IacScan {
  const timestamp = now();
  const stackName = options.stackName ?? DEFAULT_STACK_NAME;

  const stack: Asset = {
    id: newId(),
    tenantId,
    firstSeen: timestamp,
    lastSeen: timestamp,
    sourceIds: [SOURCE_ID],
    name: stackName,
    criticality: "HIGH",
    owner: null,
    tags: { role: "stack" },
    attributes: {
      type: "cloud_resource",
      resourceId: `stack:${stackName}`,
      provider: "aws",
      resourceType: "terraform_stack",
      region: null,
    },
  };

  const assets: Asset[] = [stack];
  const relationships: AssetRelationship[] = [];

  for (const resource of resources) {
    const asset: Asset = {
      id: newId(),
      tenantId,
      firstSeen: timestamp,
      lastSeen: timestamp,
      sourceIds: [SOURCE_ID],
      name: resource.address,
      criticality: "MEDIUM",
      owner: null,
      tags: { resourceType: resource.type },
      attributes: {
        type: "cloud_resource",
        resourceId: resource.address,
        provider: resource.provider,
        resourceType: resource.type,
        region:
          typeof resource.values.region === "string"
            ? resource.values.region
            : null,
      },
    };
    assets.push(asset);
    relationships.push({
      id: newId(),
      tenantId,
      fromAssetId: stack.id,
      toAssetId: asset.id,
      type: "contains",
    });
  }

  return { assets, relationships, resources };
}

/** plan JSON 텍스트를 직접 받아 스캔한다 (API용). */
export function scanTerraformPlanContent(
  content: string,
  tenantId: string,
  options: IacScanOptions = {},
): IacScan {
  return toScan(parseTerraformPlanContent(content), tenantId, options);
}

/** plan JSON 파일을 읽어 스캔한다 (CLI용). */
export async function scanTerraformPlan(
  filePath: string,
  tenantId: string,
  options: IacScanOptions = {},
): Promise<IacScan> {
  const content = await readFile(filePath, "utf8");
  return scanTerraformPlanContent(content, tenantId, options);
}

export { evaluateIac } from "./evaluate";
