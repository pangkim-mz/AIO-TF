import { describe, it, expect } from "vitest";
import { newId } from "@omniguard/schema";
import {
  analyzeSite,
  parseScripts,
  fingerprintScript,
  scanUrl,
  type SiteProbe,
} from "../src/index";

const SECURE_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=31536000",
  "content-security-policy": "default-src 'self'",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
};

/** 기본은 '안전한' 사이트(https·전 헤더·신뢰 인증서·스크립트 없음). 케이스별로 덮어쓴다. */
function makeProbe(overrides: Partial<SiteProbe> = {}): SiteProbe {
  return {
    url: "https://example.com/",
    finalUrl: "https://example.com/",
    hostname: "example.com",
    status: 200,
    headers: { ...SECURE_HEADERS },
    html: "",
    tls: {
      protocol: "TLSv1.3",
      validFrom: "Jan  1 00:00:00 2026 GMT",
      validTo: "Jan  1 00:00:00 2030 GMT",
      daysUntilExpiry: 365,
      expired: false,
      authorized: true,
      authorizationError: null,
    },
    ...overrides,
  };
}

describe("parseScripts", () => {
  it("외부 src 스크립트만 추출하고 인라인은 제외한다", () => {
    const html = `
      <script>console.log('inline')</script>
      <script src="/app.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/jquery@3.4.1/dist/jquery.min.js"></script>
    `;
    const scripts = parseScripts(html, "example.com");
    expect(scripts).toHaveLength(2);
    expect(scripts.map((s) => s.src)).toEqual([
      "https://example.com/app.js",
      "https://cdn.jsdelivr.net/npm/jquery@3.4.1/dist/jquery.min.js",
    ]);
  });

  it("서드파티 여부와 integrity 속성을 판별한다", () => {
    const html = `
      <script src="/own.js"></script>
      <script src="https://cdn.example.org/x.js" integrity="sha384-abc"></script>
      <script src="https://cdn.example.org/y.js"></script>
    `;
    const scripts = parseScripts(html, "example.com");
    const own = scripts.find((s) => s.src.endsWith("own.js"))!;
    const withSri = scripts.find((s) => s.src.endsWith("x.js"))!;
    const noSri = scripts.find((s) => s.src.endsWith("y.js"))!;
    expect(own.isThirdParty).toBe(false);
    expect(withSri.isThirdParty).toBe(true);
    expect(withSri.integrity).toBe("sha384-abc");
    expect(noSri.integrity).toBeNull();
  });
});

describe("fingerprintScript", () => {
  it("jsDelivr/unpkg npm 경로에서 라이브러리·버전을 추출한다", () => {
    const fp = fingerprintScript(
      "https://cdn.jsdelivr.net/npm/jquery@3.4.1/dist/jquery.min.js",
    );
    expect(fp).toEqual({
      lib: "jquery",
      version: "3.4.1",
      purl: "pkg:npm/jquery@3.4.1",
    });
  });

  it("cdnjs 경로를 인식한다", () => {
    const fp = fingerprintScript(
      "https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.4/lodash.min.js",
    );
    expect(fp?.lib).toBe("lodash.js");
    expect(fp?.version).toBe("4.17.4");
  });

  it("파일명에 임베드된 버전을 추출한다", () => {
    const fp = fingerprintScript("https://example.com/vendor/angular-1.7.8.min.js");
    expect(fp).toEqual({
      lib: "angular",
      version: "1.7.8",
      purl: "pkg:npm/angular@1.7.8",
    });
  });

  it("버전을 특정할 수 없으면 null을 반환한다", () => {
    expect(fingerprintScript("https://example.com/app.bundle.js")).toBeNull();
  });
});

describe("analyzeSite", () => {
  it("web_asset 자산을 url 자연키로 만든다", () => {
    const scan = analyzeSite(makeProbe(), newId());
    const web = scan.assets.find((a) => a.attributes.type === "web_asset")!;
    expect(web.attributes.type === "web_asset" && web.attributes.url).toBe(
      "https://example.com/",
    );
    expect(web.name).toBe("example.com");
  });

  it("노출 JS를 software_component로 emit하고 depends_on 엣지를 만든다(purl 중복 제거)", () => {
    const html = `
      <script src="https://cdn.jsdelivr.net/npm/jquery@3.4.1/dist/jquery.min.js"></script>
      <script src="https://other.cdn/npm/jquery@3.4.1/jquery.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/lodash@4.17.4/lodash.min.js"></script>
    `;
    const scan = analyzeSite(makeProbe({ html }), newId());
    const libs = scan.assets.filter(
      (a) => a.attributes.type === "software_component",
    );
    expect(libs.map((l) => l.name).sort()).toEqual(["jquery", "lodash"]); // 중복 jquery 1개
    const web = scan.assets.find((a) => a.attributes.type === "web_asset")!;
    expect(scan.relationships).toHaveLength(2);
    expect(
      scan.relationships.every(
        (r) => r.type === "depends_on" && r.fromAssetId === web.id,
      ),
    ).toBe(true);
  });

  it("안전한 사이트(https·전 헤더·신뢰 인증서·SRI)는 finding이 없다", () => {
    const scan = analyzeSite(makeProbe(), newId());
    expect(scan.findings).toHaveLength(0);
  });

  it("평문 HTTP는 TLS 미적용 finding을 만든다", () => {
    const scan = analyzeSite(
      makeProbe({ finalUrl: "http://example.com/", tls: null }),
      newId(),
    );
    const ids = scan.findings.map((f) => f.sourceFindingId);
    expect(ids).toContain("WEB-TLS-MISSING");
  });

  it("만료·미신뢰·약한 프로토콜 인증서를 탐지한다", () => {
    const scan = analyzeSite(
      makeProbe({
        tls: {
          protocol: "TLSv1.1",
          validFrom: "",
          validTo: "Jan  1 00:00:00 2020 GMT",
          daysUntilExpiry: -100,
          expired: true,
          authorized: false,
          authorizationError: "CERT_HAS_EXPIRED",
        },
      }),
      newId(),
    );
    const ids = scan.findings.map((f) => f.sourceFindingId);
    expect(ids).toContain("WEB-TLS-EXPIRED");
    expect(ids).toContain("WEB-TLS-UNTRUSTED");
    expect(ids).toContain("WEB-TLS-WEAK-PROTOCOL");
  });

  it("누락된 보안 헤더 4종을 misconfiguration으로 만든다", () => {
    const scan = analyzeSite(makeProbe({ headers: {} }), newId());
    const headerFindings = scan.findings.filter((f) =>
      f.sourceFindingId.startsWith("WEB-HEADER-MISSING"),
    );
    expect(headerFindings.map((f) => f.sourceFindingId).sort()).toEqual([
      "WEB-HEADER-MISSING-CSP",
      "WEB-HEADER-MISSING-HSTS",
      "WEB-HEADER-MISSING-XCTO",
      "WEB-HEADER-MISSING-XFO",
    ]);
    expect(headerFindings.every((f) => f.category === "misconfiguration")).toBe(
      true,
    );
  });

  it("SRI 없는 서드파티 스크립트만 integrity finding을 만든다", () => {
    const html = `
      <script src="/own.js"></script>
      <script src="https://cdn.third.io/a.js"></script>
      <script src="https://cdn.third.io/b.js" integrity="sha384-xyz"></script>
    `;
    const scan = analyzeSite(makeProbe({ html }), newId());
    const sri = scan.findings.filter((f) =>
      f.sourceFindingId.startsWith("WEB-SRI-MISSING"),
    );
    expect(sri).toHaveLength(1); // own(퍼스트파티)·b(SRI 있음) 제외, a만
    expect(sri[0]!.category).toBe("integrity");
    expect(sri[0]!.sourceFindingId).toContain("a.js");
  });
});

describe("scanUrl (fetch 주입)", () => {
  it("주입된 fetch로 평문 HTTP 사이트를 점검한다(네트워크 없음)", async () => {
    const fetchImpl = (async () =>
      new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    // Response.url은 빈 문자열 → 요청 URL(http)로 폴백, https TLS 핸드셰이크 없음
    const scan = await scanUrl("http://insecure.test", newId(), { fetchImpl });
    const web = scan.assets.find((a) => a.attributes.type === "web_asset")!;
    expect(web.attributes.type === "web_asset" && web.attributes.hostname).toBe(
      "insecure.test",
    );
    expect(scan.findings.map((f) => f.sourceFindingId)).toContain(
      "WEB-TLS-MISSING",
    );
  });
});
