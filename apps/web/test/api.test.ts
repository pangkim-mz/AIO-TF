import { describe, it, expect, vi } from "vitest";
import { ApiClient, ApiClientError } from "../lib/api";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function client(fetchImpl: typeof fetch): ApiClient {
  return new ApiClient({ baseUrl: "http://api/", token: "t", fetchImpl });
}

describe("ApiClient", () => {
  it("envelope의 data를 언래핑한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, data: [{ id: "a" }] }),
    ) as unknown as typeof fetch;

    const assets = await client(fetchImpl).getAssets();
    expect(assets).toEqual([{ id: "a" }]);
  });

  it("Bearer 토큰과 base URL을 정규화해 호출한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, data: [] }),
    ) as unknown as typeof fetch;

    await client(fetchImpl).getFindings();
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(url).toBe("http://api/v1/findings"); // 끝 슬래시 정규화
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer t",
    );
  });

  it("ok=false면 ApiClientError를 던진다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: false, error: { code: "forbidden", message: "no" } }, 403),
    ) as unknown as typeof fetch;

    await expect(client(fetchImpl).getImpact()).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    });
    await expect(client(fetchImpl).getImpact()).rejects.toBeInstanceOf(
      ApiClientError,
    );
  });

  it("scanNpm은 POST로 큐에 넣고(jobId) 작업 완료까지 폴링해 결과를 반환한다", async () => {
    // 1) POST → 202 {jobId} 2) GET /v1/jobs/j1 → succeeded + result
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse({ ok: true, data: { jobId: "j1", status: "queued" } }, 202);
      }
      return jsonResponse({
        ok: true,
        data: { id: "j1", type: "npm", status: "succeeded", result: { assetCount: 2 }, error: null },
      });
    }) as unknown as typeof fetch;

    const summary = await client(fetchImpl).scanNpm({ packageJson: "{}" });
    expect(summary).toEqual({ assetCount: 2 });

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [postUrl, postInit] = calls[0];
    expect(postUrl).toBe("http://api/v1/scans/npm");
    expect(postInit.method).toBe("POST");
    expect(JSON.parse(postInit.body as string)).toEqual({ packageJson: "{}" });
    // 이어서 작업 상태를 폴링한다
    expect(calls[1][0]).toBe("http://api/v1/jobs/j1");
  });

  it("작업이 failed면 scanVendor가 ApiClientError를 던진다", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return jsonResponse({ ok: true, data: { jobId: "j2", status: "queued" } }, 202);
      }
      return jsonResponse({
        ok: true,
        data: { id: "j2", type: "vendor", status: "failed", result: null, error: "파싱 실패" },
      });
    }) as unknown as typeof fetch;

    await expect(client(fetchImpl).scanVendor("bad")).rejects.toMatchObject({
      code: "scan_failed",
      message: "파싱 실패",
    });
  });
});
