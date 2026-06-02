import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { newId } from "@omniguard/schema";
import {
  evaluateIac,
  parseTerraformPlanContent,
  scanTerraformPlan,
} from "../src/index";

const fixture = fileURLToPath(new URL("./fixtures/plan.json", import.meta.url));

describe("parseTerraformPlanContent", () => {
  it("root_module + child_modules의 리소스를 재귀 수집한다", async () => {
    const { readFile } = await import("node:fs/promises");
    const resources = parseTerraformPlanContent(await readFile(fixture, "utf8"));
    expect(resources).toHaveLength(4);
    const addresses = resources.map((r) => r.address);
    expect(addresses).toContain("module.network.aws_db_instance.main");
  });

  it("type 접두사로 provider를 추론한다", async () => {
    const resources = parseTerraformPlanContent(
      JSON.stringify({
        planned_values: {
          root_module: {
            resources: [
              { address: "google_storage_bucket.x", type: "google_storage_bucket", name: "x", values: {} },
            ],
          },
        },
      }),
    );
    expect(resources[0]!.provider).toBe("gcp");
  });
});

describe("scanTerraformPlan", () => {
  it("스택 자산 + 리소스 자산 + contains 엣지를 만든다", async () => {
    const scan = await scanTerraformPlan(fixture, newId(), { stackName: "prod" });
    expect(scan.assets).toHaveLength(5); // 스택 1 + 리소스 4
    const stack = scan.assets.find((a) => a.tags.role === "stack");
    expect(stack?.name).toBe("prod");
    expect(scan.relationships).toHaveLength(4);
    expect(scan.relationships.every((r) => r.type === "contains")).toBe(true);
    expect(scan.relationships.every((r) => r.fromAssetId === stack?.id)).toBe(true);
  });
});

describe("evaluateIac", () => {
  it("미설정 규칙으로 misconfiguration Finding을 생성한다", async () => {
    const tenantId = newId();
    const scan = await scanTerraformPlan(fixture, tenantId);
    const findings = evaluateIac(scan.assets, scan.resources, tenantId);

    const ids = findings.map((f) => f.sourceFindingId).sort();
    expect(ids).toEqual([
      "IAC-NO-ENCRYPTION",
      "IAC-PUBLIC-ACCESS",
      "IAC-S3-PUBLIC-ACL",
      "IAC-SG-OPEN-INGRESS",
    ]);
    expect(findings.every((f) => f.category === "misconfiguration")).toBe(true);

    const enc = findings.find((f) => f.sourceFindingId === "IAC-NO-ENCRYPTION");
    expect(enc?.severity).toBe("MEDIUM");
    const s3 = findings.find((f) => f.sourceFindingId === "IAC-S3-PUBLIC-ACL");
    expect(s3?.severity).toBe("HIGH");

    // private 버킷은 Finding을 만들지 않는다
    expect(findings.filter((f) => f.sourceFindingId === "IAC-S3-PUBLIC-ACL")).toHaveLength(1);
  });
});
