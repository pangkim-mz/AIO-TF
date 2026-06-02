import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parse as parseYaml } from "yaml";

export type VersionSource = "lockfile" | "range";

/** 우선순위 순서 — 먼저 발견된 lockfile을 사용한다. */
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml"] as const;

/** pnpm 버전 문자열의 peer 접미사 제거: "2.1.9(react@18)" → "2.1.9". */
function stripPeerSuffix(version: string): string {
  const paren = version.indexOf("(");
  return paren === -1 ? version : version.slice(0, paren);
}

// ── npm package-lock.json ────────────────────────────────────
const NpmLock = z
  .object({
    // lockfileVersion 2/3
    packages: z.record(z.object({ version: z.string().optional() }).passthrough()).optional(),
    // lockfileVersion 1
    dependencies: z
      .record(z.object({ version: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

function parseNpmLock(content: string): Map<string, string> {
  const lock = NpmLock.parse(JSON.parse(content));
  const result = new Map<string, string>();

  if (lock.packages) {
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path === "" || entry.version === undefined) continue;
      // 직접 의존성만: "node_modules/<name>" (중첩 경로는 제외)
      const match = path.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)$/);
      if (match) result.set(match[1]!, entry.version);
    }
  } else if (lock.dependencies) {
    for (const [name, entry] of Object.entries(lock.dependencies)) {
      if (entry.version !== undefined) result.set(name, entry.version);
    }
  }
  return result;
}

// ── pnpm-lock.yaml ───────────────────────────────────────────
const PnpmDepEntry = z.union([
  z.string(),
  z.object({ version: z.string() }).passthrough(),
]);
const PnpmImporter = z
  .object({
    dependencies: z.record(PnpmDepEntry).optional(),
    devDependencies: z.record(PnpmDepEntry).optional(),
    optionalDependencies: z.record(PnpmDepEntry).optional(),
  })
  .passthrough();
const PnpmLock = z
  .object({
    importers: z.record(PnpmImporter).optional(),
    // 단일 패키지(루트) 형식
    dependencies: z.record(PnpmDepEntry).optional(),
    devDependencies: z.record(PnpmDepEntry).optional(),
    optionalDependencies: z.record(PnpmDepEntry).optional(),
  })
  .passthrough();

function collectPnpm(
  record: Record<string, z.infer<typeof PnpmDepEntry>> | undefined,
  out: Map<string, string>,
): void {
  if (!record) return;
  for (const [name, entry] of Object.entries(record)) {
    const version = typeof entry === "string" ? entry : entry.version;
    out.set(name, stripPeerSuffix(version));
  }
}

function parsePnpmLock(content: string): Map<string, string> {
  const lock = PnpmLock.parse(parseYaml(content));
  const result = new Map<string, string>();

  const importer = lock.importers?.["."];
  if (importer) {
    collectPnpm(importer.dependencies, result);
    collectPnpm(importer.devDependencies, result);
    collectPnpm(importer.optionalDependencies, result);
  } else {
    collectPnpm(lock.dependencies, result);
    collectPnpm(lock.devDependencies, result);
    collectPnpm(lock.optionalDependencies, result);
  }
  return result;
}

async function readIfExists(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null; // 파일 없음 → 다음 lockfile 시도
  }
}

/**
 * package.json 디렉터리에서 lockfile을 찾아 직접 의존성의 정확한 설치 버전을
 * name → version 맵으로 반환한다. lockfile이 없으면 빈 맵.
 */
export async function resolveInstalledVersions(
  dir: string,
): Promise<Map<string, string>> {
  for (const lockfile of LOCKFILES) {
    const content = await readIfExists(join(dir, lockfile));
    if (content === null) continue;
    return lockfile === "package-lock.json"
      ? parseNpmLock(content)
      : parsePnpmLock(content);
  }
  return new Map();
}
