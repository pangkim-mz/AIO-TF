import { readFile } from "node:fs/promises";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import {
  type Asset,
  type AssetRelationship,
  Criticality,
  newId,
  now,
} from "@omniguard/schema";

const SOURCE_ID = "connector-service";

// ── 서비스 매니페스트 입력 (외부 입력 → zod) ─────────────────
export const ServiceEntry = z.object({
  name: z.string(),
  key: z.string(), // 자연키 (슬러그)
  criticality: Criticality.optional(),
  dependsOn: z.array(z.string()).default([]), // software_component (purl 또는 이름)
  hostedOn: z.array(z.string()).default([]), // cloud_resource (resourceId)
  providedBy: z.array(z.string()).default([]), // vendor (domain)
});
export type ServiceEntry = z.infer<typeof ServiceEntry>;

const ServiceManifest = z.object({ services: z.array(ServiceEntry) });

export interface Topology {
  /** 신규 service 자산. */
  assets: Asset[];
  /** 서비스 → 기존 자산 교차 도메인 엣지. */
  relationships: AssetRelationship[];
  /** 매칭되는 기존 자산을 찾지 못한 참조 (가시성을 위해 보고). */
  unresolved: string[];
}

export function parseServiceManifestContent(content: string): ServiceEntry[] {
  const data: unknown = parseYaml(content);
  return ServiceManifest.parse(data).services;
}

export async function parseServiceManifest(
  filePath: string,
): Promise<ServiceEntry[]> {
  return parseServiceManifestContent(await readFile(filePath, "utf8"));
}

/** 기존 자산을 자연키로 조회하기 위한 인덱스. */
interface AssetIndex {
  byPurl: Map<string, Asset>;
  byName: Map<string, Asset>;
  byResourceId: Map<string, Asset>;
  byDomain: Map<string, Asset>;
}

function indexAssets(assets: readonly Asset[]): AssetIndex {
  const index: AssetIndex = {
    byPurl: new Map(),
    byName: new Map(),
    byResourceId: new Map(),
    byDomain: new Map(),
  };
  for (const asset of assets) {
    switch (asset.attributes.type) {
      case "software_component":
        index.byPurl.set(asset.attributes.purl, asset);
        index.byName.set(asset.name, asset);
        break;
      case "cloud_resource":
        index.byResourceId.set(asset.attributes.resourceId, asset);
        break;
      case "vendor":
        index.byDomain.set(asset.attributes.domain, asset);
        break;
      case "service":
        break;
    }
  }
  return index;
}

/**
 * 서비스 매니페스트와 기존 자산으로부터 service 자산과 교차 도메인 엣지를 만든다.
 * 엣지 방향은 service -[type]-> target(=서비스가 target에 영향받음)이라
 * 리스크가 각 도메인 자산 → 서비스로 전파된다(서비스 단위 통합 리스크).
 */
export function buildTopology(
  entries: readonly ServiceEntry[],
  existingAssets: readonly Asset[],
  tenantId: string,
): Topology {
  const index = indexAssets(existingAssets);
  const timestamp = now();

  const assets: Asset[] = [];
  const relationships: AssetRelationship[] = [];
  const unresolved: string[] = [];

  for (const entry of entries) {
    const service: Asset = {
      id: newId(),
      tenantId,
      firstSeen: timestamp,
      lastSeen: timestamp,
      sourceIds: [SOURCE_ID],
      name: entry.name,
      criticality: entry.criticality ?? "HIGH",
      owner: null,
      tags: { role: "service" },
      attributes: { type: "service", key: entry.key },
    };
    assets.push(service);

    const link = (
      target: Asset | undefined,
      ref: string,
      type: AssetRelationship["type"],
    ): void => {
      if (!target) {
        unresolved.push(ref);
        return;
      }
      relationships.push({
        id: newId(),
        tenantId,
        fromAssetId: service.id,
        toAssetId: target.id,
        type,
      });
    };

    for (const ref of entry.dependsOn) {
      link(index.byPurl.get(ref) ?? index.byName.get(ref), ref, "depends_on");
    }
    for (const ref of entry.hostedOn) {
      link(index.byResourceId.get(ref), ref, "hosted_on");
    }
    for (const ref of entry.providedBy) {
      link(index.byDomain.get(ref), ref, "provided_by");
    }
  }

  return { assets, relationships, unresolved };
}
