/** HTML에서 추출한 <script> 태그 (순수 파싱 결과). */
export interface ScriptTag {
  /** 절대화된 src URL. */
  src: string;
  /** Subresource Integrity 속성값, 없으면 null. */
  integrity: string | null;
  /** 페이지 호스트와 다른 출처면 true (서드파티). */
  isThirdParty: boolean;
}

/** src URL에서 식별한 노출 JS 라이브러리. */
export interface LibFingerprint {
  lib: string;
  version: string;
  /** OSV 조회용 package URL (npm 생태계로 정규화). */
  purl: string;
}

const SCRIPT_TAG_RE = /<script\b[^>]*>/gi;
const SRC_ATTR_RE = /\bsrc\s*=\s*["']([^"']+)["']/i;
const INTEGRITY_ATTR_RE = /\bintegrity\s*=\s*["']([^"']+)["']/i;

/**
 * HTML 문자열에서 외부 src를 가진 <script> 태그를 추출한다.
 * 인라인 스크립트(src 없음)는 제외한다. 정규식 기반(가벼움·의존성 0).
 */
export function parseScripts(html: string, pageHostname: string): ScriptTag[] {
  const tags: ScriptTag[] = [];
  for (const match of html.matchAll(SCRIPT_TAG_RE)) {
    const tag = match[0];
    const srcMatch = tag.match(SRC_ATTR_RE);
    if (!srcMatch) continue; // 인라인 스크립트
    const rawSrc = srcMatch[1]!;
    const resolved = resolveSrc(rawSrc, pageHostname);
    if (resolved === null) continue;
    const integrityMatch = tag.match(INTEGRITY_ATTR_RE);
    tags.push({
      src: resolved.href,
      integrity: integrityMatch ? integrityMatch[1]! : null,
      isThirdParty: resolved.hostname !== pageHostname,
    });
  }
  return tags;
}

/** 상대/프로토콜상대 src를 페이지 호스트 기준으로 절대화한다. */
function resolveSrc(
  rawSrc: string,
  pageHostname: string,
): { href: string; hostname: string } | null {
  try {
    const base = `https://${pageHostname}/`;
    const url = new URL(rawSrc, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return { href: url.href, hostname: url.hostname };
  } catch {
    return null;
  }
}

// CDN/파일명에서 라이브러리·버전을 추출하는 패턴 (가장 흔한 형태들).
const SEMVER = "(\\d+\\.\\d+(?:\\.\\d+)?(?:[-+][0-9A-Za-z.-]+)?)";
const FINGERPRINT_PATTERNS: readonly RegExp[] = [
  // jsDelivr/unpkg npm 경로: /npm/jquery@3.4.1/dist/...
  new RegExp(`/npm/([@a-z0-9._/-]+?)@${SEMVER}(?:[/?]|$)`, "i"),
  // cdnjs: /ajax/libs/jquery/3.4.1/jquery.min.js
  new RegExp(`/ajax/libs/([a-z0-9._-]+)/${SEMVER}/`, "i"),
  // 파일명 임베드: jquery-3.4.1.min.js, bootstrap.3.4.1.js
  new RegExp(`/([a-z][a-z0-9._-]*?)[-.]${SEMVER}(?:\\.min)?\\.js`, "i"),
];

/**
 * script src URL에서 라이브러리명·버전을 추론해 npm purl로 정규화한다.
 * 매칭되지 않으면 null (버전을 특정할 수 없는 스크립트는 OSV 조회 대상이 아님).
 */
export function fingerprintScript(src: string): LibFingerprint | null {
  for (const pattern of FINGERPRINT_PATTERNS) {
    const match = src.match(pattern);
    if (!match) continue;
    const lib = match[1]!.replace(/^lib\//, "").toLowerCase();
    const version = match[2]!;
    return { lib, version, purl: `pkg:npm/${lib}@${version}` };
  }
  return null;
}
