import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { newId } from "@omniguard/schema";
import { hashToken, type StoredToken, type TokenStore } from "../src/index";

function makeToken(raw: string, tenantId: string, role: string): StoredToken {
  return { tokenHash: hashToken(raw), tenantId, role, label: raw };
}

/** 어댑터 무관 TokenStore 계약. 메모리/Postgres에 동일하게 적용한다. */
export function tokenStoreContract(
  name: string,
  makeStore: () => Promise<TokenStore>,
): void {
  describe(`TokenStore 계약: ${name}`, () => {
    let store: TokenStore;
    beforeEach(async () => {
      store = await makeStore();
    });
    afterEach(async () => {
      await store.close();
    });

    it("upsert 후 해시로 조회된다", async () => {
      const raw = `tok-${newId()}`;
      const tenant = newId();
      await store.upsertToken(makeToken(raw, tenant, "admin"));

      const found = await store.findByHash(hashToken(raw));
      expect(found).not.toBeNull();
      expect(found!.tenantId).toBe(tenant);
      expect(found!.role).toBe("admin");
    });

    it("없는 해시는 null", async () => {
      expect(await store.findByHash(hashToken(`nope-${newId()}`))).toBeNull();
    });

    it("동일 해시 재upsert는 테넌트/역할을 갱신한다", async () => {
      const raw = `tok-${newId()}`;
      await store.upsertToken(makeToken(raw, newId(), "viewer"));
      const tenant = newId();
      await store.upsertToken(makeToken(raw, tenant, "analyst"));

      const found = await store.findByHash(hashToken(raw));
      expect(found!.tenantId).toBe(tenant);
      expect(found!.role).toBe("analyst");
    });

    it("listByTenant는 해당 테넌트 토큰만 반환한다", async () => {
      const tenantA = newId();
      const tenantB = newId();
      await store.upsertToken(makeToken(`a1-${newId()}`, tenantA, "admin"));
      await store.upsertToken(makeToken(`a2-${newId()}`, tenantA, "viewer"));
      await store.upsertToken(makeToken(`b1-${newId()}`, tenantB, "analyst"));

      const listA = await store.listByTenant(tenantA);
      expect(listA).toHaveLength(2);
      expect(listA.every((token) => token.tenantId === tenantA)).toBe(true);
      expect(await store.listByTenant(tenantB)).toHaveLength(1);
    });

    it("deleteToken은 폐기하고 이후 조회는 null", async () => {
      const raw = `tok-${newId()}`;
      await store.upsertToken(makeToken(raw, newId(), "admin"));

      expect(await store.deleteToken(hashToken(raw))).toBe(true);
      expect(await store.findByHash(hashToken(raw))).toBeNull();
      expect(await store.deleteToken(hashToken(raw))).toBe(false); // 멱등
    });
  });
}
