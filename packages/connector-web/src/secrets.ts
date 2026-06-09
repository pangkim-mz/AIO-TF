import { type Severity } from "@omniguard/schema";

/** 콘텐츠에서 탐지할 시크릿 유형 정의. 오탐이 낮은 고유 형식만 채택한다. */
export interface SecretPattern {
  id: string;
  label: string;
  regex: RegExp;
  severity: Severity;
}

/** 탐지된 시크릿 1건(원문은 마스킹해 보존하지 않는다). */
export interface SecretMatch {
  patternId: string;
  label: string;
  severity: Severity;
  /** 앞 4자만 노출하고 나머지는 마스킹한 형태(예: "AKIA…"). */
  redacted: string;
}

/**
 * 잘 알려진 고엔트로피·고유접두 형식만 탐지한다(오탐 최소화).
 * 범용 토큰/JWT 같은 모호한 형식은 의도적으로 제외했다.
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    id: "SECRET-AWS-ACCESS-KEY",
    label: "AWS Access Key ID",
    regex: /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
    severity: "CRITICAL",
  },
  {
    id: "SECRET-GCP-API-KEY",
    label: "Google API Key",
    regex: /\bAIza[0-9A-Za-z\-_]{35}\b/g,
    severity: "HIGH",
  },
  {
    id: "SECRET-GITHUB-TOKEN",
    label: "GitHub Personal Access Token",
    regex: /\bghp_[0-9A-Za-z]{36}\b/g,
    severity: "CRITICAL",
  },
  {
    id: "SECRET-SLACK-TOKEN",
    label: "Slack Token",
    regex: /\bxox[baprs]-[0-9A-Za-z-]{10,48}\b/g,
    severity: "HIGH",
  },
  {
    id: "SECRET-STRIPE-LIVE-KEY",
    label: "Stripe Live Secret Key",
    regex: /\bsk_live_[0-9A-Za-z]{24,}\b/g,
    severity: "CRITICAL",
  },
  {
    id: "SECRET-PRIVATE-KEY",
    label: "Private Key Block",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
    severity: "CRITICAL",
  },
];

/** 시크릿 앞 4자만 남기고 마스킹한다(원문을 finding에 저장하지 않기 위해). */
function redact(secret: string): string {
  const head = secret.slice(0, 4);
  return `${head}…`;
}

/**
 * 페이지/스크립트 콘텐츠에서 노출된 시크릿을 탐지한다. 순수 함수 — 네트워크 없음.
 * 같은 (패턴, 마스킹값) 조합은 한 번만 보고한다(같은 키가 여러 번 박혀도 1건).
 */
export function scanSecrets(content: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const seen = new Set<string>();
  for (const pattern of SECRET_PATTERNS) {
    for (const found of content.matchAll(pattern.regex)) {
      const redacted = redact(found[0]);
      const key = `${pattern.id}:${redacted}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push({
        patternId: pattern.id,
        label: pattern.label,
        severity: pattern.severity,
        redacted,
      });
    }
  }
  return matches;
}
