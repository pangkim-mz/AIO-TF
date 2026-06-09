import { describe, it, expect, vi } from "vitest";
import { ApiClientError } from "../lib/api";
import {
  activeScanSummary,
  performIacScan,
  performNpmScan,
  performServiceScan,
  performVendorScan,
  performWebScan,
} from "../lib/scan";

describe("performNpmScan", () => {
  it("빈 입력은 호출 없이 에러 상태", async () => {
    const client = { scanNpm: vi.fn() };
    const state = await performNpmScan(client, { packageJson: "  " });
    expect(state.status).toBe("error");
    expect(client.scanNpm).not.toHaveBeenCalled();
  });

  it("성공 시 summary를 담은 success 상태", async () => {
    const summary = {
      assetCount: 2,
      relationshipCount: 1,
      findingCount: 3,
      topScore: 68,
    };
    const client = { scanNpm: vi.fn(async () => summary) };
    const state = await performNpmScan(client, { packageJson: "{}" });
    expect(state).toEqual({ status: "success", summary });
  });

  it("ApiClientError는 코드 포함 메시지로 변환", async () => {
    const client = {
      scanNpm: vi.fn(async () => {
        throw new ApiClientError("forbidden", "권한 없음", 403);
      }),
    };
    const state = await performNpmScan(client, { packageJson: "{}" });
    expect(state.status).toBe("error");
    expect(state.message).toContain("forbidden");
  });
});

describe("performVendorScan", () => {
  it("성공 시 success 상태", async () => {
    const summary = {
      assetCount: 1,
      relationshipCount: 0,
      findingCount: 1,
      topScore: 75,
    };
    const client = { scanVendor: vi.fn(async () => summary) };
    const state = await performVendorScan(client, "vendors: []");
    expect(state.status).toBe("success");
    expect(state.summary).toEqual(summary);
  });

  it("빈 입력은 에러", async () => {
    const client = { scanVendor: vi.fn() };
    const state = await performVendorScan(client, "");
    expect(state.status).toBe("error");
    expect(client.scanVendor).not.toHaveBeenCalled();
  });
});

describe("performIacScan", () => {
  it("성공 시 success 상태", async () => {
    const summary = {
      assetCount: 2,
      relationshipCount: 1,
      findingCount: 1,
      topScore: 68,
    };
    const client = { scanIac: vi.fn(async () => summary) };
    const state = await performIacScan(client, '{"planned_values":{}}', "prod");
    expect(state.status).toBe("success");
    expect(client.scanIac).toHaveBeenCalledWith({
      plan: '{"planned_values":{}}',
      stackName: "prod",
    });
  });

  it("빈 입력은 호출 없이 에러", async () => {
    const client = { scanIac: vi.fn() };
    const state = await performIacScan(client, "   ");
    expect(state.status).toBe("error");
    expect(client.scanIac).not.toHaveBeenCalled();
  });
});

describe("performWebScan", () => {
  const summary = { assetCount: 3, relationshipCount: 2, findingCount: 5, topScore: 58 };

  it("성공 시 summary를 담은 success 상태 (스킴 없는 URL도 허용, 기본 passive)", async () => {
    const client = { scanWeb: vi.fn(async () => summary) };
    const state = await performWebScan(client, "example.com");
    expect(state).toEqual({ status: "success", summary });
    expect(client.scanWeb).toHaveBeenCalledWith("example.com", false);
  });

  it("능동 점검 요청은 active=true로 호출하고, 미검증이면 안내 메시지를 단다", async () => {
    const skipped = {
      ...summary,
      ownershipVerified: false,
      activeSkipped: true,
      expectedToken: "omniguard-site-verification=abc",
    };
    const client = { scanWeb: vi.fn(async () => skipped) };
    const state = await performWebScan(client, "example.com", true);
    expect(client.scanWeb).toHaveBeenCalledWith("example.com", true);
    expect(state.status).toBe("success");
    expect(state.message).toContain("소유권 미검증");
    expect(state.message).toContain("omniguard-site-verification=abc");
  });

  it("유효하지 않은 URL은 호출 없이 에러", async () => {
    const client = { scanWeb: vi.fn() };
    const state = await performWebScan(client, "not a url");
    expect(state.status).toBe("error");
    expect(client.scanWeb).not.toHaveBeenCalled();
  });

  it("빈 입력은 호출 없이 에러", async () => {
    const client = { scanWeb: vi.fn() };
    const state = await performWebScan(client, "   ");
    expect(state.status).toBe("error");
    expect(client.scanWeb).not.toHaveBeenCalled();
  });
});

describe("activeScanSummary", () => {
  const base = { assetCount: 5, relationshipCount: 4, findingCount: 6, topScore: 90 };

  it("검증된 능동 점검은 분해 요약 문구를 만든다", () => {
    const text = activeScanSummary({
      ...base,
      ownershipVerified: true,
      subdomainCount: 3,
      takeoverCount: 1,
      secretCount: 2,
    });
    expect(text).toBe("능동 점검 수행됨 — 서브도메인 3 · 탈취 후보 1 · 노출 시크릿 2");
  });

  it("미검증/비능동(ownershipVerified가 true 아님)이면 null", () => {
    expect(activeScanSummary({ ...base })).toBeNull();
    expect(activeScanSummary({ ...base, ownershipVerified: false })).toBeNull();
  });
});

describe("performServiceScan", () => {
  it("성공 시 연결 요약 메시지를 담은 success 상태", async () => {
    const client = {
      scanService: vi.fn(async () => ({
        serviceCount: 1,
        edgeCount: 3,
        unresolved: [],
      })),
    };
    const state = await performServiceScan(client, "services: []");
    expect(state.status).toBe("success");
    expect(state.message).toContain("교차 엣지 3개");
  });

  it("미해결 참조가 있으면 메시지에 표기", async () => {
    const client = {
      scanService: vi.fn(async () => ({
        serviceCount: 1,
        edgeCount: 1,
        unresolved: ["x"],
      })),
    };
    const state = await performServiceScan(client, "services: []");
    expect(state.message).toContain("미해결 1건");
  });
});
