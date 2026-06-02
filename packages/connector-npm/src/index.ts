import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import {
  type Asset,
  type AssetRelationship,
  newId,
  now,
} from "@omniguard/schema";
import {
  resolveInstalledVersions,
  resolveVersionsFromLockfile,
  type LockfileType,
  type VersionSource,
} from "./lockfile";

export {
  resolveInstalledVersions,
  resolveVersionsFromLockfile,
  type LockfileType,
  type VersionSource,
} from "./lockfile";

const SOURCE_ID = "connector-npm";
const ECOSYSTEM = "npm";

/** package.json 의존성 섹션만 검증 (외부 입력 → zod). */
const PackageJson = z
  .object({
    name: z.string().optional(),
    version: z.string().optional(),
    dependencies: z.record(z.string()).optional(),
    devDependencies: z.record(z.string()).optional(),
    optionalDependencies: z.record(z.string()).optional(),
  })
  .passthrough();

/** package.json 스캔 결과: 자산(루트 앱 + 의존성) + 의존 관계 엣지. */
export interface PackageScan {
  assets: Asset[];
  relationships: AssetRelationship[];
}

type DependencyScope = "prod" | "dev" | "optional";

interface DeclaredDependency {
  name: string;
  range: string;
  scope: DependencyScope;
}

const SEMVER_RE = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/;

/**
 * package.json의 버전 레인지에서 조회 가능한 구체 버전을 추출한다.
 * (예: "^4.17.20" → "4.17.20"). lockfile 미사용으로 근사치이며,
 * 정확한 설치 버전은 추후 pnpm-lock.yaml/node_modules 연동으로 보완.
 */
export function cleanVersion(range: string): string | null {
  const match = range.match(SEMVER_RE);
  return match ? match[0] : null;
}

function collect(
  record: Record<string, string> | undefined,
  scope: DependencyScope,
): DeclaredDependency[] {
  if (!record) return [];
  return Object.entries(record).map(([name, range]) => ({ name, range, scope }));
}

/**
 * package.json 경로를 읽어 자산(루트 앱 + 의존성)과 의존 관계를 생성한다.
 * 인접한 lockfile(package-lock.json/pnpm-lock.yaml)을 자동 탐지해 정확한 버전을 해석한다.
 */
export async function scanPackageJson(
  filePath: string,
  tenantId: string,
): Promise<PackageScan> {
  const raw = await readFile(filePath, "utf8");
  const pkg = PackageJson.parse(JSON.parse(raw));
  const installed = await resolveInstalledVersions(dirname(filePath));
  return buildScan(pkg, installed, tenantId);
}

export interface PackageContentInput {
  packageJson: string;
  lockfile?: string;
  lockfileType?: LockfileType;
}

/**
 * package.json/lockfile 텍스트를 직접 받아 스캔한다 (파일시스템 미사용, API용).
 * lockfileType 미지정 시 본문 형태로 추정('{' 시작이면 npm, 아니면 pnpm).
 */
export function scanPackageContent(
  input: PackageContentInput,
  tenantId: string,
): PackageScan {
  const pkg = PackageJson.parse(JSON.parse(input.packageJson));
  let installed = new Map<string, string>();
  if (input.lockfile !== undefined && input.lockfile.trim() !== "") {
    const type =
      input.lockfileType ??
      (input.lockfile.trimStart().startsWith("{") ? "npm" : "pnpm");
    installed = resolveVersionsFromLockfile(input.lockfile, type);
  }
  return buildScan(pkg, installed, tenantId);
}

/** 파싱된 package.json + 설치 버전 맵으로 자산/관계를 구성하는 공통 로직. */
function buildScan(
  pkg: z.infer<typeof PackageJson>,
  installed: Map<string, string>,
  tenantId: string,
): PackageScan {
  const deps: DeclaredDependency[] = [
    ...collect(pkg.dependencies, "prod"),
    ...collect(pkg.devDependencies, "dev"),
    ...collect(pkg.optionalDependencies, "optional"),
  ];

  const timestamp = now();

  // 루트 애플리케이션 자산 (스캔 대상 프로젝트 자체)
  const rootName = pkg.name ?? "application";
  const rootVersion = pkg.version ?? "0.0.0";
  const root: Asset = {
    id: newId(),
    tenantId,
    firstSeen: timestamp,
    lastSeen: timestamp,
    sourceIds: [SOURCE_ID],
    name: rootName,
    criticality: "HIGH", // 애플리케이션은 기본 중요도 높음
    owner: null,
    tags: { role: "application" },
    attributes: {
      type: "software_component",
      purl: `pkg:${ECOSYSTEM}/${rootName}@${rootVersion}`,
      ecosystem: ECOSYSTEM,
      version: rootVersion,
      licenses: [],
    },
  };

  const assets: Asset[] = [root];
  const relationships: AssetRelationship[] = [];

  for (const dep of deps) {
    const locked = installed.get(dep.name);
    const version = locked ?? cleanVersion(dep.range);
    if (version === null) continue; // 버전을 특정할 수 없는 의존성은 건너뜀
    const versionSource: VersionSource = locked ? "lockfile" : "range";

    const depAsset: Asset = {
      id: newId(),
      tenantId,
      firstSeen: timestamp,
      lastSeen: timestamp,
      sourceIds: [SOURCE_ID],
      name: dep.name,
      criticality: "MEDIUM",
      owner: null,
      tags: { scope: dep.scope, range: dep.range, versionSource },
      attributes: {
        type: "software_component",
        purl: `pkg:${ECOSYSTEM}/${dep.name}@${version}`,
        ecosystem: ECOSYSTEM,
        version,
        licenses: [],
      },
    };
    assets.push(depAsset);
    relationships.push({
      id: newId(),
      tenantId,
      fromAssetId: root.id,
      toAssetId: depAsset.id,
      type: "depends_on",
    });
  }

  return { assets, relationships };
}
