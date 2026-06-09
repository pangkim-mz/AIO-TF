import { describe, it, expect } from "vitest";
import { newId } from "@omniguard/schema";
import {
  ownershipToken,
  verifyOwnership,
  VERIFICATION_PREFIX,
  scanSecrets,
  classifyTakeover,
  confirmTakeover,
  parseCrtShNames,
  enumerateSubdomains,
  activeScanUrl,
  type HostResolution,
} from "../src/index";

/** 네트워크 없는 테스트를 위한 no-op CT 소스(crt.sh 호출 차단). */
const noCt = async (): Promise<string[]> => [];

describe("ownershipToken", () => {
  it("같은 (테넌트, 호스트)에 결정론적 토큰을 만들고 접두사를 붙인다", () => {
    const tenant = newId();
    const a = ownershipToken(tenant, "example.com");
    const b = ownershipToken(tenant, "EXAMPLE.com"); // 대소문자 무관
    expect(a).toBe(b);
    expect(a.startsWith(VERIFICATION_PREFIX)).toBe(true);
  });

  it("테넌트/호스트가 다르면 토큰이 다르다", () => {
    expect(ownershipToken(newId(), "a.com")).not.toBe(
      ownershipToken(newId(), "a.com"),
    );
    const tenant = newId();
    expect(ownershipToken(tenant, "a.com")).not.toBe(
      ownershipToken(tenant, "b.com"),
    );
  });
});

describe("verifyOwnership", () => {
  it("TXT 레코드에 기대 토큰이 있으면 검증된다(청크 분할 합침)", async () => {
    const tenant = newId();
    const token = ownershipToken(tenant, "example.com");
    const resolveTxt = async () => [["other"], [token.slice(0, 10), token.slice(10)]];
    const result = await verifyOwnership(tenant, "example.com", { resolveTxt });
    expect(result.verified).toBe(true);
    expect(result.error).toBeNull();
  });

  it("기대 토큰이 없으면 검증되지 않는다", async () => {
    const resolveTxt = async () => [["v=spf1 -all"]];
    const result = await verifyOwnership(newId(), "example.com", { resolveTxt });
    expect(result.verified).toBe(false);
  });

  it("DNS 조회 실패는 미검증 + 사유로 처리한다", async () => {
    const resolveTxt = async () => {
      throw new Error("ENOTFOUND");
    };
    const result = await verifyOwnership(newId(), "nope.invalid", { resolveTxt });
    expect(result.verified).toBe(false);
    expect(result.error).toContain("ENOTFOUND");
  });
});

describe("scanSecrets", () => {
  it("AWS 키·GitHub 토큰·개인키 블록을 탐지하고 마스킹한다", () => {
    const content = [
      "const k = 'AKIAIOSFODNN7EXAMPLE';",
      "token: ghp_0123456789abcdefghijklmnopqrstuvwxyz",
      "-----BEGIN RSA PRIVATE KEY-----",
    ].join("\n");
    const matches = scanSecrets(content);
    const ids = matches.map((m) => m.patternId).sort();
    expect(ids).toEqual([
      "SECRET-AWS-ACCESS-KEY",
      "SECRET-GITHUB-TOKEN",
      "SECRET-PRIVATE-KEY",
    ]);
    expect(matches.every((m) => m.redacted.endsWith("…"))).toBe(true);
    expect(matches.find((m) => m.patternId === "SECRET-AWS-ACCESS-KEY")!.redacted)
      .toBe("AKIA…");
  });

  it("같은 시크릿이 여러 번 나와도 1건으로 집계한다", () => {
    const key = "AKIAIOSFODNN7EXAMPLE";
    const matches = scanSecrets(`${key} ... ${key}`);
    expect(matches).toHaveLength(1);
  });

  it("시크릿이 없는 콘텐츠는 빈 배열이다", () => {
    expect(scanSecrets("<html><body>hello</body></html>")).toHaveLength(0);
  });
});

describe("classifyTakeover", () => {
  it("SaaS CNAME이 dangling이면 HIGH, 살아있으면 MEDIUM", () => {
    expect(classifyTakeover("bucket.s3.amazonaws.com", false)).toEqual({
      service: "AWS S3",
      dangling: true,
      severity: "HIGH",
    });
    expect(classifyTakeover("foo.github.io", true)?.severity).toBe("MEDIUM");
  });

  it("SaaS가 아니거나 CNAME이 없으면 null", () => {
    expect(classifyTakeover("api.internal.example.com", false)).toBeNull();
    expect(classifyTakeover(null, false)).toBeNull();
  });
});

describe("enumerateSubdomains (resolveHost 주입)", () => {
  it("해석된 서브도메인만 web_asset + contains 엣지로 만들고 탈취 후보를 보고한다", async () => {
    const parentId = newId();
    const tenant = newId();
    const resolveHost = async (hostname: string): Promise<HostResolution | null> => {
      if (hostname === "api.example.com")
        return { hostname, addresses: ["1.2.3.4"], cname: null };
      if (hostname === "old.example.com")
        return { hostname, addresses: [], cname: "gone.herokuapp.com" }; // dangling
      return null; // www 등 미존재
    };
    const scan = await enumerateSubdomains("example.com", tenant, parentId, {
      resolveHost,
      wordlist: ["api", "old", "www"],
      ctSource: noCt,
      takeoverProbe: async () => null, // 미점유 확증 안 됨 → 휴리스틱 HIGH 유지
    });
    expect(scan.assets.map((a) => a.name).sort()).toEqual([
      "api.example.com",
      "old.example.com",
    ]);
    expect(
      scan.relationships.every(
        (r) => r.type === "contains" && r.fromAssetId === parentId,
      ),
    ).toBe(true);
    expect(scan.findings).toHaveLength(1);
    expect(scan.findings[0]!.sourceFindingId).toBe(
      "WEB-SUBDOMAIN-TAKEOVER:old.example.com",
    );
    expect(scan.findings[0]!.severity).toBe("HIGH");
  });

  it("CT 로그 후보를 합치고, 본문 지문으로 미점유가 확증되면 CRITICAL로 격상한다", async () => {
    const parentId = newId();
    const tenant = newId();
    // 워드리스트엔 없지만 CT 로그가 알려주는 서브도메인(dangling S3)
    const ctSource = async () => ["legacy.example.com", "example.com"]; // apex는 무시됨
    const resolveHost = async (hostname: string): Promise<HostResolution | null> =>
      hostname === "legacy.example.com"
        ? { hostname, addresses: [], cname: "old-bucket.s3.amazonaws.com" }
        : null;
    const takeoverProbe = async () => "<Error><Code>NoSuchBucket</Code></Error>";
    const scan = await enumerateSubdomains("example.com", tenant, parentId, {
      resolveHost,
      wordlist: ["www"], // www는 미존재(null)
      ctSource,
      takeoverProbe,
    });
    expect(scan.assets.map((a) => a.name)).toEqual(["legacy.example.com"]);
    expect(scan.findings).toHaveLength(1);
    const f = scan.findings[0]!;
    expect(f.severity).toBe("CRITICAL");
    expect(f.title).toContain("확증");
    expect((f.raw as { confirmed: boolean }).confirmed).toBe(true);
  });
});

describe("parseCrtShNames", () => {
  it("name_value(줄바꿈·와일드카드)에서 루트의 서브도메인만 추출·중복 제거한다", () => {
    const payload = [
      { name_value: "*.example.com\napi.example.com" },
      { name_value: "api.example.com" }, // 중복
      { name_value: "www.example.com" },
      { name_value: "other.org" }, // 타 도메인 제외
      { name_value: "example.com" }, // apex 제외
    ];
    expect(parseCrtShNames(payload, "example.com").sort()).toEqual([
      "api.example.com",
      "www.example.com",
    ]);
  });

  it("배열이 아니면 빈 결과", () => {
    expect(parseCrtShNames(null, "example.com")).toEqual([]);
    expect(parseCrtShNames({}, "example.com")).toEqual([]);
  });
});

describe("confirmTakeover", () => {
  it("미점유 지문이 본문에 있으면 true, 없거나 미지원 서비스면 false", () => {
    expect(confirmTakeover("AWS S3", "<Code>NoSuchBucket</Code>")).toBe(true);
    expect(confirmTakeover("AWS S3", "정상 페이지")).toBe(false);
    expect(confirmTakeover("Unknown SaaS", "NoSuchBucket")).toBe(false);
  });
});

describe("activeScanUrl (소유권 게이트)", () => {
  const htmlWithSecret = "<html><script>var k='AKIAIOSFODNN7EXAMPLE'</script></html>";
  const fetchImpl = (async () =>
    new Response(htmlWithSecret, {
      status: 200,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;

  it("소유권 미검증이면 능동 점검을 건너뛴다(수동 결과만)", async () => {
    const resolveTxt = async () => [["unrelated"]];
    const scan = await activeScanUrl("http://example.com", newId(), {
      fetchImpl,
      resolveTxt,
    });
    expect(scan.activeSkipped).toBe(true);
    expect(scan.ownership.verified).toBe(false);
    // 시크릿·서브도메인 finding은 없어야 한다
    expect(
      scan.findings.some((f) => f.sourceFindingId.startsWith("WEB-SECRET")),
    ).toBe(false);
    expect(scan.assets.every((a) => a.tags.source !== "subdomain-enum")).toBe(true);
  });

  it("소유권 검증되면 시크릿·서브도메인 능동 점검을 수행한다", async () => {
    const tenant = newId();
    const token = ownershipToken(tenant, "example.com");
    const resolveTxt = async () => [[token]];
    const resolveHost = async (hostname: string): Promise<HostResolution | null> =>
      hostname === "api.example.com"
        ? { hostname, addresses: ["1.2.3.4"], cname: null }
        : null;
    const scan = await activeScanUrl("http://example.com", tenant, {
      fetchImpl,
      resolveTxt,
      resolveHost,
      subdomainWordlist: ["api", "www"],
      ctSource: noCt,
    });
    expect(scan.activeSkipped).toBe(false);
    expect(
      scan.findings.some((f) => f.sourceFindingId.startsWith("WEB-SECRET-EXPOSED")),
    ).toBe(true);
    expect(scan.assets.some((a) => a.name === "api.example.com")).toBe(true);
  });
});
