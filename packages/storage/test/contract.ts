import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  type Asset,
  type AssetRelationship,
  type Finding,
  type RiskScore,
  newId,
  now,
} from "@omniguard/schema";
import type { Repository } from "../src/index";

function makeAsset(tenantId: string, name: string, version: string): Asset {
  const ts = now();
  return {
    id: newId(),
    tenantId,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["connector-npm"],
    name,
    criticality: "MEDIUM",
    owner: null,
    tags: {},
    attributes: {
      type: "software_component",
      purl: `pkg:npm/${name}@${version}`,
      ecosystem: "npm",
      version,
      licenses: [],
    },
  };
}

function makeFinding(tenantId: string, assetId: string, sfid: string): Finding {
  const ts = now();
  return {
    id: newId(),
    tenantId,
    firstSeen: ts,
    lastSeen: ts,
    sourceIds: ["enrich-osv"],
    assetId,
    category: "vulnerability",
    sourceFindingId: sfid,
    title: "t",
    description: "d",
    severity: "HIGH",
    cvss: null,
    status: "open",
    detectedAt: ts,
    resolvedAt: null,
    raw: {},
  };
}

function makeRel(
  tenantId: string,
  from: string,
  to: string,
): AssetRelationship {
  return {
    id: newId(),
    tenantId,
    fromAssetId: from,
    toAssetId: to,
    type: "depends_on",
  };
}

function makeScore(tenantId: string, findingId: string, score: number): RiskScore {
  return {
    id: newId(),
    tenantId,
    findingId,
    score,
    factors: [],
    scoringVersion: "1.0.0",
    computedAt: now(),
  };
}

/** 어댑터 무관 Repository 계약. 메모리/Postgres에 동일하게 적용한다. */
export function repositoryContract(
  name: string,
  makeRepo: () => Promise<Repository>,
): void {
  describe(`Repository 계약: ${name}`, () => {
    let repo: Repository;
    beforeEach(async () => {
      repo = await makeRepo();
    });
    afterEach(async () => {
      await repo.close();
    });

    it("자산 upsert 후 조회된다", async () => {
      const tenant = newId();
      await repo.upsertAssets(tenant, [makeAsset(tenant, "lodash", "4.17.21")]);
      const listed = await repo.listAssets(tenant);
      expect(listed).toHaveLength(1);
      expect(listed[0]!.name).toBe("lodash");
    });

    it("동일 자연키 재upsert는 멱등이며 id/firstSeen을 보존한다", async () => {
      const tenant = newId();
      const [first] = await repo.upsertAssets(tenant, [
        makeAsset(tenant, "lodash", "4.17.21"),
      ]);

      const again = makeAsset(tenant, "lodash", "4.17.21"); // 같은 purl, 다른 id
      again.tags = { updated: "yes" };
      const [second] = await repo.upsertAssets(tenant, [again]);

      const listed = await repo.listAssets(tenant);
      expect(listed).toHaveLength(1); // 중복 생성 안 됨
      expect(second!.id).toBe(first!.id); // id 보존
      expect(second!.firstSeen).toBe(first!.firstSeen); // firstSeen 보존
      expect(listed[0]!.tags.updated).toBe("yes"); // 나머지는 갱신
    });

    it("테넌트 간 데이터가 격리된다", async () => {
      const tenantA = newId();
      const tenantB = newId();
      await repo.upsertAssets(tenantA, [makeAsset(tenantA, "only-a", "1.0.0")]);

      expect(await repo.listAssets(tenantB)).toHaveLength(0);
      expect(await repo.listAssets(tenantA)).toHaveLength(1);
    });

    it("finding은 (assetId, sourceFindingId) 기준 멱등이다", async () => {
      const tenant = newId();
      const assetId = newId();
      await repo.upsertFindings(tenant, [
        makeFinding(tenant, assetId, "CVE-2024-0001"),
      ]);
      await repo.upsertFindings(tenant, [
        makeFinding(tenant, assetId, "CVE-2024-0001"),
      ]);
      expect(await repo.listFindings(tenant)).toHaveLength(1);
    });

    it("score는 findingId당 1개로 갱신된다", async () => {
      const tenant = newId();
      const findingId = newId();
      await repo.upsertScores(tenant, [makeScore(tenant, findingId, 50)]);
      await repo.upsertScores(tenant, [makeScore(tenant, findingId, 90)]);
      const scores = await repo.listScores(tenant);
      expect(scores).toHaveLength(1);
      expect(scores[0]!.score).toBe(90);
    });

    it("관계는 (from, to, type) 기준 멱등이며 테넌트 격리된다", async () => {
      const tenant = newId();
      const other = newId();
      const from = newId();
      const to = newId();
      await repo.upsertRelationships(tenant, [makeRel(tenant, from, to)]);
      await repo.upsertRelationships(tenant, [makeRel(tenant, from, to)]);

      const rels = await repo.listRelationships(tenant);
      expect(rels).toHaveLength(1); // 멱등
      expect(rels[0]!.fromAssetId).toBe(from);
      expect(await repo.listRelationships(other)).toHaveLength(0); // 격리
    });
  });
}
