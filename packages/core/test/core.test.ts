import { describe, expect, it } from "vitest";
import {
  AGENT_STATUSES,
  NAV_MODULES,
  canManage,
  canWrite,
  createCategorySchema,
  isActiveStatus,
  isEmailAllowed,
  parseAllowedEmails,
  signUpSchema,
  visualBehaviorFor,
  workspaceNameSchema,
} from "../src";

describe("papéis", () => {
  it("owner e admin gerenciam; viewer não escreve", () => {
    expect(canManage("owner")).toBe(true);
    expect(canManage("admin")).toBe(true);
    expect(canManage("member")).toBe(false);
    expect(canWrite("member")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
  });
});

describe("estados de agente", () => {
  it("cobre os 8 estados do enunciado", () => {
    expect(AGENT_STATUSES).toHaveLength(8);
  });
  it("só planning/working são trabalho ativo", () => {
    expect(AGENT_STATUSES.filter(isActiveStatus)).toEqual(["planning", "working"]);
  });
  it("comportamento visual deriva do estado", () => {
    expect(visualBehaviorFor("working")).toBe("at_desk");
    expect(visualBehaviorFor("working", "meeting")).toBe("in_meeting");
    expect(visualBehaviorFor("waiting_approval")).toBe("blocked");
    expect(visualBehaviorFor("available")).toBe("idle");
    expect(visualBehaviorFor("done")).toBe("presenting");
  });
});

describe("navegação", () => {
  it("tem os 11 módulos pedidos, com chaves únicas", () => {
    expect(NAV_MODULES).toHaveLength(11);
    expect(new Set(NAV_MODULES.map((m) => m.key)).size).toBe(11);
  });
});

describe("validação", () => {
  it("normaliza espaços e limita tamanho do nome do workspace", () => {
    expect(workspaceNameSchema.parse("  Explosion   Digital ")).toBe("Explosion Digital");
    expect(workspaceNameSchema.safeParse("   ").success).toBe(false);
    expect(workspaceNameSchema.safeParse("x".repeat(81)).success).toBe(false);
  });

  it("categoria exige workspace uuid e nome; descrição vazia vira null", () => {
    const ok = createCategorySchema.parse({
      workspaceId: "0b6f3e0e-8d0a-4d8c-9b6a-6f0a1c2b3d4e",
      name: " Viagens ",
      description: "  ",
    });
    expect(ok).toEqual({ workspaceId: "0b6f3e0e-8d0a-4d8c-9b6a-6f0a1c2b3d4e", name: "Viagens", description: null });
    expect(createCategorySchema.safeParse({ workspaceId: "x", name: "a" }).success).toBe(false);
  });

  it("cadastro exige senha de 10+ caracteres e e-mail válido", () => {
    expect(signUpSchema.safeParse({ displayName: "Lucas", email: "a@b.co", password: "curta" }).success).toBe(false);
    const parsed = signUpSchema.parse({ displayName: "Lucas", email: " A@B.CO ", password: "senha-longa-ok" });
    expect(parsed.email).toBe("a@b.co");
  });
});

describe("lista de e-mails permitidos", () => {
  it("vazia libera; preenchida restringe sem diferenciar maiúsculas", () => {
    expect(isEmailAllowed("x@y.z", parseAllowedEmails(undefined))).toBe(true);
    const allowed = parseAllowedEmails("Dono@Exemplo.com, outro@exemplo.com");
    expect(isEmailAllowed("dono@exemplo.com", allowed)).toBe(true);
    expect(isEmailAllowed("intruso@exemplo.com", allowed)).toBe(false);
    expect(isEmailAllowed(null, allowed)).toBe(false);
  });
});
