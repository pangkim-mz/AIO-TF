import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { newId } from "@omniguard/schema";
import { cleanVersion, scanPackageContent, scanPackageJson } from "../src/index";

const fixture = fileURLToPath(
  new URL("./fixtures/sample-package.json", import.meta.url),
);

describe("cleanVersion", () => {
  it("레인지 연산자를 제거하고 구체 버전을 추출한다", () => {
    expect(cleanVersion("^4.17.20")).toBe("4.17.20");
    expect(cleanVersion("~4.18.2")).toBe("4.18.2");
    expect(cleanVersion(">=2.0.0")).toBe("2.0.0");
  });

  it("semver가 없으면 null을 반환한다", () => {
    expect(cleanVersion("file:../local")).toBeNull();
    expect(cleanVersion("workspace:*")).toBeNull();
  });
});

describe("scanPackageJson", () => {
  it("prod/dev 의존성을 자산으로 변환하고 depends_on 엣지를 만든다", async () => {
    const tenantId = newId();
    const { assets, relationships } = await scanPackageJson(fixture, tenantId);

    const deps = assets.filter((a) => a.tags.role !== "application");
    const root = assets.find((a) => a.tags.role === "application");

    // local-pkg(file:)는 제외 → 의존성 3개 + 루트 1개
    expect(deps).toHaveLength(3);
    expect(root?.name).toBe("sample-app");

    const lodash = deps.find((a) => a.name === "lodash");
    expect(lodash?.tenantId).toBe(tenantId);
    expect(lodash?.tags.scope).toBe("prod");
    if (lodash?.attributes.type === "software_component") {
      expect(lodash.attributes.purl).toBe("pkg:npm/lodash@4.17.20");
      expect(lodash.attributes.version).toBe("4.17.20");
    }

    const vitest = deps.find((a) => a.name === "vitest");
    expect(vitest?.tags.scope).toBe("dev");

    // 루트 → 각 의존성 depends_on 엣지 3개
    expect(relationships).toHaveLength(3);
    expect(relationships.every((r) => r.fromAssetId === root?.id)).toBe(true);
    expect(relationships.every((r) => r.type === "depends_on")).toBe(true);
  });
});

describe("scanPackageContent", () => {
  const packageJson = JSON.stringify({
    name: "app",
    version: "1.0.0",
    dependencies: { lodash: "^4.17.20" },
  });

  it("npm lockfile 본문으로 정확한 버전을 해석한다", () => {
    const lockfile = JSON.stringify({
      lockfileVersion: 3,
      packages: { "": {}, "node_modules/lodash": { version: "4.17.21" } },
    });
    const scan = scanPackageContent({ packageJson, lockfile }, newId());

    const lodash = scan.assets.find((a) => a.name === "lodash");
    if (lodash?.attributes.type === "software_component") {
      expect(lodash.attributes.version).toBe("4.17.21");
    }
    expect(scan.relationships).toHaveLength(1);
  });

  it("lockfile이 없으면 레인지 근사치로 폴백한다", () => {
    const scan = scanPackageContent({ packageJson }, newId());
    const lodash = scan.assets.find((a) => a.name === "lodash");
    if (lodash?.attributes.type === "software_component") {
      expect(lodash.attributes.version).toBe("4.17.20");
    }
  });
});
