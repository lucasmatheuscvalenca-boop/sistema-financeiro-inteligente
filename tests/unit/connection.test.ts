import { describe, expect, it } from "vitest";
import { databaseEnvPrefix, databaseUrl } from "@/server/db/connection";

describe("conexão com o banco por prefixo", () => {
  const env = {
    DATABASE_URL: "postgres://antigo-pool/db",
    DATABASE_URL_UNPOOLED: "postgres://antigo-direto/db",
    NOVO_DATABASE_URL: "postgres://novo-pool/db",
    NOVO_DATABASE_URL_UNPOOLED: "postgres://novo-direto/db",
  };

  it("sem prefixo usa DATABASE_URL (pool) e DATABASE_URL_UNPOOLED (direta)", () => {
    expect(databaseUrl("pooled", env)).toBe("postgres://antigo-pool/db");
    expect(databaseUrl("direct", env)).toBe("postgres://antigo-direto/db");
  });

  it("DATABASE_ENV_PREFIX troca para as variáveis da integração sem copiar credenciais", () => {
    const e = { ...env, DATABASE_ENV_PREFIX: "NOVO_" };
    expect(databaseUrl("pooled", e)).toBe("postgres://novo-pool/db");
    expect(databaseUrl("direct", e)).toBe("postgres://novo-direto/db");
  });

  it("aceita os nomes alternativos da integração e cai para a conexão com pool", () => {
    expect(databaseUrl("direct", { X_POSTGRES_URL_NON_POOLING: "d", X_DATABASE_URL: "p" }, "X_")).toBe("d");
    expect(databaseUrl("direct", { X_DATABASE_URL: "p" }, "X_")).toBe("p");
    expect(databaseUrl("pooled", { X_POSTGRES_URL: "p2" }, "X_")).toBe("p2");
  });

  it("recusa prefixos inválidos", () => {
    expect(() => databaseEnvPrefix({ DATABASE_ENV_PREFIX: "novo-" })).toThrow();
    expect(databaseEnvPrefix({})).toBe("");
  });
});
