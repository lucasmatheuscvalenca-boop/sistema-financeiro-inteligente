import { describe, expect, it } from "vitest";
import { pluggyDate } from "@/server/integrations/providers/pluggy";

describe("data dos lançamentos da Pluggy", () => {
  it("data pura ou meia-noite UTC vale o dia escrito", () => {
    expect(pluggyDate("2026-10-05")).toBe("2026-10-05");
    expect(pluggyDate("2026-10-05T00:00:00.000Z")).toBe("2026-10-05");
    expect(pluggyDate("2026-10-05T00:00:00Z")).toBe("2026-10-05");
    expect(pluggyDate("2026-10-05T00:00:00+00:00")).toBe("2026-10-05");
    // Sem fuso informado, é a hora local do banco: vale o dia escrito.
    expect(pluggyDate("2026-10-05T23:30:00")).toBe("2026-10-05");
  });

  it("com horário de verdade, o dia é o de Brasília", () => {
    // Pix às 23h30 de 05/10 em Brasília = 02h30 de 06/10 em UTC.
    expect(pluggyDate("2026-10-06T02:30:00.000Z")).toBe("2026-10-05");
    expect(pluggyDate("2026-10-05T03:00:00.000Z")).toBe("2026-10-05");
    expect(pluggyDate("2026-10-05T14:10:00.000Z")).toBe("2026-10-05");
    expect(pluggyDate("2026-10-05T22:00:00-03:00")).toBe("2026-10-05");
    expect(pluggyDate("2026-11-01T01:00:00.000Z")).toBe("2026-10-31");
  });
});
