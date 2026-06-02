import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { newId } from "@omniguard/schema";
import { resolveInstalledVersions, scanPackageJson } from "../src/index";

function fixtureDir(name: string): string {
  return dirname(
    fileURLToPath(new URL(`./fixtures/${name}/package.json`, import.meta.url)),
  );
}

describe("resolveInstalledVersions", () => {
  it("package-lock.json에서 정확한 버전을 읽는다", async () => {
    const map = await resolveInstalledVersions(fixtureDir("npm-project"));
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("left-pad")).toBe("1.3.0");
  });

  it("pnpm-lock.yaml에서 peer 접미사를 제거하고 버전을 읽는다", async () => {
    const map = await resolveInstalledVersions(fixtureDir("pnpm-project"));
    expect(map.get("lodash")).toBe("4.17.21");
    expect(map.get("vitest")).toBe("2.1.9"); // peer 접미사 제거됨
  });

  it("lockfile이 없으면 빈 맵을 반환한다", async () => {
    const map = await resolveInstalledVersions(fixtureDir("."));
    expect(map.size).toBe(0);
  });
});

describe("scanPackageJson + lockfile", () => {
  it("npm 프로젝트는 레인지가 아닌 lockfile 버전을 사용한다", async () => {
    const assets = await scanPackageJson(
      `${fixtureDir("npm-project")}/package.json`,
      newId(),
    );
    const lodash = assets.find((a) => a.name === "lodash");
    expect(lodash?.tags.versionSource).toBe("lockfile");
    if (lodash?.attributes.type === "software_component") {
      // 레인지는 ^4.17.20 이지만 lockfile은 4.17.21
      expect(lodash.attributes.version).toBe("4.17.21");
      expect(lodash.attributes.purl).toBe("pkg:npm/lodash@4.17.21");
    }
  });

  it("lockfile이 없으면 레인지 근사치로 폴백한다", async () => {
    const assets = await scanPackageJson(
      `${fixtureDir("npm-project")}/../sample-package.json`,
      newId(),
    );
    const lodash = assets.find((a) => a.name === "lodash");
    expect(lodash?.tags.versionSource).toBe("range");
    if (lodash?.attributes.type === "software_component") {
      expect(lodash.attributes.version).toBe("4.17.20");
    }
  });
});
