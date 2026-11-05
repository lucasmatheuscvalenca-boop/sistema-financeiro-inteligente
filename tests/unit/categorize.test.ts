import { describe, expect, it } from "vitest";
import { categoryFromBank, detectSubscriptions, merchantKey, prettyMerchant, suggestCategory, topMerchants } from "@/domain/categorize";
import { addBusinessDays, isWeekend, weekdayName } from "@/domain/dates";

describe("categorização automática pela descrição", () => {
  it("reconhece os estabelecimentos mais comuns do extrato brasileiro", () => {
    const cases: Array<[string, string, string | undefined]> = [
      ["UBER *TRIP HELP.UBER.COM", "Transporte", "Aplicativos"],
      ["99POP *VIAGEM 03/11", "Transporte", "Aplicativos"],
      ["POSTO SHELL JARDINS", "Transporte", "Combustível"],
      ["IFD*IFOOD CLUB", "Restaurantes e delivery", undefined],
      ["MCDONALDS SP 0432", "Restaurantes e delivery", undefined],
      ["PADARIA CENTRAL", "Restaurantes e delivery", undefined],
      ["SUPERMERCADO EXTRA 1234", "Mercado", undefined],
      ["Compra no débito - CARREFOUR BAIRRO", "Mercado", undefined],
      ["NETFLIX.COM", "Assinaturas", undefined],
      ["SPOTIFY BR", "Assinaturas", undefined],
      ["APPLE.COM/BILL", "Assinaturas", undefined],
      ["ENEL DISTRIBUICAO SP", "Contas da casa", "Energia"],
      ["SABESP", "Contas da casa", "Água"],
      ["VIVO FIBRA", "Contas da casa", "Internet e telefone"],
      ["DROGASIL 0432", "Saúde", "Farmácia"],
      ["SMART FIT PAULISTA", "Saúde", undefined],
      ["ALUGUEL IMOBILIARIA LOPES", "Moradia", "Aluguel"],
      ["CONDOMINIO ED SOLAR", "Moradia", "Condomínio"],
      ["AMAZON MARKETPLACE", "Compras", undefined],
      ["MERCADOLIVRE*TECH", "Compras", undefined],
      ["CINEMARK SHOPPING", "Lazer", undefined],
      ["LATAM AIRLINES", "Viagens", undefined],
      ["PETZ CENTRO", "Pets", undefined],
      ["IPTU PREFEITURA", "Impostos e taxas", undefined],
    ];
    for (const [desc, cat, sub] of cases) {
      expect(suggestCategory(desc, "expense"), desc).toEqual(sub ? { category: cat, sub } : { category: cat, sub: undefined });
    }
    expect(suggestCategory("PIX ENVIADO MARIA S", "expense")).toBeNull();
  });

  it("receitas: salário, comissão e rendimentos", () => {
    expect(suggestCategory("SALARIO EMPRESA XYZ", "income")?.category).toBe("Salário");
    expect(suggestCategory("COMISSAO OUTUBRO", "income")?.category).toBe("Comissões");
    expect(suggestCategory("RENDIMENTO CDB", "income")?.category).toBe("Rendimentos");
    expect(suggestCategory("Transferência recebida pelo Pix - FULANO", "income")).toBeNull();
    // Uma regra de despesa nunca classifica receita.
    expect(suggestCategory("NETFLIX.COM", "income")).toBeNull();
  });

  it("categoria vinda do banco (Open Finance) é traduzida", () => {
    expect(categoryFromBank("Groceries")).toEqual({ category: "Mercado" });
    expect(categoryFromBank("Taxi and ride-hailing")).toEqual({ category: "Transporte", sub: "Aplicativos" });
    expect(categoryFromBank("Transporte")).toEqual({ category: "Transporte" });
    expect(categoryFromBank("Subscriptions")).toEqual({ category: "Assinaturas" });
    expect(categoryFromBank("Something else")).toBeNull();
    expect(categoryFromBank(null)).toBeNull();
  });

  it("chave do estabelecimento ignora números, datas e palavras de ligação", () => {
    expect(merchantKey("UBER *TRIP HELP.UBER.COM 03/11")).toBe("uber trip");
    expect(merchantKey("Compra no débito - PADARIA CENTRAL 0432")).toBe("padaria central");
    expect(merchantKey("PIX ENVIADO - MARIA S")).toBe("maria");
    expect(merchantKey("IFD*IFOOD CLUB")).toBe("ifd ifood");
    expect(prettyMerchant("IFD*IFOOD CLUB 03/11")).toBe("Ifd Ifood Club");
  });
});

describe("assinaturas e maiores gastos", () => {
  const tx = (id: string, date: string, description: string, amountCents: number) => ({ id, date, description, amountCents });
  it("detecta cobranças mensais do mesmo lugar com valor parecido", () => {
    const list = [
      tx("1", "2026-08-14", "NETFLIX.COM", 5590),
      tx("2", "2026-09-14", "NETFLIX.COM", 5590),
      tx("3", "2026-10-14", "NETFLIX.COM", 5990),
      tx("4", "2026-09-02", "SPOTIFY BR", 2190),
      tx("5", "2026-10-02", "SPOTIFY BR", 2190),
      tx("6", "2026-10-05", "SUPERMERCADO EXTRA", 49750),
      tx("7", "2026-10-19", "SUPERMERCADO EXTRA", 21030),
      tx("8", "2026-10-20", "UBER *TRIP", 2390),
    ];
    const subs = detectSubscriptions(list);
    expect(subs.map((x) => [x.name, x.amountCents, x.day, x.occurrences])).toEqual([
      ["Netflix", 5990, 14, 3],
      ["Spotify", 2190, 2, 2],
    ]);
    expect(topMerchants(list, 2).map((m) => [m.name, m.cents, m.count])).toEqual([
      ["Supermercado Extra", 70780, 2],
      ["Netflix", 17170, 3],
    ]);
  });
});

describe("dias úteis", () => {
  it("pula fins de semana", () => {
    expect(isWeekend("2026-11-07")).toBe(true); // sábado
    expect(isWeekend("2026-11-09")).toBe(false);
    expect(addBusinessDays("2026-11-04", 7)).toBe("2026-11-13");
    expect(addBusinessDays("2026-11-06", 1)).toBe("2026-11-09");
    expect(weekdayName("2026-11-05")).toBe("quinta-feira");
  });
});
