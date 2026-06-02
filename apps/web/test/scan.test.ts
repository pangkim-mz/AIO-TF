import { describe, it, expect, vi } from "vitest";
import { ApiClientError } from "../lib/api";
import {
  performIacScan,
  performNpmScan,
  performServiceScan,
  performVendorScan,
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
