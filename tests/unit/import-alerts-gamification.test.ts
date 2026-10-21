import { describe, expect, it } from "vitest";
import { generateAlerts, throttleAlerts } from "@/domain/alerts";
import { evaluateReserve } from "@/domain/emergency";
import { evaluateAchievements, reviewStreakWeeks, weekStart, weeklyMissions } from "@/domain/gamification";
import { parseCsv, parseCsvText, suggestMapping } from "@/domain/import/csv";
import { dedupeRows, fingerprintKey } from "@/domain/import/dedupe";
import { parseOfx } from "@/domain/import/ofx";
import { MASCOT_IDS, MASCOTS, isMascotId } from "@/mascots/catalog";
import { voiceFor } from "@/mascots/voice";

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>0341<ACCTID>12345-6</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000[-3:BRT]<TRNAMT>-45.90<FITID>A1<MEMO>PADARIA &amp; CIA</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261005<TRNAMT>5000.00<FITID>A2<NAME>SALARIO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261006<TRNAMT>-120,00<FITID>A3<MEMO>FARMACIA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>xx<TRNAMT>-1.00<FITID>A4</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>4834.10<DTASOF>20261006</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("importação OFX", () => {
  it("lê OFX SGML de banco brasileiro", () => {
    const r = parseOfx(OFX_SGML);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({ date: "2026-10-03", amountCents: -4590, externalId: "A1", description: "PADARIA & CIA" });
    expect(r.rows[1]!.amountCents).toBe(500000);
    expect(r.rows[2]!.amountCents).toBe(-12000);
    expect(r.errors).toHaveLength(1);
    expect(r.meta).toMatchObject({ currency: "BRL", bankId: "0341", accountId: "12345-6", ledgerBalance: "4834.10", statementType: "bank" });
  });

  it("rejeita arquivo que não é OFX", () => {
    expect(parseOfx("data;valor").errors[0]!.message).toContain("OFX");
  });
});

describe("importação CSV", () => {
  it("detecta separador, cabeçalho e formatos brasileiros", () => {
    const csv = 'Data;Descrição;Valor\n03/10/2026;"Mercado; filial 2";-1.234,56\n05/10/2026;Salário;5.000,00\n';
    expect(parseCsvText(csv)[1]).toEqual(["03/10/2026", "Mercado; filial 2", "-1.234,56"]);
    const r = parseCsv(csv);
    expect(r.rows.map((x) => x.amountCents)).toEqual([-123456, 500000]);
    expect(r.rows[0]!.description).toBe("Mercado; filial 2");
  });

  it("aceita colunas separadas de débito e crédito", () => {
    const csv = "data,historico,debito,credito\n2026-10-01,Aluguel,1500.00,\n2026-10-05,Salario,,5000.00\n";
    const mapping = suggestMapping(parseCsvText(csv))!;
    expect(mapping.debitColumn).toBe(2);
    const r = parseCsv(csv, mapping);
    expect(r.rows.map((x) => x.amountCents)).toEqual([-150000, 500000]);
  });

  it("reporta linhas inválidas sem abortar", () => {
    const r = parseCsv("Data;Descrição;Valor\n99/99/2026;X;10\n01/10/2026;Y;abc\n02/10/2026;Z;10,00\n");
    expect(r.rows).toHaveLength(1);
    expect(r.errors).toHaveLength(2);
  });
});

describe("duplicidade e conciliação", () => {
  const rows = [
    { date: "2026-10-03", description: "Padaria", amountCents: -4590, externalId: "A1", rawIndex: 1 },
    { date: "2026-10-03", description: "Café", amountCents: -800, externalId: null, rawIndex: 2 },
    { date: "2026-10-03", description: "Café", amountCents: -800, externalId: null, rawIndex: 3 },
    { date: "2026-10-06", description: "Conta de luz CEMIG", amountCents: -18000, externalId: null, rawIndex: 4 },
    { date: "2026-10-07", description: "Uber", amountCents: -2500, externalId: "A1", rawIndex: 5 },
  ];

  it("importa novo, ignora duplicado por FITID e por impressão digital contando ocorrências", () => {
    const existing = [
      { id: "e1", date: "2026-10-03", description: "Padaria", amountCents: -4590, externalId: "A1" },
      { id: "e2", date: "2026-10-03", description: "café", amountCents: -800, fingerprint: fingerprintKey({ date: "2026-10-03", description: "Café", amountCents: -800 }) },
      { id: "e3", date: "2026-10-05", description: "Luz", amountCents: -18000 },
    ];
    const decisions = dedupeRows(rows, existing);
    expect(decisions.map((d) => d.action)).toEqual(["duplicate", "duplicate", "import", "match", "duplicate"]);
    expect(decisions[0]).toMatchObject({ reason: "external_id", existingId: "e1" });
    expect(decisions[3]).toMatchObject({ existingId: "e3" });
    expect(decisions[4]).toMatchObject({ reason: "in_file" });
  });

  it("reimportar o mesmo arquivo não cria nada novo", () => {
    const first = dedupeRows(rows.slice(0, 4), []);
    const existing = first
      .filter((d) => d.action === "import")
      .map((d, i) => ({ id: `n${i}`, date: d.row.date, description: d.row.description, amountCents: d.row.amountCents, externalId: d.row.externalId, fingerprint: d.fingerprint }));
    const second = dedupeRows(rows.slice(0, 4), existing);
    expect(second.every((d) => d.action === "duplicate")).toBe(true);
  });
});

describe("alertas", () => {
  it("gera alertas com causa, impacto e ação, do mais grave ao menos grave", () => {
    const alerts = generateAlerts({
      today: "2026-10-21",
      availableCents: 10000,
      cashFlow: { firstNegativeConfirmed: "2026-10-28", lowestBalanceCents: -50000, lowestDate: "2026-10-30" },
      categorySpending: [{ categoryId: "delivery", name: "Delivery", currentCents: 60000, averageCents: 20000 }],
      upcomingBills: [{ id: "b1", date: "2026-10-22", label: "Internet", amountCents: 12000 }],
      reserve: evaluateReserve({ currentCents: 50000, monthlyEssentialCents: 300000, targetMonths: 6, today: "2026-10-21" }),
      recurringChanges: [{ id: "r1", name: "Streaming", previousCents: 3990, currentCents: 4990 }],
      retirementPlanUpdatedAt: "2025-01-01",
      lastDataUpdate: "2026-10-01",
    });
    const types = alerts.map((a) => a.type);
    expect(types).toContain("negative_balance_risk");
    expect(types).toContain("unusual_spending");
    expect(types).toContain("recurring_increase");
    expect(types).toContain("review_premises");
    expect(types).toContain("stale_data");
    expect(alerts[0]!.severity).toBe("important");
    for (const a of alerts) {
      expect(a.cause.length).toBeGreaterThan(5);
      expect(a.impact.length).toBeGreaterThan(5);
      expect(a.action.length).toBeGreaterThan(5);
    }
    const bill = alerts.find((a) => a.type === "bill_due_soon")!;
    expect(bill.severity).toBe("important"); // saldo de 100 não cobre a conta de 120
    expect(new Set(alerts.map((a) => a.fingerprint)).size).toBe(alerts.length);
  });

  it("limita a quantidade por dia mantendo os importantes", () => {
    const alerts = generateAlerts({
      today: "2026-10-21",
      availableCents: 0,
      cashFlow: { firstNegativeConfirmed: "2026-10-28", lowestBalanceCents: -1, lowestDate: "2026-10-28" },
      lastDataUpdate: "2026-01-01",
      retirementPlanUpdatedAt: "2020-01-01",
    });
    const limited = throttleAlerts(alerts, 1);
    expect(limited).toHaveLength(1);
    expect(limited[0]!.type).toBe("negative_balance_risk");
  });
});

describe("gamificação", () => {
  it("sequência semanal de revisões", () => {
    expect(weekStart("2026-10-21")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    // semana atual ainda sem revisão não quebra a sequência
    expect(reviewStreakWeeks(["2026-10-13", "2026-10-06", "2026-09-29"], "2026-10-21")).toBe(3);
    expect(reviewStreakWeeks(["2026-10-20", "2026-10-13", "2026-09-29"], "2026-10-21")).toBe(2);
    expect(reviewStreakWeeks([], "2026-10-21")).toBe(0);
  });

  it("conquistas só premiam bons hábitos", () => {
    const codes = evaluateAchievements({
      briefingComplete: true,
      accounts: 2,
      budgets: 0,
      goals: 1,
      contributions: 3,
      maxGoalProgressPct: 55,
      goalsCompleted: 0,
      reserveCoverageMonths: 3.2,
      reserveComplete: false,
      reviewStreakWeeks: 4,
      budgetKeptLastMonth: false,
      imports: 0,
      hasRetirementPlan: false,
      challengesCompleted: 0,
    });
    expect(codes).toEqual(["briefing_complete", "first_account", "first_goal", "first_contribution", "goal_25", "goal_50", "reserve_1m", "reserve_3m", "review_streak_4"]);
  });

  it("missões semanais", () => {
    const missions = weeklyMissions({
      today: "2026-10-21",
      reviewedThisWeek: false,
      uncategorizedCount: 4,
      contributionsThisWeek: 1,
      activeGoals: 2,
      budgets: 1,
      pendingScheduledPast: 0,
      activeChallenges: 0,
    });
    expect(missions.map((m) => [m.code, m.done])).toEqual([
      ["weekly_review", false],
      ["categorize", false],
      ["contribute", true],
    ]);
  });
});

describe("mascotes", () => {
  it("catálogo tem exatamente os seis personagens oficiais", () => {
    expect(MASCOT_IDS).toEqual(["lince", "capivara", "coruja", "polvo", "raposa", "guardiao"]);
    expect(Object.keys(MASCOTS)).toHaveLength(6);
    expect(MASCOTS.lince.catchphrase).toBe("Vamos tomar decisões melhores hoje para conquistar mais liberdade amanhã.");
    expect(MASCOTS.guardiao.title).toBe("O Consultor Digital");
  });

  it("rejeita identificadores inválidos", () => {
    expect(isMascotId("lince")).toBe(true);
    expect(isMascotId("dragao")).toBe(false);
    expect(isMascotId("LINCE")).toBe(false);
    expect(isMascotId(undefined)).toBe(false);
  });

  it("a voz dos mascotes não contém valores financeiros", () => {
    for (const id of MASCOT_IDS) {
      const v = voiceFor(id);
      for (const tone of ["positive", "neutral", "caution", "critical", "unknown"] as const) {
        for (const text of [v.headline(tone), v.opening(tone), v.closing(tone)]) {
          expect(text).not.toMatch(/R\$|\d/);
        }
      }
      expect(v.welcome("Ana")).toContain("Ana");
    }
  });
});
