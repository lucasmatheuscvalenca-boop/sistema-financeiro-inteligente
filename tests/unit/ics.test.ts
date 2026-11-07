import { describe, expect, it } from "vitest";
import { buildIcs } from "@/domain/ics";

describe("calendário (.ics)", () => {
  const now = new Date("2026-11-07T12:00:00Z");
  it("gera eventos de dia inteiro com lembrete na véspera", () => {
    const ics = buildIcs([{ date: "2026-11-15", title: "Pagar: Aluguel · R$ 1.800,00", description: "conta; prevista" }], { now, calendarName: "Meu Banqueiro", domain: "meubanqueiro.com" });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261115\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20261116\r\n");
    expect(ics).toContain("SUMMARY:Pagar: Aluguel · R$ 1.800\\,00\r\n");
    expect(ics).toContain("DESCRIPTION:conta\; prevista\r\n");
    expect(ics).toContain("TRIGGER:-PT15H");
    expect(ics).toContain("DTSTAMP:20261107T120000Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("UID estável e sem colisão para eventos iguais no mesmo dia", () => {
    const e = { date: "2026-11-15", title: "Pagar: Luz · R$ 120,00" };
    const a = buildIcs([e, e], { now, calendarName: "x", domain: "d" });
    const uids = a.match(/UID:[^\r]+/g)!;
    expect(uids).toHaveLength(2);
    expect(new Set(uids).size).toBe(2);
    expect(buildIcs([e], { now, calendarName: "x", domain: "d" }).match(/UID:[^\r]+/)![0]).toBe(uids[0]);
  });

  it("dobra linhas longas em até 75 bytes", () => {
    const ics = buildIcs([{ date: "2026-11-15", title: "Á".repeat(80) }], { now, calendarName: "x", domain: "d" });
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
});
