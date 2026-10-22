import { describe, expect, it } from "vitest";
import { databaseEnvPrefix, databaseUrl, explicitSslMode } from "@/server/db/connection";

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

  it("deixa explícito o modo SSL que o driver já aplica (verify-full)", () => {
    expect(databaseUrl("pooled", { DATABASE_URL: "postgres://u@h/db?sslmode=require&channel_binding=require" })).toBe("postgres://u@h/db?sslmode=verify-full&channel_binding=require");
    expect(explicitSslMode("postgres://u@h/db?channel_binding=require&sslmode=prefer")).toBe("postgres://u@h/db?channel_binding=require&sslmode=verify-full");
    expect(explicitSslMode("postgres://u@h/db?sslmode=disable")).toBe("postgres://u@h/db?sslmode=disable");
    expect(explicitSslMode("postgres://u@h/db?uselibpqcompat=true&sslmode=require")).toBe("postgres://u@h/db?uselibpqcompat=true&sslmode=require");
    expect(explicitSslMode("postgres://u@h/db")).toBe("postgres://u@h/db");
  });

  it("recusa prefixos inválidos", () => {
    expect(() => databaseEnvPrefix({ DATABASE_ENV_PREFIX: "novo-" })).toThrow();
    expect(databaseEnvPrefix({})).toBe("");
  });
});
