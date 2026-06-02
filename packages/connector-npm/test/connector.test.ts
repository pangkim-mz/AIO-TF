import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { newId } from "@omniguard/schema";
import { cleanVersion, scanPackageJson } from "../src/index";

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
  it("prod/dev 의존성을 자산으로 변환한다", async () => {
    const tenantId = newId();
    const assets = await scanPackageJson(fixture, tenantId);

    // local-pkg(file:)는 제외 → 3개
    expect(assets).toHaveLength(3);

    const lodash = assets.find((a) => a.name === "lodash");
    expect(lodash).toBeDefined();
    expect(lodash?.tenantId).toBe(tenantId);
    expect(lodash?.tags.scope).toBe("prod");
    if (lodash?.attributes.type === "software_component") {
      expect(lodash.attributes.purl).toBe("pkg:npm/lodash@4.17.20");
      expect(lodash.attributes.version).toBe("4.17.20");
    }

    const vitest = assets.find((a) => a.name === "vitest");
    expect(vitest?.tags.scope).toBe("dev");
  });
});
