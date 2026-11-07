import { describe, expect, it } from "vitest";
import { pgErrorCode, sanitizeClaims, type VerifiedClaims } from "../src";

const sub = "0b6f3e0e-8d0a-4d8c-9b6a-6f0a1c2b3d4e";

describe("sanitizeClaims", () => {
  it("mantém só campos conhecidos", () => {
    const out = sanitizeClaims({ sub, role: "authenticated", email: "a@b.c", extra: "x" } as VerifiedClaims);
    expect(out).toEqual({ sub, role: "authenticated", email: "a@b.c" });
  });
  it("recusa papel diferente de authenticated (ex.: service_role ou anon)", () => {
    expect(() => sanitizeClaims({ sub, role: "service_role" } as unknown as VerifiedClaims)).toThrow();
    expect(() => sanitizeClaims({ sub, role: "anon" } as unknown as VerifiedClaims)).toThrow();
  });
  it("recusa sub que não é uuid (evita injeção na configuração da sessão)", () => {
    expect(() => sanitizeClaims({ sub: "'; drop table x; --", role: "authenticated" })).toThrow();
  });
});

describe("pgErrorCode", () => {
  it("encontra o código mesmo embrulhado em cause", () => {
    expect(pgErrorCode({ message: "Failed query", cause: { code: "42501" } })).toBe("42501");
    expect(pgErrorCode(new Error("x"))).toBeUndefined();
  });
});
