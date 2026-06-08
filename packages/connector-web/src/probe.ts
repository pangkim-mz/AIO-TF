import { connect as tlsConnect, type PeerCertificate } from "node:tls";

/**
 * 사이트 점검에 필요한 원시 신호. 네트워크 side-effect는 fetchSiteProbe에 격리되고,
 * 분석(analyzeSite)은 이 구조만 받는 순수 함수다 → 픽스처 주입으로 네트워크 없이 테스트.
 */
export interface SiteProbe {
  /** 요청한 origin URL (자연키). */
  url: string;
  /** 리다이렉트 추적 후 최종 URL. */
  finalUrl: string;
  hostname: string;
  status: number;
  /** 소문자 키로 정규화된 응답 헤더. */
  headers: Record<string, string>;
  html: string;
  /** https 핸드셰이크 성공 시 인증서 정보, http이거나 실패면 null. */
  tls: TlsInfo | null;
}

export interface TlsInfo {
  /** 협상된 프로토콜 (예: "TLSv1.2", "TLSv1.3"). */
  protocol: string | null;
  validFrom: string;
  validTo: string;
  /** validTo 기준 만료까지 남은 일수 (음수면 만료됨). */
  daysUntilExpiry: number;
  expired: boolean;
  /** 인증서 체인이 신뢰 저장소로 검증되었는지. */
  authorized: boolean;
  authorizationError: string | null;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ProbeOptions {
  timeoutMs?: number;
  /** 테스트/대체 구현 주입용. 기본값은 전역 fetch. */
  fetchImpl?: typeof fetch;
}

/** 스킴이 없으면 https를 기본으로 붙여 URL을 정규화한다. */
export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return new URL(withScheme);
}

/**
 * 대상 URL을 브라우저 동급(passive)으로 점검한다: HTTP 헤더·본문 + TLS 핸드셰이크.
 * 능동 스캔(포트·서브도메인·시크릿)은 하지 않는다. 네트워크 side-effect는 여기에만 있다.
 */
export async function fetchSiteProbe(
  input: string,
  options: ProbeOptions = {},
): Promise<SiteProbe> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const target = normalizeUrl(input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "OmniGuard-WebConnector/0.1" },
    });
  } finally {
    clearTimeout(timer);
  }

  const finalUrl = new URL(response.url || target.toString());
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  const html = await response.text();

  const tls =
    finalUrl.protocol === "https:"
      ? await fetchTlsInfo(finalUrl.hostname, timeoutMs)
      : null;

  return {
    url: target.toString(),
    finalUrl: finalUrl.toString(),
    hostname: finalUrl.hostname,
    status: response.status,
    headers,
    html,
    tls,
  };
}

/** host:443으로 TLS 핸드셰이크해 인증서·프로토콜을 읽는다. 검증 실패도 정보로 수집한다. */
function fetchTlsInfo(hostname: string, timeoutMs: number): Promise<TlsInfo | null> {
  return new Promise((resolve) => {
    const socket = tlsConnect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false, // 만료/자가서명도 정보로 수집하기 위해
      },
      () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        const authorized = socket.authorized;
        const authorizationError = socket.authorizationError
          ? String(socket.authorizationError)
          : null;
        socket.end();
        resolve(toTlsInfo(cert, protocol, authorized, authorizationError));
      },
    );
    socket.setTimeout(timeoutMs, () => socket.destroy());
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => resolve(null));
  });
}

function toTlsInfo(
  cert: PeerCertificate,
  protocol: string | null,
  authorized: boolean,
  authorizationError: string | null,
): TlsInfo | null {
  if (!cert || !cert.valid_to) return null;
  const validToMs = Date.parse(cert.valid_to);
  const daysUntilExpiry = Number.isNaN(validToMs)
    ? 0
    : Math.floor((validToMs - Date.now()) / MS_PER_DAY);
  return {
    protocol,
    validFrom: cert.valid_from ?? "",
    validTo: cert.valid_to,
    daysUntilExpiry,
    expired: daysUntilExpiry < 0,
    authorized,
    authorizationError,
  };
}
