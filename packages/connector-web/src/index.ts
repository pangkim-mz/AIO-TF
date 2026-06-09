import {
  type Asset,
  type AssetRelationship,
  type Finding,
  type Severity,
  newId,
  now,
} from "@omniguard/schema";
import {
  fetchSiteProbe,
  normalizeUrl,
  type ProbeOptions,
  type SiteProbe,
} from "./probe";
import { fingerprintScript, parseScripts } from "./fingerprint";
import { SOURCE_ID, makeFinding } from "./finding";
import { scanSecrets } from "./secrets";
import {
  verifyOwnership,
  type OwnershipResult,
  type TxtResolver,
} from "./ownership";
import {
  enumerateSubdomains,
  type HostResolver,
} from "./subdomains";

export {
  fetchSiteProbe,
  normalizeUrl,
  type SiteProbe,
  type TlsInfo,
  type ProbeOptions,
} from "./probe";
export {
  parseScripts,
  fingerprintScript,
  type ScriptTag,
  type LibFingerprint,
} from "./fingerprint";
export {
  ownershipToken,
  verifyOwnership,
  VERIFICATION_PREFIX,
  type OwnershipResult,
  type TxtResolver,
} from "./ownership";
export {
  scanSecrets,
  SECRET_PATTERNS,
  type SecretMatch,
  type SecretPattern,
} from "./secrets";
export {
  enumerateSubdomains,
  classifyTakeover,
  COMMON_SUBDOMAINS,
  type HostResolver,
  type HostResolution,
  type SubdomainScan,
  type TakeoverRisk,
} from "./subdomains";

const ECOSYSTEM = "npm";
/** TLS 1.2 미만은 약한 프로토콜로 본다. */
const WEAK_PROTOCOLS = new Set(["TLSv1", "TLSv1.1", "SSLv3", "SSLv2"]);

/** 웹 점검 결과: 자산(web_asset + 노출 JS) + 의존 엣지 + 미설정/무결성 findings. */
export interface WebScan {
  assets: Asset[];
  relationships: AssetRelationship[];
  findings: Finding[];
}

/**
 * 사이트 점검 신호(SiteProbe)를 정규화 모델로 변환한다. 순수 함수 — 네트워크 없음.
 * web_asset 자산을 만들고, 노출 JS는 software_component 자산으로 emit해
 * 기존 enrichWithOsv가 CVE/CVSS를 자동 부여하도록 한다(취약점 로직 재사용).
 */
export function analyzeSite(probe: SiteProbe, tenantId: string): WebScan {
  const timestamp = now();

  const web: Asset = {
    id: newId(),
    tenantId,
    firstSeen: timestamp,
    lastSeen: timestamp,
    sourceIds: [SOURCE_ID],
    name: probe.hostname,
    criticality: "HIGH", // 외부 노출 표면은 기본 중요도 높음
    owner: null,
    tags: { role: "web_asset" },
    attributes: {
      type: "web_asset",
      url: probe.url,
      hostname: probe.hostname,
    },
  };

  const assets: Asset[] = [web];
  const relationships: AssetRelationship[] = [];
  const findings: Finding[] = [];

  // ── 노출 JS 라이브러리 → software_component 자산 + depends_on 엣지 ──
  const scripts = parseScripts(probe.html, probe.hostname);
  const seenPurls = new Set<string>();
  for (const script of scripts) {
    const fp = fingerprintScript(script.src);
    if (!fp || seenPurls.has(fp.purl)) continue;
    seenPurls.add(fp.purl);
    const lib: Asset = {
      id: newId(),
      tenantId,
      firstSeen: timestamp,
      lastSeen: timestamp,
      sourceIds: [SOURCE_ID],
      name: fp.lib,
      criticality: "MEDIUM",
      owner: null,
      tags: { source: "exposed-js", src: script.src },
      attributes: {
        type: "software_component",
        purl: fp.purl,
        ecosystem: ECOSYSTEM,
        version: fp.version,
        licenses: [],
      },
    };
    assets.push(lib);
    relationships.push({
      id: newId(),
      tenantId,
      fromAssetId: web.id,
      toAssetId: lib.id,
      type: "depends_on",
    });
  }

  // ── 미설정/무결성 findings (web_asset에 부착) ──
  const add = (
    sourceFindingId: string,
    category: Finding["category"],
    severity: Severity,
    title: string,
    description: string,
    raw: unknown,
  ): void => {
    findings.push(
      makeFinding(
        tenantId,
        web.id,
        sourceFindingId,
        category,
        severity,
        title,
        description,
        raw,
      ),
    );
  };

  evaluateTls(probe, add);
  evaluateHeaders(probe.headers, add);
  evaluateSri(scripts, add);

  return { assets, relationships, findings };
}

type AddFinding = (
  sourceFindingId: string,
  category: Finding["category"],
  severity: Severity,
  title: string,
  description: string,
  raw: unknown,
) => void;

/** ① TLS/인증서: 미적용·만료·미신뢰·약한 프로토콜. */
function evaluateTls(probe: SiteProbe, add: AddFinding): void {
  const isHttps = probe.finalUrl.startsWith("https:");
  if (!isHttps || probe.tls === null) {
    if (!isHttps) {
      add(
        "WEB-TLS-MISSING",
        "misconfiguration",
        "HIGH",
        "TLS 미적용 (평문 HTTP)",
        "사이트가 HTTPS로 제공되지 않아 트래픽이 평문으로 노출됩니다.",
        { finalUrl: probe.finalUrl },
      );
    }
    return;
  }
  const tls = probe.tls;
  if (tls.expired) {
    add(
      "WEB-TLS-EXPIRED",
      "misconfiguration",
      "HIGH",
      "만료된 TLS 인증서",
      `TLS 인증서가 만료되었습니다 (만료일 ${tls.validTo}).`,
      { validTo: tls.validTo, daysUntilExpiry: tls.daysUntilExpiry },
    );
  }
  if (!tls.authorized) {
    add(
      "WEB-TLS-UNTRUSTED",
      "misconfiguration",
      "HIGH",
      "신뢰할 수 없는 TLS 인증서",
      `인증서 체인 검증에 실패했습니다 (${tls.authorizationError ?? "unknown"}).`,
      { authorizationError: tls.authorizationError },
    );
  }
  if (tls.protocol && WEAK_PROTOCOLS.has(tls.protocol)) {
    add(
      "WEB-TLS-WEAK-PROTOCOL",
      "misconfiguration",
      "MEDIUM",
      "약한 TLS 프로토콜",
      `구버전 프로토콜 ${tls.protocol}을 사용합니다 (TLS 1.2 이상 권장).`,
      { protocol: tls.protocol },
    );
  }
}

interface HeaderRule {
  header: string;
  id: string;
  severity: Severity;
  title: string;
}

const HEADER_RULES: readonly HeaderRule[] = [
  {
    header: "strict-transport-security",
    id: "WEB-HEADER-MISSING-HSTS",
    severity: "MEDIUM",
    title: "HSTS 헤더 누락",
  },
  {
    header: "content-security-policy",
    id: "WEB-HEADER-MISSING-CSP",
    severity: "MEDIUM",
    title: "CSP 헤더 누락",
  },
  {
    header: "x-frame-options",
    id: "WEB-HEADER-MISSING-XFO",
    severity: "LOW",
    title: "X-Frame-Options 헤더 누락",
  },
  {
    header: "x-content-type-options",
    id: "WEB-HEADER-MISSING-XCTO",
    severity: "LOW",
    title: "X-Content-Type-Options 헤더 누락",
  },
];

/** ② 보안 헤더 누락: HSTS·CSP·X-Frame-Options·X-Content-Type-Options. */
function evaluateHeaders(
  headers: Record<string, string>,
  add: AddFinding,
): void {
  for (const rule of HEADER_RULES) {
    if (headers[rule.header] === undefined) {
      add(
        rule.id,
        "misconfiguration",
        rule.severity,
        rule.title,
        `응답에 ${rule.header} 헤더가 없습니다.`,
        { missingHeader: rule.header },
      );
    }
  }
}

/** ④ SRI 누락: 서드파티 스크립트가 integrity 속성 없이 로드되면 변조 위험(Magecart). */
function evaluateSri(
  scripts: readonly { src: string; integrity: string | null; isThirdParty: boolean }[],
  add: AddFinding,
): void {
  for (const script of scripts) {
    if (!script.isThirdParty || script.integrity !== null) continue;
    add(
      `WEB-SRI-MISSING:${script.src}`,
      "integrity",
      "MEDIUM",
      "서드파티 스크립트 SRI 누락",
      `서드파티 스크립트가 무결성(SRI) 검증 없이 로드됩니다: ${script.src}`,
      { src: script.src },
    );
  }
}

/**
 * 단일 URL 점검 오케스트레이터 (네트워크 → 분석). CLI/API가 호출한다.
 * 자산을 영속화한 뒤 노출 JS(software_component)에 enrichWithOsv를 돌리면 CVE가 붙는다.
 */
export async function scanUrl(
  url: string,
  tenantId: string,
  options: ProbeOptions = {},
): Promise<WebScan> {
  const probe = await fetchSiteProbe(url, options);
  return analyzeSite(probe, tenantId);
}

/** 페이지 콘텐츠의 노출 시크릿을 web_asset에 부착되는 findings로 변환한다(순수 탐지 + 부착). */
function buildSecretFindings(
  content: string,
  tenantId: string,
  webAssetId: string,
): Finding[] {
  return scanSecrets(content).map((match) =>
    makeFinding(
      tenantId,
      webAssetId,
      `WEB-SECRET-EXPOSED:${match.patternId}:${match.redacted}`,
      "misconfiguration",
      match.severity,
      `노출된 시크릿: ${match.label}`,
      `페이지 소스에 ${match.label}로 보이는 값이 노출되어 있습니다 (${match.redacted}). 즉시 폐기·회전하세요.`,
      { patternId: match.patternId, redacted: match.redacted },
    ),
  );
}

export interface ActiveScanOptions extends ProbeOptions {
  resolveTxt?: TxtResolver;
  resolveHost?: HostResolver;
  subdomainWordlist?: readonly string[];
}

/** 능동 점검 결과 = 수동 점검(WebScan) + 소유권 검증 메타. */
export interface ActiveWebScan extends WebScan {
  ownership: OwnershipResult;
  /** 소유권 미검증으로 능동 점검(서브도메인 열거·시크릿 스캔)을 건너뛰었는가. */
  activeSkipped: boolean;
}

/**
 * 능동 점검 오케스트레이터: 수동 점검(scanUrl 동급)에 더해, **도메인 소유권이
 * DNS TXT로 검증된 경우에만** 서브도메인 열거·시크릿 스캔을 추가한다.
 * 소유권 게이트는 타 도메인을 능동 스캔하지 않기 위한 안전장치다.
 */
export async function activeScanUrl(
  url: string,
  tenantId: string,
  options: ActiveScanOptions = {},
): Promise<ActiveWebScan> {
  const target = normalizeUrl(url);
  const ownership = await verifyOwnership(tenantId, target.hostname, {
    resolveTxt: options.resolveTxt,
  });

  const probe = await fetchSiteProbe(url, options);
  const base = analyzeSite(probe, tenantId);
  const web = base.assets.find((a) => a.attributes.type === "web_asset")!;

  if (!ownership.verified) {
    return { ...base, ownership, activeSkipped: true };
  }

  const secretFindings = buildSecretFindings(probe.html, tenantId, web.id);
  const subdomains = await enumerateSubdomains(
    target.hostname,
    tenantId,
    web.id,
    { resolveHost: options.resolveHost, wordlist: options.subdomainWordlist },
  );

  return {
    assets: [...base.assets, ...subdomains.assets],
    relationships: [...base.relationships, ...subdomains.relationships],
    findings: [...base.findings, ...secretFindings, ...subdomains.findings],
    ownership,
    activeSkipped: false,
  };
}
