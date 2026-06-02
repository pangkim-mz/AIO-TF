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

  it("scanNpm은 POST 본문을 직렬화한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, data: { assetCount: 2 } }),
    ) as unknown as typeof fetch;

    await client(fetchImpl).scanNpm({ packageJson: "{}" });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ packageJson: "{}" });
  });
});
