import {
  type Asset,
  type AssetRelationship,
  type Finding,
  type Severity,
  newId,
} from "@omniguard/schema";
import { resolve4, resolveCname } from "node:dns/promises";
import { makeFinding, makeWebAsset } from "./finding";

/** DNS 해석 결과(주입 가능 — 테스트는 네트워크 없이 stub). */
export interface HostResolution {
  hostname: string;
  /** A 레코드 주소들(비어 있으면 미해석 = dangling 가능성). */
  addresses: string[];
  /** CNAME 타깃, 없으면 null. */
  cname: string | null;
}

/** 호스트를 해석한다. 존재하지 않으면(NXDOMAIN) null. */
export type HostResolver = (hostname: string) => Promise<HostResolution | null>;

/** 브루트포스 열거에 쓰는 흔한 서브도메인 라벨. */
export const COMMON_SUBDOMAINS: readonly string[] = [
  "www", "mail", "api", "dev", "staging", "test", "admin", "vpn",
  "portal", "app", "blog", "shop", "cdn", "static", "git", "ci",
  "jenkins", "grafana", "kibana", "s3", "assets", "internal", "beta",
];

/** CNAME이 미점유 시 탈취 가능한 SaaS의 접미사 지문. */
const TAKEOVER_FINGERPRINTS: readonly { service: string; suffix: string }[] = [
  { service: "AWS S3", suffix: ".s3.amazonaws.com" },
  { service: "GitHub Pages", suffix: ".github.io" },
  { service: "Heroku", suffix: ".herokuapp.com" },
  { service: "Azure App Service", suffix: ".azurewebsites.net" },
  { service: "Amazon CloudFront", suffix: ".cloudfront.net" },
  { service: "Fastly", suffix: ".fastly.net" },
  { service: "Netlify", suffix: ".netlify.app" },
  { service: "Shopify", suffix: ".myshopify.com" },
  { service: "Zendesk", suffix: ".zendesk.com" },
];

export interface TakeoverRisk {
  service: string;
  /** A 레코드가 없으면(dangling) 탈취 위험이 높다. */
  dangling: boolean;
  severity: Severity;
}

/**
 * CNAME이 알려진 SaaS를 가리키는지로 서브도메인 탈취 위험을 분류한다. 순수 함수.
 * dangling(A 레코드 없음)이면 HIGH, 살아있으면 MEDIUM(정상 사용일 수 있어 수동 확인).
 */
export function classifyTakeover(
  cname: string | null,
  hasAddresses: boolean,
): TakeoverRisk | null {
  if (!cname) return null;
  const normalized = cname.toLowerCase().replace(/\.$/, "");
  const match = TAKEOVER_FINGERPRINTS.find((fp) => normalized.endsWith(fp.suffix));
  if (!match) return null;
  const dangling = !hasAddresses;
  return {
    service: match.service,
    dangling,
    severity: dangling ? "HIGH" : "MEDIUM",
  };
}

/** 기본 호스트 해석기: node:dns로 A·CNAME을 조회한다. */
async function defaultResolveHost(hostname: string): Promise<HostResolution | null> {
  let cname: string | null = null;
  try {
    const records = await resolveCname(hostname);
    cname = records[0] ?? null;
  } catch {
    // CNAME 없음은 정상
  }
  try {
    const addresses = await resolve4(hostname);
    return { hostname, addresses, cname };
  } catch {
    // A 미해석: CNAME만 있으면 dangling 후보로 반환, 둘 다 없으면 미존재
    return cname ? { hostname, addresses: [], cname } : null;
  }
}

export interface SubdomainScan {
  assets: Asset[];
  relationships: AssetRelationship[];
  findings: Finding[];
}

/**
 * 루트 도메인에 대해 흔한 서브도메인을 능동 열거한다(소유권 검증 후에만 호출).
 * 발견된 서브도메인은 web_asset으로 emit하고 부모와 `contains` 엣지로 잇는다
 * (부모가 서브도메인 리스크를 상속). CNAME 탈취 후보는 finding으로 보고한다.
 * 네트워크 side-effect(DNS)는 주입으로 격리된다.
 */
export async function enumerateSubdomains(
  rootDomain: string,
  tenantId: string,
  parentAssetId: string,
  options: { resolveHost?: HostResolver; wordlist?: readonly string[] } = {},
): Promise<SubdomainScan> {
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const wordlist = options.wordlist ?? COMMON_SUBDOMAINS;

  const assets: Asset[] = [];
  const relationships: AssetRelationship[] = [];
  const findings: Finding[] = [];

  const resolutions = await Promise.all(
    wordlist.map(async (label) => resolveHost(`${label}.${rootDomain}`)),
  );

  for (const resolution of resolutions) {
    if (resolution === null) continue; // 미존재 서브도메인
    const sub = makeWebAsset(tenantId, resolution.hostname, "MEDIUM", {
      source: "subdomain-enum",
    });
    assets.push(sub);
    relationships.push({
      id: newId(),
      tenantId,
      fromAssetId: parentAssetId,
      toAssetId: sub.id,
      type: "contains",
    });

    const takeover = classifyTakeover(
      resolution.cname,
      resolution.addresses.length > 0,
    );
    if (takeover) {
      findings.push(
        makeFinding(
          tenantId,
          sub.id,
          `WEB-SUBDOMAIN-TAKEOVER:${resolution.hostname}`,
          "misconfiguration",
          takeover.severity,
          "서브도메인 탈취 후보",
          `${resolution.hostname}의 CNAME이 ${takeover.service}(${resolution.cname})를 가리키며 ` +
            `${takeover.dangling ? "A 레코드가 없어 미점유(dangling) 상태로 탈취 위험이 높습니다" : "정상 해석되나 리소스 소유를 수동 확인하세요"}.`,
          {
            cname: resolution.cname,
            service: takeover.service,
            dangling: takeover.dangling,
          },
        ),
      );
    }
  }

  return { assets, relationships, findings };
}
