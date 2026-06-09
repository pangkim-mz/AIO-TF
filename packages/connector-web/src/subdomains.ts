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

/** 루트 도메인의 서브도메인 후보를 외부 소스(예: CT 로그)에서 가져온다. */
export type CtSource = (rootDomain: string) => Promise<string[]>;

/** 탈취 후보 호스트의 응답 본문을 가져온다(미점유 지문 확인용). 실패면 null. */
export type TakeoverProbe = (hostname: string) => Promise<string | null>;

/** 브루트포스 열거에 쓰는 흔한 서브도메인 라벨. */
export const COMMON_SUBDOMAINS: readonly string[] = [
  "www", "mail", "api", "dev", "staging", "test", "admin", "vpn",
  "portal", "app", "blog", "shop", "cdn", "static", "git", "ci",
  "jenkins", "grafana", "kibana", "s3", "assets", "internal", "beta",
];

/** CT 로그 + 워드리스트를 합친 후보의 상한(과도한 DNS 팬아웃 방지). */
const DEFAULT_MAX_CANDIDATES = 100;
/** 네트워크 호출 타임아웃. */
const PROBE_TIMEOUT_MS = 10_000;
const USER_AGENT = "OmniGuard-WebConnector/0.1";

/**
 * CNAME이 미점유 시 탈취 가능한 SaaS의 접미사 + 미점유 응답 본문 지문.
 * unclaimedMarker는 해당 서비스가 "이 리소스는 없음"을 응답할 때 본문에 나타나는 문자열.
 */
interface TakeoverFingerprint {
  service: string;
  suffix: string;
  unclaimedMarker: string;
}

const TAKEOVER_FINGERPRINTS: readonly TakeoverFingerprint[] = [
  { service: "AWS S3", suffix: ".s3.amazonaws.com", unclaimedMarker: "NoSuchBucket" },
  { service: "GitHub Pages", suffix: ".github.io", unclaimedMarker: "There isn't a GitHub Pages site here" },
  { service: "Heroku", suffix: ".herokuapp.com", unclaimedMarker: "No such app" },
  { service: "Azure App Service", suffix: ".azurewebsites.net", unclaimedMarker: "404 Web Site not found" },
  { service: "Amazon CloudFront", suffix: ".cloudfront.net", unclaimedMarker: "ERROR: The request could not be satisfied" },
  { service: "Fastly", suffix: ".fastly.net", unclaimedMarker: "Fastly error: unknown domain" },
  { service: "Netlify", suffix: ".netlify.app", unclaimedMarker: "Not Found - Request ID" },
  { service: "Shopify", suffix: ".myshopify.com", unclaimedMarker: "Sorry, this shop is currently unavailable" },
  { service: "Zendesk", suffix: ".zendesk.com", unclaimedMarker: "no longer exists" },
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

/**
 * 응답 본문에 SaaS의 "미점유" 지문이 있으면 탈취가 실제로 가능함을 확정한다. 순수 함수.
 * 휴리스틱(CNAME 매칭)을 본문 증거로 확증해 오탐을 줄인다.
 */
export function confirmTakeover(service: string, body: string): boolean {
  const fp = TAKEOVER_FINGERPRINTS.find((f) => f.service === service);
  if (!fp) return false;
  return body.includes(fp.unclaimedMarker);
}

/**
 * crt.sh JSON 응답에서 루트 도메인의 서브도메인 호스트명을 추출한다. 순수 함수.
 * name_value는 줄바꿈으로 여러 이름을 담을 수 있고, 와일드카드(`*.`)는 벗겨낸다.
 */
export function parseCrtShNames(payload: unknown, rootDomain: string): string[] {
  if (!Array.isArray(payload)) return [];
  const root = rootDomain.toLowerCase();
  const suffix = `.${root}`;
  const out = new Set<string>();
  for (const entry of payload) {
    const nameValue = (entry as { name_value?: unknown }).name_value;
    if (typeof nameValue !== "string") continue;
    for (const raw of nameValue.split("\n")) {
      let host = raw.trim().toLowerCase();
      if (host.startsWith("*.")) host = host.slice(2);
      if (host === "" || host === root) continue;
      if (host.includes(" ") || host.includes("*")) continue;
      if (!host.endsWith(suffix)) continue;
      out.add(host);
    }
  }
  return [...out];
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

/** 기본 CT 소스: crt.sh를 조회한다(실패는 빈 결과로 흡수 — 능동 점검을 막지 않음). */
async function defaultCtSource(rootDomain: string): Promise<string[]> {
  try {
    const query = encodeURIComponent(`%.${rootDomain}`);
    const response = await fetch(`https://crt.sh/?q=${query}&output=json`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    return parseCrtShNames(await response.json(), rootDomain);
  } catch {
    return [];
  }
}

/** 기본 탈취 프로브: 호스트를 HTTPS로 가져와 본문을 반환한다. 실패는 null. */
async function defaultTakeoverProbe(hostname: string): Promise<string | null> {
  try {
    const response = await fetch(`https://${hostname}/`, {
      redirect: "follow",
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    return await response.text();
  } catch {
    return null;
  }
}

export interface SubdomainScan {
  assets: Asset[];
  relationships: AssetRelationship[];
  findings: Finding[];
}

export interface EnumerateOptions {
  resolveHost?: HostResolver;
  wordlist?: readonly string[];
  /** CT 로그 등 외부 서브도메인 소스. 미지정 시 crt.sh. */
  ctSource?: CtSource;
  /** 탈취 후보의 미점유 여부를 본문으로 확증하는 프로브. 미지정 시 HTTPS fetch. */
  takeoverProbe?: TakeoverProbe;
  /** 합친 후보의 상한. 기본 100. */
  maxCandidates?: number;
}

/**
 * 루트 도메인의 서브도메인을 능동 열거한다(소유권 검증 후에만 호출).
 * 후보 = 워드리스트 + CT 로그(crt.sh) 합집합 → DNS 해석으로 생존/​dangling 확인.
 * 해석된 서브도메인은 web_asset으로 emit하고 부모와 `contains` 엣지로 잇는다(리스크 상속).
 * CNAME이 SaaS를 가리키면 탈취 후보로 보고하고, 본문 지문으로 미점유가 확증되면 CRITICAL로 격상.
 * 네트워크 side-effect(DNS·CT·프로브)는 모두 주입으로 격리된다.
 */
export async function enumerateSubdomains(
  rootDomain: string,
  tenantId: string,
  parentAssetId: string,
  options: EnumerateOptions = {},
): Promise<SubdomainScan> {
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const wordlist = options.wordlist ?? COMMON_SUBDOMAINS;
  const ctSource = options.ctSource ?? defaultCtSource;
  const takeoverProbe = options.takeoverProbe ?? defaultTakeoverProbe;
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  // 후보 = 워드리스트(앞) + CT 로그. 워드리스트를 앞에 둬 상한 절단 시 흔한 라벨이 살아남는다.
  const ctNames = await safeCtSource(ctSource, rootDomain);
  const candidates = [
    ...new Set([...wordlist.map((label) => `${label}.${rootDomain}`), ...ctNames]),
  ].slice(0, maxCandidates);

  const assets: Asset[] = [];
  const relationships: AssetRelationship[] = [];
  const findings: Finding[] = [];

  const resolutions = await Promise.all(candidates.map((host) => resolveHost(host)));

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
    if (!takeover) continue;

    // 본문 지문으로 미점유를 확증하면 CRITICAL로 격상한다(휴리스틱 → 증거).
    const body = await takeoverProbe(resolution.hostname);
    const confirmed = body !== null && confirmTakeover(takeover.service, body);
    const severity: Severity = confirmed ? "CRITICAL" : takeover.severity;

    findings.push(
      makeFinding(
        tenantId,
        sub.id,
        `WEB-SUBDOMAIN-TAKEOVER:${resolution.hostname}`,
        "misconfiguration",
        severity,
        confirmed ? "서브도메인 탈취 가능(확증)" : "서브도메인 탈취 후보",
        `${resolution.hostname}의 CNAME이 ${takeover.service}(${resolution.cname})를 가리킵니다. ` +
          (confirmed
            ? `응답 본문에서 미점유 지문이 확인되어 탈취가 실제로 가능합니다 — 즉시 DNS 레코드를 제거하거나 리소스를 회수하세요.`
            : takeover.dangling
              ? `A 레코드가 없어 미점유(dangling) 상태로 탈취 위험이 높습니다.`
              : `정상 해석되나 리소스 소유를 수동 확인하세요.`),
        {
          cname: resolution.cname,
          service: takeover.service,
          dangling: takeover.dangling,
          confirmed,
        },
      ),
    );
  }

  return { assets, relationships, findings };
}

/** CT 소스 호출을 안전하게 감싼다(주입 구현이 던져도 능동 점검 전체를 막지 않음). */
async function safeCtSource(ctSource: CtSource, rootDomain: string): Promise<string[]> {
  try {
    return await ctSource(rootDomain);
  } catch {
    return [];
  }
}
