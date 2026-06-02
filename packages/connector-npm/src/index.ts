import { readFile } from "node:fs/promises";
import { z } from "zod";
import { type Asset, newId, now } from "@omniguard/schema";

const SOURCE_ID = "connector-npm";
const ECOSYSTEM = "npm";

/** package.json 의존성 섹션만 검증 (외부 입력 → zod). */
const PackageJson = z
  .object({
    name: z.string().optional(),
    dependencies: z.record(z.string()).optional(),
    devDependencies: z.record(z.string()).optional(),
    optionalDependencies: z.record(z.string()).optional(),
  })
  .passthrough();

type DependencyScope = "prod" | "dev" | "optional";

interface ParsedDependency {
  name: string;
  range: string;
  version: string;
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
): ParsedDependency[] {
  if (!record) return [];
  const result: ParsedDependency[] = [];
  for (const [name, range] of Object.entries(record)) {
    const version = cleanVersion(range);
    if (version === null) continue; // git/file/workspace 등 비-semver 의존성은 건너뜀
    result.push({ name, range, version, scope });
  }
  return result;
}

/** package.json 경로를 읽어 software_component 자산 목록을 생성한다. */
export async function scanPackageJson(
  filePath: string,
  tenantId: string,
): Promise<Asset[]> {
  const raw = await readFile(filePath, "utf8");
  const pkg = PackageJson.parse(JSON.parse(raw));

  const deps: ParsedDependency[] = [
    ...collect(pkg.dependencies, "prod"),
    ...collect(pkg.devDependencies, "dev"),
    ...collect(pkg.optionalDependencies, "optional"),
  ];

  const timestamp = now();
  return deps.map((dep) => ({
    id: newId(),
    tenantId,
    firstSeen: timestamp,
    lastSeen: timestamp,
    sourceIds: [SOURCE_ID],
    name: dep.name,
    criticality: "MEDIUM",
    owner: null,
    tags: { scope: dep.scope, range: dep.range },
    attributes: {
      type: "software_component",
      purl: `pkg:${ECOSYSTEM}/${dep.name}@${dep.version}`,
      ecosystem: ECOSYSTEM,
      version: dep.version,
      licenses: [],
    },
  }));
}
