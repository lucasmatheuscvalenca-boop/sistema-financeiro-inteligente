import { describe, expect, it } from "vitest";
import { localRedirect } from "./local-redirect";
import { safeNext } from "./safe-next";

describe("safeNext (evita redirecionamento aberto)", () => {
  it("aceita caminhos internos", () => {
    expect(safeNext("/w/abc/agentes")).toBe("/w/abc/agentes");
  });
  it.each(["https://malicioso.com", "//malicioso.com", "/\\malicioso.com", "javascript:alert(1)", "", null, 42])(
    "recusa %s",
    (value) => {
      expect(safeNext(value)).toBe("/inicio");
    },
  );
});

describe("localRedirect", () => {
  it("usa Location relativo (o navegador resolve no próprio host)", () => {
    const res = localRedirect("/entrar?erro=x");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/entrar?erro=x");
  });
  it("recusa destinos externos", () => {
    expect(() => localRedirect("https://x.com")).toThrow();
    expect(() => localRedirect("//x.com")).toThrow();
  });
});
