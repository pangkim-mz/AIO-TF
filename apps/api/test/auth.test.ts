import { describe, it, expect } from "vitest";
import { newId } from "@omniguard/schema";
import { InMemoryTokenStore, hashToken } from "@omniguard/storage";
import { DbAuthProvider } from "../src/auth";

async function storeWith(raw: string, role: string) {
  const store = new InMemoryTokenStore();
  const tenantId = newId();
  await store.upsertToken({ tokenHash: hashToken(raw), tenantId, role, label: "" });
  return { store, tenantId };
}

describe("DbAuthProvider", () => {
  it("유효 토큰 → Principal(테넌트/역할) 해석", async () => {
    const { store, tenantId } = await storeWith("secret-token", "analyst");
    const principal = await new DbAuthProvider(store).authenticate("secret-token");
    expect(principal).toEqual({ tenantId, role: "analyst" });
  });

  it("등록되지 않은 토큰 → null", async () => {
    const { store } = await storeWith("secret-token", "admin");
    expect(await new DbAuthProvider(store).authenticate("wrong")).toBeNull();
  });

  it("DB에 알 수 없는 역할이면 인증 거부(null)", async () => {
    const { store } = await storeWith("secret-token", "superadmin");
    expect(await new DbAuthProvider(store).authenticate("secret-token")).toBeNull();
  });
});
