import { describe, expect, it } from "vitest";
import { weeklySummaryEmail } from "@/domain/weekly-summary";

describe("resumo semanal", () => {
  const base = {
    name: "Ana <Souza>",
    weekStart: "2026-11-02",
    weekEnd: "2026-11-08",
    spentCents: 85_000,
    previousSpentCents: 100_000,
    topCategories: [{ name: "Mercado", cents: 40_000 }],
    upcoming: [{ date: "2026-11-10", label: "Aluguel", amountCents: -180_000 }],
    freeToSpendCents: 120_000,
    goals: [{ name: "Viagem", progressPct: 42.4 }],
    appUrl: "https://meubanqueiro.com",
  };

  it("compara com a semana anterior e lista o que vence", () => {
    const e = weeklySummaryEmail(base);
    expect(e.subject).toMatch(/^Sua semana: R\$\s850,00 em gastos \(02\/11 a 08\/11\)$/);
    expect(e.text).toMatch(/R\$\s150,00 a menos que na semana anterior/);
    expect(e.text).toMatch(/- 10\/11: Aluguel, R\$\s1\.800,00/);
    expect(e.text).toContain("- Viagem: 42%");
    expect(e.text).toContain("https://meubanqueiro.com/painel");
  });

  it("escapa o nome no HTML e omite a comparação sem semana anterior", () => {
    const e = weeklySummaryEmail({ ...base, name: "<b>X</b>", previousSpentCents: 0 });
    expect(e.html).toContain("&lt;b&gt;X&lt;/b&gt;");
    expect(e.html).not.toContain("<b>X</b>");
    expect(e.text).not.toContain("semana anterior");
  });
});
